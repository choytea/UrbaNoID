-- ============================================================
-- Diagnostic Phase 3B.8 - Order Lifecycle Finalization
-- ============================================================

-- 1. Cek kolom lifecycle orders.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'orders'
  and column_name in (
    'paid_at', 'payment_verified_at', 'processing_started_at',
    'shipped_at', 'received_at', 'completed_at',
    'lifecycle_status_updated_at', 'lifecycle_last_event'
  )
order by column_name;

-- 2. Cek RPC lifecycle.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('buyer_confirm_order_received', 'seller_set_order_lifecycle')
order by p.proname;

-- 3. Cek 20 order terbaru dan statusnya.
select
  id,
  order_number,
  customer_name,
  order_status,
  payment_status,
  shipping_status,
  paid_at,
  payment_verified_at,
  processing_started_at,
  shipped_at,
  received_at,
  completed_at,
  lifecycle_last_event,
  updated_at
from public.orders
order by created_at desc
limit 20;
