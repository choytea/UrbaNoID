-- ============================================================
-- Diagnostic Phase 3B.7T - Biteship Testing Booking
-- ============================================================

-- 1. Kolom Biteship pada shipments.
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'shipments'
  and column_name in (
    'provider_name',
    'provider_order_id',
    'provider_tracking_id',
    'provider_service_code',
    'booking_status',
    'tracking_number',
    'tracking_url',
    'label_url',
    'biteship_error',
    'provider_response_json',
    'booking_created_at',
    'updated_at'
  )
order by column_name;

-- 2. Kolom origin Biteship pada store_profiles.
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'store_profiles'
  and column_name in (
    'origin_contact_name',
    'origin_note',
    'origin_collection_method',
    'origin_area_id',
    'origin_location_id',
    'origin_latitude',
    'origin_longitude'
  )
order by column_name;

-- 3. Profil toko aktif dan data pickup yang dibutuhkan Biteship.
select
  id,
  store_name,
  whatsapp,
  phone,
  email,
  address_line,
  city,
  province,
  postal_code,
  origin_contact_name,
  origin_collection_method,
  origin_area_id,
  origin_location_id,
  origin_latitude,
  origin_longitude,
  is_active
from public.store_profiles
where is_active = true
limit 3;

-- 4. Shipment terakhir untuk pengecekan data booking.
select
  s.id as shipment_id,
  s.order_id,
  o.order_number,
  o.customer_name,
  coalesce(s.phone, o.customer_phone) as buyer_phone,
  coalesce(s.address, o.shipping_address) as buyer_address,
  coalesce(s.postal_code, o.shipping_postal_code) as buyer_postal_code,
  s.courier_name,
  s.courier_code,
  s.service_name,
  s.shipping_cost,
  s.booking_status,
  s.provider_order_id,
  s.provider_tracking_id,
  s.tracking_number,
  s.biteship_error,
  s.booking_created_at
from public.shipments s
left join public.orders o on o.id = s.order_id
order by s.created_at desc nulls last, s.updated_at desc nulls last
limit 10;
