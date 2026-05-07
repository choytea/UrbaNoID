-- ============================================================
-- UrbaNoiD Supabase Native
-- PHASE 3B.7X: Buyer Cancel Unpaid Order
-- ============================================================
-- Tujuan:
-- 1. Buyer dapat membatalkan pesanan selama pembayaran belum dilakukan.
-- 2. Pembatalan memakai RPC aman, bukan update langsung dari frontend.
-- 3. Order/payment/shipment diberi status DIBATALKAN.
-- 4. Stok varian dikembalikan secara idempotent bila checkout sebelumnya mengurangi stok.
-- ============================================================

-- 1. Pastikan nilai enum DIBATALKAN tersedia bila status memakai enum.
do $$
declare
  enum_rec record;
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
    execute format('alter type %I.%I add value if not exists %L', enum_rec.schema_name, enum_rec.type_name, 'DIBATALKAN');
    execute format('alter type %I.%I add value if not exists %L', enum_rec.schema_name, enum_rec.type_name, 'DIBATALKAN_BUYER');
  end loop;
end $$;

-- 2. Kolom audit pembatalan.
alter table public.orders add column if not exists cancelled_at timestamptz;
alter table public.orders add column if not exists cancelled_by uuid;
alter table public.orders add column if not exists cancelled_by_role text;
alter table public.orders add column if not exists cancel_reason text;
alter table public.orders add column if not exists cancel_stock_released_at timestamptz;

alter table public.payments add column if not exists cancelled_at timestamptz;
alter table public.payments add column if not exists updated_at timestamptz;

alter table public.shipments add column if not exists cancelled_at timestamptz;
alter table public.shipments add column if not exists updated_at timestamptz;

create index if not exists idx_orders_cancelled_at on public.orders(cancelled_at desc);
create index if not exists idx_orders_buyer_cancel_status on public.orders(buyer_id, order_status, payment_status);

-- 3. RPC: buyer membatalkan pesanan yang belum dibayar.
create or replace function public.buyer_cancel_unpaid_order(
  p_order_id uuid,
  p_reason text default 'Dibatalkan buyer sebelum pembayaran'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order record;
  v_payment_block_count integer := 0;
  v_restocked integer := 0;
  v_has_product_variants boolean := false;
  v_has_variant_stock boolean := false;
  v_has_order_items boolean := false;
  v_message text;
begin
  if v_user_id is null then
    raise exception 'Login buyer diperlukan untuk membatalkan pesanan.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
    and buyer_id = v_user_id
  for update;

  if not found then
    raise exception 'Pesanan tidak ditemukan atau bukan milik buyer ini.';
  end if;

  if upper(coalesce(v_order.order_status::text, '')) = 'DIBATALKAN' then
    return jsonb_build_object(
      'ok', true,
      'already_cancelled', true,
      'order_id', p_order_id,
      'order_status', 'DIBATALKAN'
    );
  end if;

  if upper(coalesce(v_order.order_status::text, '')) = 'SELESAI'
     or upper(coalesce(v_order.shipping_status::text, '')) in ('DITERIMA', 'SELESAI') then
    raise exception 'Pesanan yang sudah selesai/diterima tidak dapat dibatalkan.';
  end if;

  if upper(coalesce(v_order.payment_status::text, '')) in ('DIBAYAR', 'MENUNGGU_KONFIRMASI') then
    raise exception 'Pesanan tidak dapat dibatalkan karena pembayaran sudah dikirim atau sudah dibayar.';
  end if;

  select count(*)
  into v_payment_block_count
  from public.payments p
  where p.order_id = p_order_id
    and (
      upper(coalesce(p.payment_status::text, '')) in ('DIBAYAR', 'MENUNGGU_KONFIRMASI')
      or nullif(coalesce(p.proof_url, ''), '') is not null
      or nullif(coalesce(p.proof_storage_path, ''), '') is not null
      or p.proof_uploaded_at is not null
    );

  if coalesce(v_payment_block_count, 0) > 0 then
    raise exception 'Pesanan tidak dapat dibatalkan karena bukti pembayaran sudah dikirim/menunggu verifikasi.';
  end if;

  -- Kembalikan stok jika checkout sebelumnya mengurangi stok.
  -- Dibuat idempotent melalui orders.cancel_stock_released_at.
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'product_variants'
  ) into v_has_product_variants;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'product_variants' and column_name = 'stock_qty'
  ) into v_has_variant_stock;

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'order_items'
  ) into v_has_order_items;

  if v_order.cancel_stock_released_at is null and v_has_product_variants and v_has_variant_stock and v_has_order_items then
    update public.product_variants pv
    set stock_qty = coalesce(pv.stock_qty, 0) + coalesce(src.qty, 0)
    from (
      select variant_id, sum(coalesce(qty, 0))::integer as qty
      from public.order_items
      where order_id = p_order_id
        and variant_id is not null
      group by variant_id
    ) src
    where pv.id = src.variant_id;

    get diagnostics v_restocked = row_count;
  end if;

  update public.payments
  set payment_status = 'DIBATALKAN',
      cancelled_at = now(),
      updated_at = now()
  where order_id = p_order_id;

  update public.shipments
  set shipping_status = 'DIBATALKAN',
      booking_status = case
        when nullif(coalesce(provider_order_id, ''), '') is not null then 'DIBATALKAN_BUYER'
        else 'DIBATALKAN'
      end,
      cancelled_at = now(),
      updated_at = now()
  where order_id = p_order_id;

  update public.orders
  set order_status = 'DIBATALKAN',
      payment_status = 'DIBATALKAN',
      shipping_status = 'DIBATALKAN',
      cancelled_at = now(),
      cancelled_by = v_user_id,
      cancelled_by_role = 'BUYER',
      cancel_reason = nullif(trim(coalesce(p_reason, '')), ''),
      cancel_stock_released_at = coalesce(cancel_stock_released_at, now()),
      updated_at = now()
  where id = p_order_id;

  v_message := 'Buyer membatalkan pesanan sebelum pembayaran.';
  if coalesce(v_restocked, 0) > 0 then
    v_message := v_message || ' Stok item dikembalikan ke katalog.';
  end if;

  if exists (
    select 1 from public.shipments
    where order_id = p_order_id
      and nullif(coalesce(provider_order_id, ''), '') is not null
  ) then
    v_message := v_message || ' Catatan: jika pesanan sudah booking Biteship, batalkan juga booking di dashboard Biteship/testing bila diperlukan.';
  end if;

  insert into public.order_messages (order_id, sender_id, sender_role, message, created_at)
  values (p_order_id, v_user_id, 'BUYER', v_message, now());

  return jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'order_status', 'DIBATALKAN',
    'payment_status', 'DIBATALKAN',
    'shipping_status', 'DIBATALKAN',
    'restocked_variant_rows', coalesce(v_restocked, 0)
  );
end;
$$;

grant execute on function public.buyer_cancel_unpaid_order(uuid, text) to authenticated;

notify pgrst, 'reload schema';

select 'phase_3b_7x_buyer_cancel_unpaid_order_ready' as status, now() as executed_at;
