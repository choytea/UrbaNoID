-- ============================================================
-- Diagnostic Phase 3B.7W - Biteship Rates Checkout Integration
-- ============================================================

select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('orders', 'shipments')
  and column_name in (
    'shipping_rate_id',
    'shipping_rate_provider',
    'shipping_rate_response_json',
    'shipping_rate_checked_at',
    'shipping_actual_cost',
    'shipping_courier_company',
    'shipping_courier_type',
    'shipping_courier_service_name',
    'shipping_courier_etd',
    'provider_rate_id',
    'actual_shipping_cost',
    'provider_service_code',
    'provider_courier_company',
    'provider_courier_type'
  )
order by table_name, column_name;

select
  o.id,
  o.order_number,
  o.subtotal_amount,
  o.shipping_cost,
  o.shipping_actual_cost,
  o.total_amount,
  o.grand_total,
  o.shipping_courier_company,
  o.shipping_courier_type,
  s.id as shipment_id,
  s.shipping_cost as shipment_shipping_cost,
  s.actual_shipping_cost as shipment_actual_shipping_cost,
  s.courier_code,
  s.service_name,
  s.provider_service_code,
  s.provider_rate_id,
  s.booking_status,
  s.tracking_number
from public.orders o
left join public.shipments s on s.order_id = o.id
order by o.created_at desc
limit 20;
