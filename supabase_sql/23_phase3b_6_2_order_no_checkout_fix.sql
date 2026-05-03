-- ============================================================
-- UrbaNoiD Supabase Native
-- PHASE 3B.6.2: Checkout Fix for Legacy orders.order_no NOT NULL
-- ============================================================
-- Perbaikan error:
-- null value in column "order_no" of relation "orders" violates not-null constraint
--
-- Penyebab:
-- Database lama masih memiliki kolom orders.order_no NOT NULL,
-- sedangkan checkout terbaru mengisi order_number saja.
--
-- Dampak:
-- 1. Menjamin orders.order_no tersedia dan sinkron dengan order_number.
-- 2. Rebuild buyer_checkout agar mengisi order_number dan order_no sekaligus.
-- 3. Existing rows diselaraskan tanpa menghapus data.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Pastikan kolom legacy order_no tersedia.
-- ------------------------------------------------------------

alter table public.orders add column if not exists order_no text;

update public.orders
set order_number = coalesce(order_number, order_no)
where order_number is null
  and order_no is not null;

update public.orders
set order_no = coalesce(order_no, order_number, 'UO-LEGACY-' || upper(substr(replace(id::text, '-', ''), 1, 8)))
where order_no is null;

update public.orders
set order_number = coalesce(order_number, order_no)
where order_number is null;

alter table public.orders alter column order_no set not null;

create unique index if not exists idx_orders_order_no_unique on public.orders(order_no);

-- ------------------------------------------------------------
-- 2. Pastikan enum status checkout sudah menerima status Indonesia.
-- ------------------------------------------------------------

do $$
declare
  enum_rec record;
  status_value text;
begin
  for enum_rec in
    select distinct ns.nspname as schema_name, typ.typname as type_name, col.column_name
    from pg_attribute att
    join pg_class cls on cls.oid = att.attrelid
    join pg_namespace tbl_ns on tbl_ns.oid = cls.relnamespace
    join pg_type typ on typ.oid = att.atttypid
    join pg_namespace ns on ns.oid = typ.typnamespace
    join information_schema.columns col
      on col.table_schema = tbl_ns.nspname
     and col.table_name = cls.relname
     and col.column_name = att.attname
    where tbl_ns.nspname = 'public'
      and cls.relname in ('orders', 'payments', 'shipments')
      and att.attname in ('order_status', 'payment_status', 'shipping_status', 'booking_status')
      and typ.typtype = 'e'
  loop
    if enum_rec.column_name = 'payment_status' then
      foreach status_value in array array['BELUM_DIBAYAR', 'MENUNGGU_KONFIRMASI', 'DIBAYAR', 'DITOLAK', 'REFUND', 'DIBATALKAN']
      loop
        execute format('alter type %I.%I add value if not exists %L', enum_rec.schema_name, enum_rec.type_name, status_value);
      end loop;
    elsif enum_rec.column_name = 'order_status' then
      foreach status_value in array array['MENUNGGU_PEMBAYARAN', 'DIPROSES', 'SELESAI', 'DIBATALKAN']
      loop
        execute format('alter type %I.%I add value if not exists %L', enum_rec.schema_name, enum_rec.type_name, status_value);
      end loop;
    elsif enum_rec.column_name = 'shipping_status' then
      foreach status_value in array array['BELUM_DIKIRIM', 'DIKEMAS', 'DIKIRIM', 'DITERIMA', 'GAGAL_KIRIM']
      loop
        execute format('alter type %I.%I add value if not exists %L', enum_rec.schema_name, enum_rec.type_name, status_value);
      end loop;
    elsif enum_rec.column_name = 'booking_status' then
      foreach status_value in array array['BELUM_BOOKING', 'MANUAL_RESI', 'BITESHIP_REQUESTING', 'BITESHIP_FAILED', 'BITESHIP_CONFIRMED', 'BITESHIP_BOOKED']
      loop
        execute format('alter type %I.%I add value if not exists %L', enum_rec.schema_name, enum_rec.type_name, status_value);
      end loop;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3. Pastikan kolom pendukung checkout dan Biteship tetap tersedia.
-- ------------------------------------------------------------

alter table public.orders add column if not exists order_number text;
alter table public.orders add column if not exists destination_area_id text;
alter table public.orders add column if not exists destination_latitude numeric(12,8);
alter table public.orders add column if not exists destination_longitude numeric(12,8);

alter table public.order_items add column if not exists package_length_cm numeric(10,2);
alter table public.order_items add column if not exists package_width_cm numeric(10,2);
alter table public.order_items add column if not exists package_height_cm numeric(10,2);

alter table public.shipments add column if not exists destination_area_id text;
alter table public.shipments add column if not exists destination_latitude numeric(12,8);
alter table public.shipments add column if not exists destination_longitude numeric(12,8);
alter table public.shipments add column if not exists provider_name text;
alter table public.shipments add column if not exists provider_order_id text;
alter table public.shipments add column if not exists provider_tracking_id text;
alter table public.shipments add column if not exists tracking_number text;
alter table public.shipments add column if not exists tracking_url text;
alter table public.shipments add column if not exists label_url text;
alter table public.shipments add column if not exists biteship_error text;
alter table public.shipments add column if not exists biteship_request jsonb;
alter table public.shipments add column if not exists biteship_response jsonb;

-- ------------------------------------------------------------
-- 4. Rebuild buyer_checkout: isi order_number dan order_no.
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
    order_number,
    order_no,
    buyer_id,
    customer_name,
    customer_email,
    customer_phone,
    shipping_address,
    shipping_district,
    shipping_city,
    shipping_province,
    shipping_postal_code,
    destination_area_id,
    destination_latitude,
    destination_longitude,
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
    nullif(trim(p_shipping ->> 'destination_area_id'), ''),
    nullif(p_shipping ->> 'destination_latitude', '')::numeric,
    nullif(p_shipping ->> 'destination_longitude', '')::numeric,
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
    v_weight := greatest(1, coalesce((v_item ->> 'weight_gram')::integer, 250));

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
      package_length_cm,
      package_width_cm,
      package_height_cm,
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
      nullif(v_item ->> 'package_length_cm', '')::numeric,
      nullif(v_item ->> 'package_width_cm', '')::numeric,
      nullif(v_item ->> 'package_height_cm', '')::numeric,
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
    payment_method_code,
    payment_status,
    amount,
    created_at
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
    order_id,
    recipient_name,
    phone,
    address,
    district,
    city,
    province,
    postal_code,
    destination_area_id,
    destination_latitude,
    destination_longitude,
    shipping_status,
    shipping_cost,
    shipping_expedition_id,
    expedition_name,
    courier_name,
    courier_code,
    service_name,
    booking_status,
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
    nullif(trim(p_shipping ->> 'destination_area_id'), ''),
    nullif(p_shipping ->> 'destination_latitude', '')::numeric,
    nullif(p_shipping ->> 'destination_longitude', '')::numeric,
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
    'order_no', v_order_number,
    'subtotal', v_subtotal,
    'shipping_cost', v_shipping_cost,
    'grand_total', v_grand_total,
    'payment_method', v_payment_method
  );
end;
$$;

grant execute on function public.buyer_checkout(jsonb, jsonb, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';

select 'phase_3b_6_2_order_no_checkout_fix_ready' as status, now() as executed_at;
