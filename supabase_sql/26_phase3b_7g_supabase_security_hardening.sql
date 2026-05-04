-- ============================================================
-- UrbaNoiD Supabase Native
-- PHASE 3B.7G: Supabase Security Hardening - Prioritas Advisor
-- ============================================================
-- Target prioritas:
-- 1. Ubah view katalog/stok menjadi security_invoker agar RLS tabel asal tetap berlaku.
-- 2. Jadikan bucket payment-proofs private dan batasi policy storage.objects.
-- 3. Set search_path eksplisit untuk function utility yang ditandai Advisor.
--
-- Catatan:
-- - Jalankan setelah Phase 3B.7F.
-- - Patch frontend 3B.7G sudah menggunakan signed URL untuk bukti pembayaran.
-- - Product images/videos/store assets sengaja tetap public karena merupakan aset katalog.
-- - Warning GraphQL exposure belum ditutup massal pada fase ini agar tidak memutus akses aplikasi.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Security Definer View -> Security Invoker View.
-- ------------------------------------------------------------

alter view if exists public.v_product_variant_detail set (security_invoker = true);
alter view if exists public.v_buyer_catalog set (security_invoker = true);
alter view if exists public.v_product_stock_summary set (security_invoker = true);

-- ------------------------------------------------------------
-- 2. Private bucket untuk bukti pembayaran.
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[];

-- Hapus policy lama Phase 3B.7 yang terlalu luas.
drop policy if exists payment_proofs_authenticated_select on storage.objects;
drop policy if exists payment_proofs_authenticated_insert on storage.objects;
drop policy if exists payment_proofs_authenticated_update on storage.objects;

-- Bersihkan policy 3B.7G jika script dijalankan ulang.
drop policy if exists payment_proofs_buyer_select_own on storage.objects;
drop policy if exists payment_proofs_buyer_insert_own on storage.objects;
drop policy if exists payment_proofs_buyer_update_own on storage.objects;
drop policy if exists payment_proofs_seller_admin_select_all on storage.objects;

-- Buyer hanya dapat membaca bukti pembayaran miliknya sendiri.
-- Format path frontend: <buyer_user_id>/<order_id>/<timestamp>-<file_name>
create policy payment_proofs_buyer_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payment-proofs'
  and split_part(name, '/', 1) = auth.uid()::text
);

-- Buyer hanya dapat upload ke folder miliknya sendiri.
create policy payment_proofs_buyer_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'payment-proofs'
  and split_part(name, '/', 1) = auth.uid()::text
);

-- Buyer dapat mengganti file di folder miliknya sendiri bila upload ulang/upsert.
create policy payment_proofs_buyer_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'payment-proofs'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'payment-proofs'
  and split_part(name, '/', 1) = auth.uid()::text
);

-- Seller/Admin dapat membaca seluruh bukti pembayaran untuk verifikasi pesanan.
create policy payment_proofs_seller_admin_select_all
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payment-proofs'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, true) = true
      and upper(p.role::text) in ('ADMIN', 'SUPERADMIN', 'SELLER')
  )
);

-- ------------------------------------------------------------
-- 3. Function Search Path Mutable -> search_path eksplisit.
-- ------------------------------------------------------------
-- Menggunakan search_path = public agar aman dan minim risiko rusak terhadap function lama
-- yang masih memakai referensi object tanpa schema. Nanti bisa diperketat lagi menjadi
-- search_path = '' setelah semua body function ditulis dengan schema-qualified names.

do $$
declare
  fn record;
begin
  for fn in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as args
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
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = public',
      fn.schema_name,
      fn.function_name,
      fn.args
    );
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;

select 'phase_3b_7g_supabase_security_hardening_ready' as status, now() as executed_at;
