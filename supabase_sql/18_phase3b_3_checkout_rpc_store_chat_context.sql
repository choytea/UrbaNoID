-- ============================================================
-- UrbaNoiD Supabase Native
-- PHASE 3B.3: Buyer Header Cart, Product Chat Context, Checkout RPC Fix
-- ============================================================
-- Jalankan di Supabase SQL Editor setelah Phase 3B.2.
-- Tujuan:
-- 1. Memperbaiki error:
--    Could not find the function public.buyer_checkout(p_customer, p_items, p_notes, p_payment_method, p_shipping)
-- 2. Menyimpan informasi ekspedisi ke shipments agar sinkron dengan menu Pesanan seller.
-- 3. Menambahkan konteks produk pada Chat Toko.
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. Pastikan kolom pendukung checkout/pengiriman tersedia
-- ------------------------------------------------------------

alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists customer_email text;
alter table public.orders add column if not exists customer_phone text;
alter table public.orders add column if not exists shipping_address text;
alter table public.orders add column if not exists shipping_district text;
alter table public.orders add column if not exists shipping_city text;
alter table public.orders add column if not exists shipping_province text;
alter table public.orders add column if not exists shipping_postal_code text;
alter table public.orders add column if not exists order_status text default 'MENUNGGU_PEMBAYARAN';
alter table public.orders add column if not exists payment_status text default 'BELUM_DIBAYAR';
alter table public.orders add column if not exists shipping_status text default 'BELUM_DIKIRIM';
alter table public.orders add column if not exists subtotal_amount numeric(14,2) default 0;
alter table public.orders add column if not exists shipping_cost numeric(14,2) default 0;
alter table public.orders add column if not exists discount_amount numeric(14,2) default 0;
alter table public.orders add column if not exists total_amount numeric(14,2) default 0;
alter table public.orders add column if not exists grand_total numeric(14,2) default 0;
alter table public.orders add column if not exists notes text;

alter table public.shipments add column if not exists shipping_expedition_id uuid;
alter table public.shipments add column if not exists expedition_name text;
alter table public.shipments add column if not exists courier_name text;
alter table public.shipments add column if not exists courier_code text;
alter table public.shipments add column if not exists service_name text;

-- ------------------------------------------------------------
-- 2. Konteks produk untuk Chat Toko
-- ------------------------------------------------------------

alter table public.store_chats add column if not exists product_id uuid;
alter table public.store_chats add column if not exists product_name text;
alter table public.store_chats add column if not exists sku_product text;
alter table public.store_chats add column if not exists variant_id uuid;
alter table public.store_chats add column if not exists sku_variant text;
alter table public.store_chats add column if not exists color_name text;
alter table public.store_chats add column if not exists size_name text;
alter table public.store_chats add column if not exists pattern_type text;
alter table public.store_chats add column if not exists image_url text;

create index if not exists idx_store_chats_product_id on public.store_chats(product_id);
create index if not exists idx_store_chats_variant_id on public.store_chats(variant_id);

-- ------------------------------------------------------------
-- 3. Helper role
-- ------------------------------------------------------------

create or replace function public.current_app_role_text()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.role::text
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
      limit 1
    ),
    auth.jwt() -> 'app_metadata' ->> 'role',
    ''
  );
$$;

create or replace function public.is_admin_or_seller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role_text() in ('ADMIN', 'SUPERADMIN', 'SELLER');
$$;

-- ------------------------------------------------------------
-- 4. Rebuild checkout function dengan urutan argumen yang diminta PostgREST:
--    p_customer, p_items, p_notes, p_payment_method, p_shipping
-- ------------------------------------------------------------

drop function if exists public.buyer_checkout(jsonb, jsonb, jsonb, text, text);
drop function if exists public.buyer_checkout(jsonb, jsonb, text, text, jsonb);

create or replace function public.buyer_checkout(
  p_customer jsonb,
  p_items jsonb,
  p_notes text default '',
  p_payment_method text default 'BANK_TRANSFER',
  p_shipping jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
  v_variant_id uuid;
  v_product_id uuid;
  v_qty integer;
  v_unit_price numeric(14,2);
  v_weight integer;
  v_before_qty integer;
  v_after_qty integer;
  v_subtotal numeric(14,2) := 0;
  v_shipping_cost numeric(14,2) := coalesce(nullif(p_shipping ->> 'shipping_cost', '')::numeric, 0);
  v_grand_total numeric(14,2);
  v_shipping_expedition_id uuid := nullif(p_shipping ->> 'expedition_id', '')::uuid;
begin
  if v_user_id is null then
    raise exception 'Checkout membutuhkan login pembeli.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang checkout kosong.';
  end if;

  v_order_number := 'UO-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));

  insert into public.orders (
    order_number, buyer_id, customer_name, customer_email, customer_phone,
    shipping_address, shipping_district, shipping_city, shipping_province, shipping_postal_code,
    order_status, payment_status, shipping_status,
    subtotal_amount, shipping_cost, discount_amount, total_amount, grand_total, notes,
    created_at, updated_at
  )
  values (
    v_order_number, v_user_id,
    nullif(trim(p_customer ->> 'name'), ''),
    nullif(trim(p_customer ->> 'email'), ''),
    nullif(trim(p_customer ->> 'phone'), ''),
    nullif(trim(p_shipping ->> 'address'), ''),
    nullif(trim(p_shipping ->> 'district'), ''),
    nullif(trim(p_shipping ->> 'city'), ''),
    nullif(trim(p_shipping ->> 'province'), ''),
    nullif(trim(p_shipping ->> 'postal_code'), ''),
    'MENUNGGU_PEMBAYARAN', 'BELUM_DIBAYAR', 'BELUM_DIKIRIM',
    0, v_shipping_cost, 0, 0, 0,
    nullif(trim(coalesce(p_notes, '')), ''),
    now(), now()
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_variant_id := (v_item ->> 'variant_id')::uuid;
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    v_qty := greatest(1, coalesce((v_item ->> 'quantity')::integer, 1));
    v_unit_price := greatest(0, coalesce((v_item ->> 'unit_price')::numeric, 0));
    v_weight := greatest(0, coalesce((v_item ->> 'weight_gram')::integer, 0));

    select stock_qty
    into v_before_qty
    from public.product_variants
    where id = v_variant_id
    for update;

    if v_before_qty is null then
      raise exception 'Varian tidak ditemukan: %', v_variant_id;
    end if;

    if v_before_qty < v_qty then
      raise exception 'Stok varian % tidak mencukupi. Stok tersedia: %, diminta: %',
        coalesce(v_item ->> 'sku_variant', v_variant_id::text), v_before_qty, v_qty;
    end if;

    v_after_qty := v_before_qty - v_qty;

    update public.product_variants
    set stock_qty = v_after_qty,
        updated_at = now()
    where id = v_variant_id;

    insert into public.order_items (
      order_id, product_id, variant_id, product_name, sku_product, sku_variant,
      color_name, size_name, pattern_type, qty, unit_price, subtotal, weight_gram, image_url, created_at
    )
    values (
      v_order_id, v_product_id, v_variant_id,
      nullif(trim(v_item ->> 'product_name'), ''),
      nullif(trim(v_item ->> 'sku_product'), ''),
      nullif(trim(v_item ->> 'sku_variant'), ''),
      nullif(trim(v_item ->> 'color_name'), ''),
      nullif(trim(v_item ->> 'size_name'), ''),
      nullif(trim(v_item ->> 'pattern_type'), ''),
      v_qty, v_unit_price, v_qty * v_unit_price, v_weight,
      nullif(trim(v_item ->> 'image_url'), ''),
      now()
    );

    insert into public.stock_mutations (
      product_id, variant_id, mutation_type, quantity, before_qty, after_qty,
      reference_type, reference_id, notes, created_by, created_at
    )
    values (
      v_product_id, v_variant_id, 'OUT_SALE', v_qty, v_before_qty, v_after_qty,
      'ORDER', v_order_id, 'Checkout buyer ' || v_order_number, v_user_id, now()
    );

    v_subtotal := v_subtotal + (v_qty * v_unit_price);
  end loop;

  v_grand_total := v_subtotal + v_shipping_cost;

  update public.orders
  set subtotal_amount = v_subtotal,
      total_amount = v_subtotal,
      grand_total = v_grand_total,
      updated_at = now()
  where id = v_order_id;

  insert into public.payments (
    order_id, payment_method, payment_status, amount, created_at
  )
  values (
    v_order_id,
    coalesce(nullif(trim(p_payment_method), ''), 'BANK_TRANSFER'),
    'BELUM_DIBAYAR',
    v_grand_total,
    now()
  );

  insert into public.shipments (
    order_id, recipient_name, phone, address, district, city, province, postal_code,
    shipping_status, shipping_cost, shipping_expedition_id, expedition_name, courier_name,
    courier_code, service_name, created_at
  )
  values (
    v_order_id,
    nullif(trim(p_customer ->> 'name'), ''),
    nullif(trim(p_customer ->> 'phone'), ''),
    nullif(trim(p_shipping ->> 'address'), ''),
    nullif(trim(p_shipping ->> 'district'), ''),
    nullif(trim(p_shipping ->> 'city'), ''),
    nullif(trim(p_shipping ->> 'province'), ''),
    nullif(trim(p_shipping ->> 'postal_code'), ''),
    'BELUM_DIKIRIM',
    v_shipping_cost,
    v_shipping_expedition_id,
    nullif(trim(p_shipping ->> 'expedition_name'), ''),
    nullif(trim(p_shipping ->> 'expedition_name'), ''),
    nullif(trim(p_shipping ->> 'courier_code'), ''),
    nullif(trim(p_shipping ->> 'service_name'), ''),
    now()
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'shipping_cost', v_shipping_cost,
    'grand_total', v_grand_total
  );
end;
$$;

grant execute on function public.buyer_checkout(jsonb, jsonb, text, text, jsonb) to authenticated;

-- Bantu refresh PostgREST schema cache.
notify pgrst, 'reload schema';

commit;

select 'phase_3b_3_checkout_rpc_store_chat_context_ready' as status, now() as executed_at;
