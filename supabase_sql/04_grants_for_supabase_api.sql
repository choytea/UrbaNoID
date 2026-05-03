-- ============================================================
-- UrbaNoiD Supabase Native v1.0.2
-- FASE 2B: Grants untuk Supabase API / supabase-js
-- ============================================================
-- Jalankan setelah clean install v1.0.2.
-- RLS tetap aktif. Grant hanya membuka akses API dasar;
-- keputusan boleh/tidak tetap dikontrol oleh RLS policies.
-- ============================================================

grant usage on schema public to anon, authenticated;

-- Public read untuk katalog dan master aktif
grant select on
  public.settings,
  public.showcases,
  public.categories,
  public.materials,
  public.colors,
  public.sizes,
  public.product_models,
  public.products,
  public.product_variants,
  public.product_images,
  public.v_buyer_catalog,
  public.v_product_variant_detail,
  public.v_product_stock_summary
to anon, authenticated;

-- Profile user
grant select, insert, update on public.profiles to authenticated;

-- Seller/admin data management.
-- RLS policies tetap membatasi hanya role ADMIN/SELLER.
grant select, insert, update, delete on
  public.showcases,
  public.categories,
  public.materials,
  public.colors,
  public.sizes,
  public.product_models,
  public.products,
  public.product_variants,
  public.product_images,
  public.settings,
  public.stock_mutations
to authenticated;

-- Buyer authenticated workflows.
grant select, insert, update, delete on
  public.carts,
  public.cart_items,
  public.orders,
  public.order_items,
  public.payments,
  public.shipments,
  public.reviews
to authenticated;

-- Optional sanity check
select
  'grants_phase_2b_done' as status,
  now() as executed_at;
