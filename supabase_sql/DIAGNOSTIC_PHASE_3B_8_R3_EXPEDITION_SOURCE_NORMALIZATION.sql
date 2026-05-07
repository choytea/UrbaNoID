-- DIAGNOSTIC Phase 3B.8-R3 — Expedition Source Normalization
-- Tujuan: memantau apakah order/shipment memakai rate Biteship aktual atau fallback manual.

select
  o.id as order_id,
  o.order_number,
  o.status as order_status,
  o.payment_status,
  o.shipping_status,
  o.subtotal,
  o.shipping_cost,
  o.grand_total,
  o.shipping_courier_company,
  o.shipping_courier_type,
  o.shipping_courier_service_name,
  o.shipping_rate_checked_at,
  s.id as shipment_id,
  s.provider_name,
  s.courier_company,
  s.courier_type,
  s.shipping_cost as shipment_shipping_cost,
  s.actual_shipping_cost,
  s.booking_status,
  s.tracking_status,
  s.tracking_number,
  s.updated_at
from public.orders o
left join public.shipments s on s.order_id = o.id
order by o.created_at desc
limit 20;
