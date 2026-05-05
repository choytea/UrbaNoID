-- ============================================================
-- Diagnostic Phase 3B.7V - Shipping Cost Display & Status Polish
-- ============================================================
-- Tidak mengubah data. Dipakai untuk melihat selisih ongkir buyer vs ongkir aktual Biteship.

select
  s.id as shipment_id,
  s.order_id,
  o.order_number,
  o.shipping_status as order_shipping_status,
  s.shipping_status as shipment_shipping_status,
  s.booking_status,
  s.tracking_status,
  s.tracking_number,
  s.shipping_cost as ongkir_dibayar_buyer,
  s.actual_shipping_cost as ongkir_aktual_biteship,
  (coalesce(s.actual_shipping_cost, 0) - coalesce(s.shipping_cost, 0)) as selisih_ongkir,
  case
    when s.actual_shipping_cost is null then 'ONGKIR_AKTUAL_BELUM_TERSEDIA'
    when s.actual_shipping_cost = s.shipping_cost then 'SAMA'
    when s.actual_shipping_cost < s.shipping_cost then 'BITESHIP_LEBIH_MURAH'
    else 'BITESHIP_LEBIH_MAHAL'
  end as status_selisih,
  s.tracking_checked_at,
  s.booking_created_at,
  s.updated_at
from public.shipments s
left join public.orders o on o.id = s.order_id
order by coalesce(s.tracking_checked_at, s.booking_created_at, s.updated_at, s.created_at) desc nulls last
limit 25;
