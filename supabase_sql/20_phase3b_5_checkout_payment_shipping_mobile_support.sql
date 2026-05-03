-- ============================================================
-- UrbaNoiD Supabase Native
-- PHASE 3B.5: Checkout Compatibility, Payment Method, Shipping Label Support
-- ============================================================
-- Jalankan setelah Phase 3B.4.
-- Memperbaiki error checkout:
-- column "order_number" of relation "orders" does not exist
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. Helper role functions
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
-- 2. Ensure checkout-related tables and columns exist
-- ------------------------------------------------------------

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.orders add column if not exists order_number text;
alter table public.orders add column if not exists buyer_id uuid;
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
alter table public.orders add column if not exists updated_at timestamptz;

update public.orders
set order_number = 'UO-LEGACY-' || upper(substr(replace(id::text, '-', ''), 1, 8))
where order_number is null;

create unique index if not exists idx_orders_order_number_unique on public.orders(order_number);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid,
  created_at timestamptz not null default now()
);

alter table public.order_items add column if not exists order_id uuid;
alter table public.order_items add column if not exists product_id uuid;
alter table public.order_items add column if not exists variant_id uuid;
alter table public.order_items add column if not exists product_name text;
alter table public.order_items add column if not exists sku_product text;
alter table public.order_items add column if not exists sku_variant text;
alter table public.order_items add column if not exists color_name text;
alter table public.order_items add column if not exists size_name text;
alter table public.order_items add column if not exists pattern_type text;
alter table public.order_items add column if not exists qty integer default 1;
alter table public.order_items add column if not exists unit_price numeric(14,2) default 0;
alter table public.order_items add column if not exists subtotal numeric(14,2) default 0;
alter table public.order_items add column if not exists weight_gram integer default 0;
alter table public.order_items add column if not exists image_url text;

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  instructions text,
  is_active boolean not null default true,
  display_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

insert into public.payment_methods (code, name, instructions, display_order)
values
  ('BANK_TRANSFER', 'Bank Transfer', 'Transfer ke rekening toko, lalu upload bukti pembayaran pada fase konfirmasi pembayaran.', 1),
  ('QRIS', 'QRIS', 'Pembayaran QRIS akan disiapkan pada fase payment gateway.', 2),
  ('COD', 'COD / Bayar di Tempat', 'Gunakan hanya jika seller mengaktifkan layanan COD.', 3)
on conflict (code) do update
set name = excluded.name,
    instructions = excluded.instructions,
    display_order = excluded.display_order,
    updated_at = now();

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid,
  created_at timestamptz not null default now()
);

alter table public.payments add column if not exists order_id uuid;
alter table public.payments add column if not exists payment_method text;
alter table public.payments add column if not exists payment_method_code text;
alter table public.payments add column if not exists payment_status text default 'BELUM_DIBAYAR';
alter table public.payments add column if not exists amount numeric(14,2) default 0;
alter table public.payments add column if not exists proof_url text;
alter table public.payments add column if not exists confirmed_at timestamptz;
alter table public.payments add column if not exists notes text;

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid,
  created_at timestamptz not null default now()
);

alter table public.shipments add column if not exists order_id uuid;
alter table public.shipments add column if not exists recipient_name text;
alter table public.shipments add column if not exists phone text;
alter table public.shipments add column if not exists address text;
alter table public.shipments add column if not exists district text;
alter table public.shipments add column if not exists city text;
alter table public.shipments add column if not exists province text;
alter table public.shipments add column if not exists postal_code text;
alter table public.shipments add column if not exists shipping_status text default 'BELUM_DIKIRIM';
alter table public.shipments add column if not exists shipping_cost numeric(14,2) default 0;
alter table public.shipments add column if not exists shipping_expedition_id uuid;
alter table public.shipments add column if not exists expedition_name text;
alter table public.shipments add column if not exists courier_name text;
alter table public.shipments add column if not exists courier_code text;
alter table public.shipments add column if not exists service_name text;
alter table public.shipments add column if not exists provider_name text;
alter table public.shipments add column if not exists provider_order_id text;
alter table public.shipments add column if not exists tracking_number text;
alter table public.shipments add column if not exists tracking_url text;
alter table public.shipments add column if not exists label_url text;
alter table public.shipments add column if not exists label_storage_path text;
alter table public.shipments add column if not exists booking_status text default 'BELUM_BOOKING';
alter table public.shipments add column if not exists booked_at timestamptz;
alter table public.shipments add column if not exists label_generated_at timestamptz;
alter table public.shipments add column if not exists shipped_at timestamptz;

create table if not exists public.order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid,
  sender_id uuid,
  sender_role text,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.order_messages add column if not exists order_id uuid;
alter table public.order_messages add column if not exists sender_id uuid;
alter table public.order_messages add column if not exists sender_role text;
alter table public.order_messages add column if not exists message text;
alter table public.order_messages add column if not exists is_read boolean not null default false;
alter table public.order_messages add column if not exists created_at timestamptz not null default now();

create index if not exists idx_orders_buyer_id on public.orders(buyer_id);
create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_payments_order_id on public.payments(order_id);
create index if not exists idx_shipments_order_id on public.shipments(order_id);
create index if not exists idx_shipments_tracking_number on public.shipments(tracking_number);
create index if not exists idx_order_messages_order_id on public.order_messages(order_id);

-- ------------------------------------------------------------
-- 3. Shipping expedition integration columns
-- ------------------------------------------------------------

alter table public.shipping_expeditions add column if not exists provider_name text;
alter table public.shipping_expeditions add column if not exists provider_service_code text;
alter table public.shipping_expeditions add column if not exists supports_api_booking boolean not null default false;
alter table public.shipping_expeditions add column if not exists supports_tracking boolean not null default false;
alter table public.shipping_expeditions add column if not exists supports_label boolean not null default false;
alter table public.shipping_expeditions add column if not exists integration_notes text;

-- ------------------------------------------------------------
-- 4. RLS grants/policies
-- ------------------------------------------------------------

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.shipments enable row level security;
alter table public.order_messages enable row level security;
alter table public.payment_methods enable row level security;

drop policy if exists "orders_read_related" on public.orders;
drop policy if exists "orders_update_staff" on public.orders;
create policy "orders_read_related"
on public.orders for select to authenticated
using (public.is_admin_or_seller() or buyer_id = auth.uid());
create policy "orders_update_staff"
on public.orders for update to authenticated
using (public.is_admin_or_seller())
with check (public.is_admin_or_seller());

drop policy if exists "order_items_read_related" on public.order_items;
create policy "order_items_read_related"
on public.order_items for select to authenticated
using (
  public.is_admin_or_seller()
  or exists (select 1 from public.orders o where o.id = order_items.order_id and o.buyer_id = auth.uid())
);

drop policy if exists "payments_read_related" on public.payments;
drop policy if exists "payments_update_staff" on public.payments;
create policy "payments_read_related"
on public.payments for select to authenticated
using (
  public.is_admin_or_seller()
  or exists (select 1 from public.orders o where o.id = payments.order_id and o.buyer_id = auth.uid())
);
create policy "payments_update_staff"
on public.payments for update to authenticated
using (public.is_admin_or_seller())
with check (public.is_admin_or_seller());

drop policy if exists "shipments_read_related" on public.shipments;
drop policy if exists "shipments_update_staff" on public.shipments;
create policy "shipments_read_related"
on public.shipments for select to authenticated
using (
  public.is_admin_or_seller()
  or exists (select 1 from public.orders o where o.id = shipments.order_id and o.buyer_id = auth.uid())
);
create policy "shipments_update_staff"
on public.shipments for update to authenticated
using (public.is_admin_or_seller())
with check (public.is_admin_or_seller());

drop policy if exists "order_messages_read_related" on public.order_messages;
drop policy if exists "order_messages_insert_related" on public.order_messages;
create policy "order_messages_read_related"
on public.order_messages for select to authenticated
using (
  public.is_admin_or_seller()
  or exists (select 1 from public.orders o where o.id = order_messages.order_id and o.buyer_id = auth.uid())
);
create policy "order_messages_insert_related"
on public.order_messages for insert to authenticated
with check (
  public.is_admin_or_seller()
  or exists (select 1 from public.orders o where o.id = order_messages.order_id and o.buyer_id = auth.uid())
);

drop policy if exists "payment_methods_read_active" on public.payment_methods;
create policy "payment_methods_read_active"
on public.payment_methods for select to authenticated
using (is_active = true or public.is_admin_or_seller());

grant select, update on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant select, update on public.payments to authenticated;
grant select, update on public.shipments to authenticated;
grant select, insert on public.order_messages to authenticated;
grant select on public.payment_methods to authenticated;
grant usage on schema public to anon, authenticated;

-- ------------------------------------------------------------
-- 5. Rebuild checkout RPC
-- ------------------------------------------------------------

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
  v_payment_method text := coalesce(nullif(trim(p_payment_method), ''), 'BANK_TRANSFER');
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
    order_id, payment_method, payment_method_code, payment_status, amount, created_at
  )
  values (
    v_order_id,
    v_payment_method,
    v_payment_method,
    'BELUM_DIBAYAR',
    v_grand_total,
    now()
  );

  insert into public.shipments (
    order_id, recipient_name, phone, address, district, city, province, postal_code,
    shipping_status, shipping_cost, shipping_expedition_id, expedition_name, courier_name,
    courier_code, service_name, booking_status, created_at
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
    'BELUM_BOOKING',
    now()
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'shipping_cost', v_shipping_cost,
    'grand_total', v_grand_total,
    'payment_method', v_payment_method
  );
end;
$$;

grant execute on function public.buyer_checkout(jsonb, jsonb, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;

select 'phase_3b_5_checkout_payment_shipping_compat_ready' as status, now() as executed_at;
