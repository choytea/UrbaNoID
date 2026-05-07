-- DIAGNOSTIC Phase 3B.8-R2 — Biteship Order Retrieve Mapping Polish
-- Read-only check: lihat hasil mapping tracking/order Biteship terbaru.

select
  s.id,
  s.order_id,
  s.provider_name,
  s.provider_order_id,
  s.provider_tracking_id,
  s.tracking_number,
  s.tracking_url,
  s.booking_status,
  s.tracking_status,
  s.shipping_status,
  s.shipping_cost,
  s.actual_shipping_cost,
  s.tracking_checked_at,
  s.biteship_error,
  case
    when s.tracking_history_json is null then 0
    when jsonb_typeof(s.tracking_history_json) = 'array' then jsonb_array_length(s.tracking_history_json)
    else 1
  end as tracking_history_count,
  s.updated_at
from public.shipments s
where s.provider_name = 'biteship'
   or s.provider_order_id is not null
   or s.tracking_number is not null
order by coalesce(s.tracking_checked_at, s.booking_created_at, s.updated_at, s.created_at) desc nulls last
limit 20;
