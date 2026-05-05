-- ============================================================
-- Diagnostic Phase 3B.7U - Biteship Tracking Sync
-- ============================================================

-- 1. Cek kolom tracking baru.
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'shipments'
  and column_name in (
    'tracking_status',
    'tracking_checked_at',
    'tracking_history_json',
    'tracking_response_json',
    'actual_shipping_cost',
    'biteship_error',
    'provider_tracking_id',
    'provider_order_id',
    'tracking_number',
    'tracking_url'
  )
order by column_name;

-- 2. Cek shipment terbaru yang sudah booking/tracking.
select
  s.id,
  s.order_id,
  s.provider_name,
  s.provider_order_id,
  s.provider_tracking_id,
  s.tracking_number,
  s.booking_status,
  s.tracking_status,
  s.shipping_status,
  s.shipping_cost,
  s.actual_shipping_cost,
  s.tracking_checked_at,
  s.biteship_error,
  s.updated_at
from public.shipments s
order by coalesce(s.tracking_checked_at, s.booking_created_at, s.updated_at, s.created_at) desc nulls last
limit 20;
