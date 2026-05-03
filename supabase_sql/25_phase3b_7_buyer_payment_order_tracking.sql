-- ============================================================
-- UrbaNoiD Supabase Native
-- PHASE 3B.7: Buyer Order Tracking + Payment Confirmation
-- ============================================================
-- Fitur:
-- 1. Buyer dapat melihat posisi pesanan, status pembayaran, dan status pengiriman.
-- 2. Buyer dapat upload bukti pembayaran dan mengirim konfirmasi pembayaran.
-- 3. Seller dapat melihat bukti pembayaran, konfirmasi/tolak pembayaran,
--    lalu menindaklanjuti proses pesanan.
-- 4. Buyer dapat konfirmasi pesanan diterima.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Pastikan status enum yang dipakai workflow tersedia.
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
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 2. Kolom tambahan pembayaran.
-- ------------------------------------------------------------

alter table public.payments add column if not exists proof_url text;
alter table public.payments add column if not exists proof_storage_path text;
alter table public.payments add column if not exists proof_uploaded_at timestamptz;
alter table public.payments add column if not exists payer_name text;
alter table public.payments add column if not exists payer_bank text;
alter table public.payments add column if not exists transfer_amount numeric(14,2);
alter table public.payments add column if not exists transfer_date date;
alter table public.payments add column if not exists buyer_note text;
alter table public.payments add column if not exists seller_note text;
alter table public.payments add column if not exists confirmed_at timestamptz;
alter table public.payments add column if not exists confirmed_by uuid;
alter table public.payments add column if not exists rejected_at timestamptz;
alter table public.payments add column if not exists rejection_reason text;
alter table public.payments add column if not exists updated_at timestamptz;

create index if not exists idx_payments_order_id on public.payments(order_id);
create index if not exists idx_payments_payment_status on public.payments(payment_status);
create index if not exists idx_payments_proof_uploaded_at on public.payments(proof_uploaded_at desc);

-- ------------------------------------------------------------
-- 3. Storage bucket bukti pembayaran.
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update
set public = true,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[];

-- Policy upload/select/update untuk authenticated user.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'payment_proofs_authenticated_select'
  ) then
    create policy payment_proofs_authenticated_select
    on storage.objects
    for select
    to authenticated
    using (bucket_id = 'payment-proofs');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'payment_proofs_authenticated_insert'
  ) then
    create policy payment_proofs_authenticated_insert
    on storage.objects
    for insert
    to authenticated
    with check (bucket_id = 'payment-proofs' and auth.uid() is not null);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'payment_proofs_authenticated_update'
  ) then
    create policy payment_proofs_authenticated_update
    on storage.objects
    for update
    to authenticated
    using (bucket_id = 'payment-proofs' and auth.uid() is not null)
    with check (bucket_id = 'payment-proofs' and auth.uid() is not null);
  end if;
end $$;

-- ------------------------------------------------------------
-- 4. RPC Buyer: konfirmasi pembayaran.
-- ------------------------------------------------------------

create or replace function public.buyer_confirm_payment(
  p_order_id uuid,
  p_payment_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order record;
  v_payment_id uuid;
  v_amount numeric(14,2);
begin
  if v_user_id is null then
    raise exception 'Login buyer diperlukan untuk konfirmasi pembayaran.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
    and buyer_id = v_user_id;

  if not found then
    raise exception 'Pesanan tidak ditemukan atau bukan milik buyer ini.';
  end if;

  if p_payment_id is not null then
    select id into v_payment_id
    from public.payments
    where id = p_payment_id
      and order_id = p_order_id
    limit 1;
  else
    select id into v_payment_id
    from public.payments
    where order_id = p_order_id
    order by created_at desc
    limit 1;
  end if;

  if v_payment_id is null then
    raise exception 'Data pembayaran untuk pesanan ini belum tersedia.';
  end if;

  v_amount := coalesce(
    nullif(p_payload ->> 'transfer_amount', '')::numeric,
    v_order.grand_total,
    v_order.total_amount,
    0
  );

  update public.payments
  set payment_status = 'MENUNGGU_KONFIRMASI',
      proof_url = nullif(p_payload ->> 'proof_url', ''),
      proof_storage_path = nullif(p_payload ->> 'proof_storage_path', ''),
      proof_uploaded_at = now(),
      payer_name = nullif(trim(coalesce(p_payload ->> 'payer_name', '')), ''),
      payer_bank = nullif(trim(coalesce(p_payload ->> 'payer_bank', '')), ''),
      transfer_amount = v_amount,
      transfer_date = coalesce(nullif(p_payload ->> 'transfer_date', '')::date, current_date),
      buyer_note = nullif(trim(coalesce(p_payload ->> 'buyer_note', '')), ''),
      seller_note = null,
      rejected_at = null,
      rejection_reason = null,
      updated_at = now()
  where id = v_payment_id;

  update public.orders
  set payment_status = 'MENUNGGU_KONFIRMASI',
      order_status = case
        when order_status = 'DIBATALKAN' then order_status
        else 'MENUNGGU_PEMBAYARAN'
      end,
      updated_at = now()
  where id = p_order_id;

  insert into public.order_messages (order_id, sender_id, sender_role, message, created_at)
  values (
    p_order_id,
    v_user_id,
    'BUYER',
    'Buyer telah mengirim konfirmasi pembayaran. Mohon seller/admin melakukan verifikasi bukti pembayaran.',
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'payment_id', v_payment_id,
    'payment_status', 'MENUNGGU_KONFIRMASI'
  );
end;
$$;

grant execute on function public.buyer_confirm_payment(uuid, uuid, jsonb) to authenticated;

-- ------------------------------------------------------------
-- 5. RPC Seller: approve/reject pembayaran.
-- ------------------------------------------------------------

create or replace function public.seller_review_payment(
  p_order_id uuid,
  p_payment_id uuid,
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
  v_role text;
  v_payment record;
  v_action text := upper(trim(coalesce(p_action, '')));
begin
  if v_user_id is null then
    raise exception 'Login seller/admin diperlukan.';
  end if;

  select upper(role::text)
  into v_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if coalesce(v_role, '') not in ('ADMIN', 'SUPERADMIN', 'SELLER') then
    raise exception 'Akses seller/admin diperlukan untuk verifikasi pembayaran.';
  end if;

  select *
  into v_payment
  from public.payments
  where id = p_payment_id
    and order_id = p_order_id;

  if not found then
    raise exception 'Data pembayaran tidak ditemukan.';
  end if;

  if v_action = 'APPROVE' then
    update public.payments
    set payment_status = 'DIBAYAR',
        confirmed_at = now(),
        confirmed_by = v_user_id,
        seller_note = nullif(trim(coalesce(p_note, '')), ''),
        rejected_at = null,
        rejection_reason = null,
        updated_at = now()
    where id = p_payment_id;

    update public.orders
    set payment_status = 'DIBAYAR',
        order_status = 'DIPROSES',
        shipping_status = case
          when shipping_status in ('BELUM_DIKIRIM', 'GAGAL_KIRIM') or shipping_status is null then 'DIKEMAS'
          else shipping_status
        end,
        updated_at = now()
    where id = p_order_id;

    update public.shipments
    set shipping_status = case
          when shipping_status in ('BELUM_DIKIRIM', 'GAGAL_KIRIM') or shipping_status is null then 'DIKEMAS'
          else shipping_status
        end
    where order_id = p_order_id;

    insert into public.order_messages (order_id, sender_id, sender_role, message, created_at)
    values (
      p_order_id,
      v_user_id,
      'SELLER',
      'Pembayaran sudah dikonfirmasi. Pesanan sedang diproses/dikemas oleh seller.',
      now()
    );

    return jsonb_build_object('ok', true, 'action', 'APPROVE', 'payment_status', 'DIBAYAR');
  end if;

  if v_action = 'REJECT' then
    update public.payments
    set payment_status = 'DITOLAK',
        rejected_at = now(),
        rejection_reason = nullif(trim(coalesce(p_note, '')), ''),
        seller_note = nullif(trim(coalesce(p_note, '')), ''),
        updated_at = now()
    where id = p_payment_id;

    update public.orders
    set payment_status = 'DITOLAK',
        order_status = 'MENUNGGU_PEMBAYARAN',
        updated_at = now()
    where id = p_order_id;

    insert into public.order_messages (order_id, sender_id, sender_role, message, created_at)
    values (
      p_order_id,
      v_user_id,
      'SELLER',
      'Konfirmasi pembayaran ditolak. Catatan seller: ' || coalesce(nullif(trim(p_note), ''), '-'),
      now()
    );

    return jsonb_build_object('ok', true, 'action', 'REJECT', 'payment_status', 'DITOLAK');
  end if;

  raise exception 'Aksi tidak valid. Gunakan APPROVE atau REJECT.';
end;
$$;

grant execute on function public.seller_review_payment(uuid, uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 6. RPC Buyer: konfirmasi pesanan diterima.
-- ------------------------------------------------------------

create or replace function public.buyer_confirm_order_received(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order record;
begin
  if v_user_id is null then
    raise exception 'Login buyer diperlukan.';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
    and buyer_id = v_user_id;

  if not found then
    raise exception 'Pesanan tidak ditemukan atau bukan milik buyer ini.';
  end if;

  update public.orders
  set shipping_status = 'DITERIMA',
      order_status = 'SELESAI',
      updated_at = now()
  where id = p_order_id;

  update public.shipments
  set shipping_status = 'DITERIMA'
  where order_id = p_order_id;

  insert into public.order_messages (order_id, sender_id, sender_role, message, created_at)
  values (
    p_order_id,
    v_user_id,
    'BUYER',
    'Buyer mengonfirmasi bahwa pesanan sudah diterima.',
    now()
  );

  return jsonb_build_object('ok', true, 'order_id', p_order_id, 'order_status', 'SELESAI', 'shipping_status', 'DITERIMA');
end;
$$;

grant execute on function public.buyer_confirm_order_received(uuid) to authenticated;

notify pgrst, 'reload schema';

select 'phase_3b_7_buyer_payment_order_tracking_ready' as status, now() as executed_at;
