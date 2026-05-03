-- ============================================================
-- UrbaNoiD Supabase Native
-- PHASE 3A: Buyer Cart + Checkout
-- ============================================================
-- Jalankan di Supabase SQL Editor sebelum memakai tombol Buat Pesanan.
-- Fungsi utama: public.buyer_checkout(...)
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ============================================================
-- 1. Pastikan tabel pesanan dasar tersedia
-- ============================================================

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique,
  buyer_id uuid,
  customer_name text,
  customer_email text,
  customer_phone text,
  shipping_address text,
  shipping_district text,
  shipping_city text,
  shipping_province text,
  shipping_postal_code text,
  order_status text not null default 'MENUNGGU_PEMBAYARAN',
  payment_status text not null default 'BELUM_DIBAYAR',
  shipping_status text not null default 'BELUM_DIKIRIM',
  subtotal_amount numeric(14,2) not null default 0,
  shipping_cost numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
alter table public.orders add column if not exists created_at timestamptz default now();
alter table public.orders add column if not exists updated_at timestamptz default now();

create unique index if not exists ux_orders_order_number on public.orders(order_number);
create index if not exists idx_orders_buyer_id on public.orders(buyer_id);
create index if not exists idx_orders_created_at on public.orders(created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid,
  variant_id uuid,
  product_name text,
  sku_product text,
  sku_variant text,
  color_name text,
  size_name text,
  pattern_type text,
  qty integer not null default 1,
  unit_price numeric(14,2) not null default 0,
  subtotal numeric(14,2) not null default 0,
  weight_gram integer not null default 0,
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_order_items_variant_id on public.order_items(variant_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  payment_method text not null default 'BANK_TRANSFER',
  payment_status text not null default 'BELUM_DIBAYAR',
  amount numeric(14,2) not null default 0,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_order_id on public.payments(order_id);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  recipient_name text,
  phone text,
  address text,
  district text,
  city text,
  province text,
  postal_code text,
  shipping_status text not null default 'BELUM_DIKIRIM',
  shipping_cost numeric(14,2) not null default 0,
  tracking_number text,
  created_at timestamptz not null default now()
);

create index if not exists idx_shipments_order_id on public.shipments(order_id);

create table if not exists public.stock_mutations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid,
  variant_id uuid,
  mutation_type text not null,
  quantity integer not null,
  before_qty integer,
  after_qty integer,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_mutations_variant_id on public.stock_mutations(variant_id);
create index if not exists idx_stock_mutations_created_at on public.stock_mutations(created_at desc);

-- ============================================================
-- 2. Helper role
-- ============================================================

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

-- ============================================================
-- 3. Function checkout buyer
-- ============================================================

create or replace function public.buyer_checkout(
  p_customer jsonb,
  p_shipping jsonb,
  p_items jsonb,
  p_payment_method text default 'BANK_TRANSFER',
  p_notes text default ''
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
  v_shipping_cost numeric(14,2) := coalesce((p_shipping ->> 'shipping_cost')::numeric, 0);
  v_grand_total numeric(14,2);
begin
  if v_user_id is null then
    raise exception 'Checkout membutuhkan login pembeli.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang checkout kosong.';
  end if;

  v_order_number := 'UO-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));

  insert into public.orders (
    order_number,
    buyer_id,
    customer_name,
    customer_email,
    customer_phone,
    shipping_address,
    shipping_district,
    shipping_city,
    shipping_province,
    shipping_postal_code,
    order_status,
    payment_status,
    shipping_status,
    subtotal_amount,
    shipping_cost,
    discount_amount,
    total_amount,
    grand_total,
    notes,
    created_at,
    updated_at
  )
  values (
    v_order_number,
    v_user_id,
    nullif(trim(p_customer ->> 'name'), ''),
    nullif(trim(p_customer ->> 'email'), ''),
    nullif(trim(p_customer ->> 'phone'), ''),
    nullif(trim(p_shipping ->> 'address'), ''),
    nullif(trim(p_shipping ->> 'district'), ''),
    nullif(trim(p_shipping ->> 'city'), ''),
    nullif(trim(p_shipping ->> 'province'), ''),
    nullif(trim(p_shipping ->> 'postal_code'), ''),
    'MENUNGGU_PEMBAYARAN',
    'BELUM_DIBAYAR',
    'BELUM_DIKIRIM',
    0,
    v_shipping_cost,
    0,
    0,
    0,
    nullif(trim(coalesce(p_notes, '')), ''),
    now(),
    now()
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
      raise exception 'Stok varian % tidak mencukupi. Stok tersedia: %, diminta: %', coalesce(v_item ->> 'sku_variant', v_variant_id::text), v_before_qty, v_qty;
    end if;

    v_after_qty := v_before_qty - v_qty;

    update public.product_variants
    set stock_qty = v_after_qty,
        updated_at = now()
    where id = v_variant_id;

    insert into public.order_items (
      order_id,
      product_id,
      variant_id,
      product_name,
      sku_product,
      sku_variant,
      color_name,
      size_name,
      pattern_type,
      qty,
      unit_price,
      subtotal,
      weight_gram,
      image_url,
      created_at
    )
    values (
      v_order_id,
      v_product_id,
      v_variant_id,
      nullif(trim(v_item ->> 'product_name'), ''),
      nullif(trim(v_item ->> 'sku_product'), ''),
      nullif(trim(v_item ->> 'sku_variant'), ''),
      nullif(trim(v_item ->> 'color_name'), ''),
      nullif(trim(v_item ->> 'size_name'), ''),
      nullif(trim(v_item ->> 'pattern_type'), ''),
      v_qty,
      v_unit_price,
      v_qty * v_unit_price,
      v_weight,
      nullif(trim(v_item ->> 'image_url'), ''),
      now()
    );

    insert into public.stock_mutations (
      product_id,
      variant_id,
      mutation_type,
      quantity,
      before_qty,
      after_qty,
      reference_type,
      reference_id,
      notes,
      created_by,
      created_at
    )
    values (
      v_product_id,
      v_variant_id,
      'OUT_SALE',
      v_qty,
      v_before_qty,
      v_after_qty,
      'ORDER',
      v_order_id,
      'Checkout buyer ' || v_order_number,
      v_user_id,
      now()
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
    order_id,
    payment_method,
    payment_status,
    amount,
    created_at
  )
  values (
    v_order_id,
    coalesce(nullif(trim(p_payment_method), ''), 'BANK_TRANSFER'),
    'BELUM_DIBAYAR',
    v_grand_total,
    now()
  );

  insert into public.shipments (
    order_id,
    recipient_name,
    phone,
    address,
    district,
    city,
    province,
    postal_code,
    shipping_status,
    shipping_cost,
    created_at
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

grant execute on function public.buyer_checkout(jsonb, jsonb, jsonb, text, text) to authenticated;

-- ============================================================
-- 4. RLS basic
-- ============================================================

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.shipments enable row level security;
alter table public.stock_mutations enable row level security;

drop policy if exists "buyer_read_own_orders" on public.orders;
drop policy if exists "admin_read_all_orders" on public.orders;
drop policy if exists "buyer_read_own_order_items" on public.order_items;
drop policy if exists "admin_read_all_order_items" on public.order_items;
drop policy if exists "buyer_read_own_payments" on public.payments;
drop policy if exists "admin_read_all_payments" on public.payments;
drop policy if exists "buyer_read_own_shipments" on public.shipments;
drop policy if exists "admin_read_all_shipments" on public.shipments;
drop policy if exists "admin_read_all_stock_mutations" on public.stock_mutations;

create policy "buyer_read_own_orders"
on public.orders for select
to authenticated
using (buyer_id = auth.uid());

create policy "admin_read_all_orders"
on public.orders for select
to authenticated
using (public.is_admin_or_seller());

create policy "buyer_read_own_order_items"
on public.order_items for select
to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and o.buyer_id = auth.uid()
  )
);

create policy "admin_read_all_order_items"
on public.order_items for select
to authenticated
using (public.is_admin_or_seller());

create policy "buyer_read_own_payments"
on public.payments for select
to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = payments.order_id
      and o.buyer_id = auth.uid()
  )
);

create policy "admin_read_all_payments"
on public.payments for select
to authenticated
using (public.is_admin_or_seller());

create policy "buyer_read_own_shipments"
on public.shipments for select
to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = shipments.order_id
      and o.buyer_id = auth.uid()
  )
);

create policy "admin_read_all_shipments"
on public.shipments for select
to authenticated
using (public.is_admin_or_seller());

create policy "admin_read_all_stock_mutations"
on public.stock_mutations for select
to authenticated
using (public.is_admin_or_seller());

grant select on public.orders, public.order_items, public.payments, public.shipments, public.stock_mutations to authenticated;
grant usage on schema public to anon, authenticated;

commit;

select 'phase_3a_buyer_cart_checkout_ready' as status, now() as executed_at;
