-- Phase 3B.10A-3 R2 - Review Visibility Fix
-- Tujuan:
-- 1. Pastikan review yang sudah dikirim buyer tampil sebagai published.
-- 2. Pastikan frontend anon/authenticated bisa membaca review published melalui RLS.
-- 3. Tidak mengubah checkout, order lifecycle, stok, keuangan, atau Biteship.

begin;

-- Pastikan review baru default published.
alter table public.product_reviews
  alter column is_published set default true;

-- Untuk review yang sudah telanjur masuk tetapi belum published/null, tampilkan di katalog/detail.
update public.product_reviews
set is_published = true
where is_published is distinct from true;

-- Grant akses baca; RLS policy di bawah tetap membatasi hanya published.
grant select on public.product_reviews to anon, authenticated;
grant select on public.v_product_review_summary to anon, authenticated;
grant select on public.v_product_reviews_public to anon, authenticated;

-- Policy baca publik untuk review yang sudah published.
drop policy if exists product_reviews_public_read_published on public.product_reviews;
drop policy if exists "product_reviews_public_read_published" on public.product_reviews;

create policy "product_reviews_public_read_published"
on public.product_reviews
for select
to anon, authenticated
using (is_published = true);

commit;

-- Cek cepat setelah Run:
-- select id, product_id, order_item_id, rating, review_text, is_published, created_at
-- from public.product_reviews
-- order by created_at desc
-- limit 20;
--
-- select * from public.v_product_review_summary limit 20;
-- select * from public.v_product_reviews_public order by created_at desc limit 20;
