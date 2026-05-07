-- ============================================================
-- UrbaNoiD Supabase Native
-- Phase 3B.7W - Biteship Rates Checkout Integration
-- Tujuan:
-- 1. Menyimpan rate Biteship yang dipilih buyer saat checkout.
-- 2. Membuat total order memakai ongkir aktual Biteship sejak awal.
-- 3. Menyiapkan booking Biteship agar memakai courier/service pilihan buyer.
-- Tidak destructive: hanya ADD COLUMN IF NOT EXISTS + index.
-- ============================================================

alter table public.orders add column if not exists shipping_rate_id text;
alter table public.orders add column if not exists shipping_rate_provider text default 'biteship';
alter table public.orders add column if not exists shipping_rate_response_json jsonb;
alter table public.orders add column if not exists shipping_rate_checked_at timestamptz;
alter table public.orders add column if not exists shipping_actual_cost numeric;
alter table public.orders add column if not exists shipping_courier_company text;
alter table public.orders add column if not exists shipping_courier_type text;
alter table public.orders add column if not exists shipping_courier_service_name text;
alter table public.orders add column if not exists shipping_courier_etd text;
alter table public.orders add column if not exists shipping_origin_postal_code text;
alter table public.orders add column if not exists shipping_destination_postal_code text;

alter table public.shipments add column if not exists provider_rate_id text;
alter table public.shipments add column if not exists shipping_rate_provider text default 'biteship';
alter table public.shipments add column if not exists shipping_rate_response_json jsonb;
alter table public.shipments add column if not exists shipping_rate_checked_at timestamptz;
alter table public.shipments add column if not exists actual_shipping_cost numeric;
alter table public.shipments add column if not exists provider_service_code text;
alter table public.shipments add column if not exists provider_courier_company text;
alter table public.shipments add column if not exists provider_courier_type text;
alter table public.shipments add column if not exists shipping_courier_etd text;
alter table public.shipments add column if not exists destination_area_id text;
alter table public.shipments add column if not exists destination_location_id text;

create index if not exists idx_orders_shipping_rate_id on public.orders(shipping_rate_id);
create index if not exists idx_orders_shipping_actual_cost on public.orders(shipping_actual_cost);
create index if not exists idx_shipments_provider_rate_id on public.shipments(provider_rate_id);
create index if not exists idx_shipments_actual_shipping_cost on public.shipments(actual_shipping_cost);

-- Sinkronisasi ringan untuk transaksi lama: actual_shipping_cost mengikuti shipping_cost bila belum ada.
update public.shipments
set actual_shipping_cost = coalesce(actual_shipping_cost, shipping_cost)
where actual_shipping_cost is null and shipping_cost is not null;

notify pgrst, 'reload schema';

select
  'phase_3b_7w_biteship_rates_checkout_ready' as status,
  now() as executed_at;
