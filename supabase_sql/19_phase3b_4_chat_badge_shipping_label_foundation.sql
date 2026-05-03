-- ============================================================
-- UrbaNoiD Supabase Native
-- PHASE 3B.4: Chat Badges, Read Sync, Shipping Label Foundation
-- ============================================================
-- Jalankan setelah Phase 3B.3.
-- Tujuan:
-- 1. Badge jumlah pesan chat baru dari buyer untuk seller.
-- 2. Badge jumlah balasan toko baru untuk buyer.
-- 3. Fondasi integrasi ekspedisi/resi/label kirim.
--
-- Catatan integrasi ekspedisi:
-- Kunci API ekspedisi TIDAK boleh disimpan/diakses dari frontend.
-- Gunakan Supabase Edge Function dengan secret environment variable
-- untuk integrasi Biteship/RajaOngkir/Shipper/Shipdeo/dll.
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. Kolom tambahan untuk audit read/notification chat
-- ------------------------------------------------------------

alter table public.store_chat_messages add column if not exists read_at timestamptz;

create index if not exists idx_store_chat_messages_unread_seller
on public.store_chat_messages(chat_id, sender_role, is_read)
where sender_role = 'BUYER' and is_read = false;

create index if not exists idx_store_chat_messages_unread_buyer
on public.store_chat_messages(chat_id, sender_role, is_read)
where sender_role = 'SELLER' and is_read = false;

-- ------------------------------------------------------------
-- 2. RPC unread count
-- ------------------------------------------------------------

create or replace function public.store_chat_unread_for_seller()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(*)::integer, 0)
  from public.store_chat_messages m
  join public.store_chats c on c.id = m.chat_id
  where m.sender_role = 'BUYER'
    and m.is_read = false
    and public.is_admin_or_seller();
$$;

create or replace function public.store_chat_unread_for_buyer()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(*)::integer, 0)
  from public.store_chat_messages m
  join public.store_chats c on c.id = m.chat_id
  where c.buyer_id = auth.uid()
    and m.sender_role = 'SELLER'
    and m.is_read = false;
$$;

grant execute on function public.store_chat_unread_for_seller() to authenticated;
grant execute on function public.store_chat_unread_for_buyer() to authenticated;

-- ------------------------------------------------------------
-- 3. RPC mark read
-- ------------------------------------------------------------

create or replace function public.mark_store_chat_read_for_seller(p_chat_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if not public.is_admin_or_seller() then
    raise exception 'Akses seller/admin diperlukan.';
  end if;

  update public.store_chat_messages
  set is_read = true,
      read_at = now()
  where chat_id = p_chat_id
    and sender_role = 'BUYER'
    and is_read = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.mark_store_chat_read_for_buyer(p_chat_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  update public.store_chat_messages m
  set is_read = true,
      read_at = now()
  from public.store_chats c
  where c.id = m.chat_id
    and c.id = p_chat_id
    and c.buyer_id = auth.uid()
    and m.sender_role = 'SELLER'
    and m.is_read = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.mark_store_chat_read_for_seller(uuid) to authenticated;
grant execute on function public.mark_store_chat_read_for_buyer(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. Fondasi integrasi ekspedisi/API/resi/label
-- ------------------------------------------------------------

alter table public.shipping_expeditions add column if not exists provider_name text;
alter table public.shipping_expeditions add column if not exists provider_service_code text;
alter table public.shipping_expeditions add column if not exists supports_api_booking boolean not null default false;
alter table public.shipping_expeditions add column if not exists supports_tracking boolean not null default false;
alter table public.shipping_expeditions add column if not exists supports_label boolean not null default false;
alter table public.shipping_expeditions add column if not exists integration_notes text;

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

create index if not exists idx_shipments_tracking_number on public.shipments(tracking_number);
create index if not exists idx_shipments_booking_status on public.shipments(booking_status);

notify pgrst, 'reload schema';

commit;

select 'phase_3b_4_chat_badge_shipping_label_foundation_ready' as status, now() as executed_at;
