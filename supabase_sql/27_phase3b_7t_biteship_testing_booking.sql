-- ============================================================
-- UrbaNoiD Supabase Native
-- PHASE 3B.7T: Biteship Testing Booking Integration
-- ============================================================
-- Jalankan di Supabase SQL Editor sebelum deploy Edge Function.
-- Tujuan:
-- 1. Menjamin kolom Biteship pada tabel shipments tersedia.
-- 2. Menyimpan response booking Biteship untuk audit/debug.
-- 3. Menyiapkan index ringan untuk booking/tracking.
-- ============================================================

alter table public.shipments add column if not exists provider_name text;
alter table public.shipments add column if not exists provider_order_id text;
alter table public.shipments add column if not exists provider_tracking_id text;
alter table public.shipments add column if not exists provider_service_code text;
alter table public.shipments add column if not exists booking_status text default 'BELUM_BOOKING';
alter table public.shipments add column if not exists tracking_number text;
alter table public.shipments add column if not exists tracking_url text;
alter table public.shipments add column if not exists label_url text;
alter table public.shipments add column if not exists biteship_error text;
alter table public.shipments add column if not exists provider_response_json jsonb;
alter table public.shipments add column if not exists booking_created_at timestamptz;
alter table public.shipments add column if not exists updated_at timestamptz;

create index if not exists idx_shipments_provider_order_id on public.shipments(provider_order_id);
create index if not exists idx_shipments_provider_tracking_id on public.shipments(provider_tracking_id);
create index if not exists idx_shipments_booking_status on public.shipments(booking_status);
create index if not exists idx_shipments_order_id on public.shipments(order_id);

-- Pastikan store profile memiliki kolom origin Biteship yang dipakai Edge Function.
alter table public.store_profiles add column if not exists origin_contact_name text;
alter table public.store_profiles add column if not exists origin_note text;
alter table public.store_profiles add column if not exists origin_collection_method text default 'pickup';
alter table public.store_profiles add column if not exists origin_area_id text;
alter table public.store_profiles add column if not exists origin_location_id text;
alter table public.store_profiles add column if not exists origin_latitude numeric;
alter table public.store_profiles add column if not exists origin_longitude numeric;

-- Isi default booking_status untuk data lama.
update public.shipments
set booking_status = coalesce(nullif(booking_status, ''), 'BELUM_BOOKING')
where booking_status is null or booking_status = '';

-- Bantu PostgREST membaca schema terbaru.
notify pgrst, 'reload schema';

select
  'phase_3b_7t_biteship_testing_booking_ready' as status,
  now() as executed_at;
