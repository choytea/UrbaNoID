-- ============================================================
-- UrbaNoiD Supabase Native
-- PHASE 3B.8: Order Lifecycle Finalization
-- ============================================================
-- Tujuan:
-- 1. Mengunci alur status order/pembayaran/pengiriman agar konsisten.
-- 2. Buyer hanya bisa konfirmasi pesanan diterima jika paket sudah dikirim.
-- 3. Seller tidak bisa booking/input resi bila pembayaran belum dikonfirmasi.
-- 4. Menambahkan kolom audit lifecycle tanpa merusak data lama.
-- ============================================================

-- 1. Pastikan nilai enum status lifecycle tersedia bila memakai enum.
do $$
declare
  enum_rec record;
begin
  for enum_rec in
    select distinct ns.nspname as schema_name, typ.typname as type_name
    from pg_attribute att
    join pg_class cls on cls.oid = att.attrelid
    join pg_namespace tbl_ns on tbl_ns.oid = cls.relnamespace
    join pg_type typ on typ.oid = att.atttypid
    join pg_namespace ns on ns.oid = typ.typnamespace
    where tbl_ns.nspname = 'public'
      and cls.relname in ('orders', 'payments', 'shipments')
      and att.attname in ('order_status', 'payment_status', 'shipping_status', 'booking_status')
      and typ.typtype = 'e'
  loop
    execute format('alter type %I.%I add value if not exists %L', enum_rec.schema_name, enum_rec.type_name, 'MENUNGGU_PEMBAYARAN');
    execute format('alter type %I.%I add value if not exists %L', enum_rec.schema_name, enum_rec.type_name, 'MENUNGGU_KONFIRMASI');
    execute format('alter type %I.%I add value if not exists %L', enum_rec.schema_name, enum_rec.type_name, 'BELUM_DIBAYAR');
    execute format('alter type %I.%I add value if not exists %L', enum_rec.schema_name, enum_rec.type_name, 'DIPROSES');
    execute format('alter type %I.%I add value if not exists %L', enum_rec.schema_name, enum_rec.type_name, 'DIKEMAS');
    execute format('alter type %I.%I add value if not exists %L', enum_rec.schema_name, enum_rec.type_name, 'DIKIRIM');
    execute format('alter type %I.%I add value if not exists %L', enum_rec.schema_name, enum_rec.type_name, 'DITERIMA');
    execute format('alter type %I.%I add value if not exists %L', enum_rec.schema_name, enum_rec.type_name, 'SELESAI');
    execute format('alter type %I.%I add value if not exists %L', enum_rec.schema_name, enum_rec.type_name, 'DIBATALKAN');
  end loop;
end $$;

-- 2. Kolom audit lifecycle.
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists payment_verified_at timestamptz;
alter table public.orders add column if not exists processing_started_at timestamptz;
alter table public.orders add column if not exists shipped_at timestamptz;
alter table public.orders add column if not exists received_at timestamptz;
alter table public.orders add column if not exists completed_at timestamptz;
alter table public.orders add column if not exists lifecycle_status_updated_at timestamptz;
alter table public.orders add column if not exists lifecycle_last_event text;

alter table public.payments add column if not exists paid_at timestamptz;
alter table public.payments add column if not exists verified_at timestamptz;
alter table public.payments add column if not exists updated_at timestamptz;

alter table public.shipments add column if not exists shipped_at timestamptz;
alter table public.shipments add column if not exists delivered_at timestamptz;
alter table public.shipments add column if not exists updated_at timestamptz;

create index if not exists idx_orders_lifecycle_status on public.orders(order_status, payment_status, shipping_status);
create index if not exists idx_orders_lifecycle_updated_at on public.orders(lifecycle_status_updated_at desc);
create index if not exists idx_shipments_lifecycle_status on public.shipments(shipping_status, booking_status);

-- 3. Helper RPC buyer: konfirmasi pesanan sudah diterima.
create or replace function public.buyer_confirm_order_received(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order record;
  v_has_tracking boolean := false;
begin
  if v_user_id is null then
    raise exception 'Login buyer diperlukan untuk mengonfirmasi pesanan diterima.';
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

  if upper(coalesce(v_order.order_status::text, '')) = 'DIBATALKAN'
     or upper(coalesce(v_order.payment_status::text, '')) = 'DIBATALKAN'
     or upper(coalesce(v_order.shipping_status::text, '')) = 'DIBATALKAN' then
    raise exception 'Pesanan dibatalkan tidak dapat dikonfirmasi diterima.';
  end if;

  if upper(coalesce(v_order.payment_status::text, '')) <> 'DIBAYAR' then
    raise exception 'Pesanan belum dibayar sehingga belum dapat dikonfirmasi diterima.';
  end if;

  select exists (
    select 1
    from public.shipments s
    where s.order_id = p_order_id
      and (
        upper(coalesce(s.shipping_status::text, '')) in ('DIKIRIM', 'DITERIMA')
        or nullif(coalesce(s.tracking_number, ''), '') is not null
        or nullif(coalesce(s.provider_tracking_id, ''), '') is not null
      )
  ) into v_has_tracking;

  if upper(coalesce(v_order.shipping_status::text, '')) not in ('DIKIRIM', 'DITERIMA') and not v_has_tracking then
    raise exception 'Pesanan belum dikirim/resi belum tersedia.';
  end if;

  update public.shipments
  set shipping_status = 'DITERIMA',
      delivered_at = coalesce(delivered_at, now()),
      updated_at = now()
  where order_id = p_order_id;

  update public.orders
  set order_status = 'SELESAI',
      shipping_status = 'DITERIMA',
      received_at = coalesce(received_at, now()),
      completed_at = coalesce(completed_at, now()),
      lifecycle_status_updated_at = now(),
      lifecycle_last_event = 'BUYER_CONFIRMED_RECEIVED',
      updated_at = now()
  where id = p_order_id;

  insert into public.order_messages (order_id, sender_id, sender_role, message, created_at)
  values (p_order_id, v_user_id, 'BUYER', 'Buyer mengonfirmasi pesanan sudah diterima. Pesanan selesai.', now());

  return jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'order_status', 'SELESAI',
    'payment_status', 'DIBAYAR',
    'shipping_status', 'DITERIMA'
  );
end;
$$;

grant execute on function public.buyer_confirm_order_received(uuid) to authenticated;

-- 4. Helper RPC seller/admin untuk transisi lifecycle aman bila nanti ingin dipakai dari frontend.
create or replace function public.seller_set_order_lifecycle(
  p_order_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := '';
  v_order record;
  v_action text := upper(trim(coalesce(p_action, '')));
begin
  if v_user_id is null then
    raise exception 'Login seller/admin diperlukan.';
  end if;

  select upper(coalesce(role::text, ''))
  into v_role
  from public.profiles
  where id = v_user_id
  limit 1;

  if coalesce(v_role, '') not in ('ADMIN', 'SUPERADMIN', 'SELLER') then
    raise exception 'Akses hanya untuk seller/admin.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan.';
  end if;

  if upper(coalesce(v_order.order_status::text, '')) = 'DIBATALKAN'
     or upper(coalesce(v_order.payment_status::text, '')) = 'DIBATALKAN'
     or upper(coalesce(v_order.shipping_status::text, '')) = 'DIBATALKAN' then
    raise exception 'Pesanan dibatalkan tidak dapat diproses.';
  end if;

  if v_action in ('MARK_PROCESSING', 'MARK_PACKED', 'MARK_SHIPPED')
     and upper(coalesce(v_order.payment_status::text, '')) <> 'DIBAYAR' then
    raise exception 'Pembayaran harus dikonfirmasi sebelum pesanan diproses/dikirim.';
  end if;

  if v_action = 'MARK_PROCESSING' then
    update public.orders
    set order_status = 'DIPROSES',
        shipping_status = case when upper(coalesce(shipping_status::text, '')) in ('', 'BELUM_DIKIRIM') then 'DIKEMAS' else shipping_status end,
        processing_started_at = coalesce(processing_started_at, now()),
        lifecycle_status_updated_at = now(),
        lifecycle_last_event = 'SELLER_MARK_PROCESSING',
        updated_at = now()
    where id = p_order_id;
  elsif v_action = 'MARK_SHIPPED' then
    update public.orders
    set shipping_status = 'DIKIRIM',
        shipped_at = coalesce(shipped_at, now()),
        lifecycle_status_updated_at = now(),
        lifecycle_last_event = 'SELLER_MARK_SHIPPED',
        updated_at = now()
    where id = p_order_id;

    update public.shipments
    set shipping_status = 'DIKIRIM',
        shipped_at = coalesce(shipped_at, now()),
        updated_at = now()
    where order_id = p_order_id;
  elsif v_action = 'MARK_COMPLETED' then
    update public.orders
    set order_status = 'SELESAI',
        shipping_status = 'DITERIMA',
        received_at = coalesce(received_at, now()),
        completed_at = coalesce(completed_at, now()),
        lifecycle_status_updated_at = now(),
        lifecycle_last_event = 'SELLER_MARK_COMPLETED',
        updated_at = now()
    where id = p_order_id;

    update public.shipments
    set shipping_status = 'DITERIMA',
        delivered_at = coalesce(delivered_at, now()),
        updated_at = now()
    where order_id = p_order_id;
  else
    raise exception 'Aksi lifecycle tidak dikenal: %', v_action;
  end if;

  insert into public.order_messages (order_id, sender_id, sender_role, message, created_at)
  values (p_order_id, v_user_id, 'SELLER', coalesce(nullif(trim(p_note), ''), 'Status pesanan diperbarui: ' || v_action), now());

  return jsonb_build_object('ok', true, 'order_id', p_order_id, 'action', v_action);
end;
$$;

grant execute on function public.seller_set_order_lifecycle(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

select 'phase_3b_8_order_lifecycle_finalization_ready' as status, now() as executed_at;
