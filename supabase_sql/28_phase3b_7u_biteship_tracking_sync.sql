-- ============================================================
-- UrbaNoiD Supabase Native
-- PHASE 3B.7U: Biteship Tracking Sync
-- ============================================================
-- Jalankan di Supabase SQL Editor setelah Phase 3B.7T.
-- Tujuan:
-- 1. Menambahkan kolom tracking Biteship yang tidak menimpa response booking.
-- 2. Menyimpan status/history tracking untuk seller dan buyer.
-- 3. Menyiapkan index ringan untuk pengecekan status.
-- ============================================================

alter table public.shipments add column if not exists tracking_status text;
alter table public.shipments add column if not exists tracking_checked_at timestamptz;
alter table public.shipments add column if not exists tracking_history_json jsonb;
alter table public.shipments add column if not exists tracking_response_json jsonb;
alter table public.shipments add column if not exists actual_shipping_cost numeric;
alter table public.shipments add column if not exists biteship_error text;
alter table public.shipments add column if not exists updated_at timestamptz;

create index if not exists idx_shipments_tracking_status on public.shipments(tracking_status);
create index if not exists idx_shipments_tracking_checked_at on public.shipments(tracking_checked_at);
create index if not exists idx_shipments_tracking_number on public.shipments(tracking_number);

-- Bantu PostgREST membaca schema terbaru.
notify pgrst, 'reload schema';

select
  'phase_3b_7u_biteship_tracking_sync_ready' as status,
  now() as executed_at;
