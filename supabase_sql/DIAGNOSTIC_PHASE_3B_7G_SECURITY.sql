-- ============================================================
-- UrbaNoiD Supabase Native
-- DIAGNOSTIC PHASE 3B.7G: Supabase Security Hardening
-- Jalankan setelah 26_phase3b_7g_supabase_security_hardening.sql
-- ============================================================

-- 1. View harus memiliki reloptions security_invoker=true.
select
  c.relname as view_name,
  c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('v_product_variant_detail', 'v_buyer_catalog', 'v_product_stock_summary')
order by c.relname;

-- 2. Bucket payment-proofs harus private/public = false.
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'payment-proofs';

-- 3. Policy payment-proofs aktif dan tidak lagi memakai policy lama yang luas.
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (
    policyname like 'payment_proofs_%'
    or qual ilike '%payment-proofs%'
    or with_check ilike '%payment-proofs%'
  )
order by policyname;

-- 4. Function utility harus sudah punya search_path eksplisit.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'set_updated_at',
    'import_safe_int',
    'import_safe_date',
    'import_safe_numeric',
    'touch_updated_at',
    'final_price'
  )
order by p.proname, args;
