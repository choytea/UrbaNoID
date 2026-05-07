-- ============================================================
-- DIAGNOSTIC PHASE 3B.7X - Buyer Cancel Unpaid Order
-- ============================================================

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'buyer_cancel_unpaid_order';

select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'orders'
  and column_name in ('cancelled_at', 'cancelled_by', 'cancelled_by_role', 'cancel_reason', 'cancel_stock_released_at')
order by column_name;

select
  id,
  order_number,
  order_no,
  buyer_id,
  order_status,
  payment_status,
  shipping_status,
  grand_total,
  cancelled_at,
  cancel_reason,
  cancel_stock_released_at,
  updated_at
from public.orders
order by created_at desc
limit 10;
