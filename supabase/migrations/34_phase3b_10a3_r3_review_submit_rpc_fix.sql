-- =============================================================
-- Phase 3B.10A-3 R3 Review Submit RPC Fix
-- Purpose:
--   - Add compatibility RPC for frontend payload p_comment / p_product_id / p_variant_id.
--   - Keep product reviews visible in catalog/detail product.
--   - Recreate review views safely after column shape changes.
-- =============================================================

alter table public.product_reviews
add column if not exists is_published boolean not null default true;

update public.product_reviews
set is_published = true
where is_published is distinct from true;

update public.product_reviews
set status = 'PUBLISHED'
where status is null or status = '';

alter table public.product_reviews enable row level security;

-- Public can read published reviews. Buyer can read own reviews.
drop policy if exists product_reviews_select_published_anon on public.product_reviews;
create policy product_reviews_select_published_anon
on public.product_reviews
for select
to anon
using (status = 'PUBLISHED' and coalesce(is_published, true) = true);

drop policy if exists product_reviews_select_published_or_own_authenticated on public.product_reviews;
create policy product_reviews_select_published_or_own_authenticated
on public.product_reviews
for select
to authenticated
using (
  (status = 'PUBLISHED' and coalesce(is_published, true) = true)
  or buyer_id = auth.uid()
);

-- Compatibility RPC for the UI installed in Phase 3B.10A-2.
-- It accepts p_product_id, p_variant_id, and p_comment, then validates from the real order item.
create or replace function public.buyer_submit_product_review(
  p_order_id uuid,
  p_order_item_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_rating integer,
  p_comment text default null
)
returns public.product_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid := auth.uid();
  v_item record;
  v_review public.product_reviews;
begin
  if v_buyer_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'RATING_MUST_BE_1_TO_5';
  end if;

  select
    o.id as order_id,
    o.buyer_id,
    o.order_status,
    o.shipping_status,
    oi.id as order_item_id,
    oi.product_id,
    oi.variant_id
  into v_item
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.id = p_order_id
    and oi.id = p_order_item_id
  limit 1;

  if not found then
    raise exception 'ORDER_ITEM_NOT_FOUND';
  end if;

  if v_item.buyer_id is distinct from v_buyer_id then
    raise exception 'ORDER_NOT_OWNED_BY_BUYER';
  end if;

  if p_product_id is not null and v_item.product_id is distinct from p_product_id then
    raise exception 'PRODUCT_MISMATCH';
  end if;

  if p_variant_id is not null and v_item.variant_id is distinct from p_variant_id then
    raise exception 'VARIANT_MISMATCH';
  end if;

  if not (
    upper(coalesce(v_item.order_status, '')) = 'SELESAI'
    or upper(coalesce(v_item.shipping_status, '')) = 'DITERIMA'
  ) then
    raise exception 'ORDER_NOT_COMPLETED_OR_RECEIVED';
  end if;

  insert into public.product_reviews (
    order_id,
    order_item_id,
    product_id,
    variant_id,
    buyer_id,
    rating,
    review_text,
    status,
    is_published
  ) values (
    v_item.order_id,
    v_item.order_item_id,
    v_item.product_id,
    v_item.variant_id,
    v_buyer_id,
    p_rating,
    nullif(trim(coalesce(p_comment, '')), ''),
    'PUBLISHED',
    true
  )
  on conflict (order_item_id) do update set
    rating = excluded.rating,
    review_text = excluded.review_text,
    status = 'PUBLISHED',
    is_published = true,
    updated_at = now()
  where public.product_reviews.buyer_id = v_buyer_id
  returning * into v_review;

  return v_review;
end;
$$;

revoke all on function public.buyer_submit_product_review(uuid, uuid, uuid, uuid, integer, text) from public;
grant execute on function public.buyer_submit_product_review(uuid, uuid, uuid, uuid, integer, text) to authenticated;

-- Recreate views safely. Drop first because CREATE OR REPLACE VIEW cannot drop/change columns.
drop view if exists public.v_product_reviews_public;
drop view if exists public.v_product_review_summary;

create view public.v_product_review_summary
with (security_invoker = true)
as
select
  product_id,
  count(*)::integer as review_count,
  round(avg(rating)::numeric, 2) as average_rating,
  count(*) filter (where rating = 5)::integer as rating_5_count,
  count(*) filter (where rating = 4)::integer as rating_4_count,
  count(*) filter (where rating = 3)::integer as rating_3_count,
  count(*) filter (where rating = 2)::integer as rating_2_count,
  count(*) filter (where rating = 1)::integer as rating_1_count,
  max(created_at) as latest_review_at
from public.product_reviews
where status = 'PUBLISHED'
  and coalesce(is_published, true) = true
group by product_id;

create view public.v_product_reviews_public
with (security_invoker = true)
as
select
  pr.id,
  pr.product_id,
  pr.variant_id,
  pr.order_item_id,
  pr.rating,
  pr.review_text,
  pr.image_url,
  pr.created_at,
  pr.status,
  pr.is_published,
  coalesce(p.full_name, 'Buyer') as buyer_name,
  oi.product_name,
  oi.sku_variant
from public.product_reviews pr
left join public.profiles p on p.id = pr.buyer_id
left join public.order_items oi on oi.id = pr.order_item_id
where pr.status = 'PUBLISHED'
  and coalesce(pr.is_published, true) = true;

grant select on public.v_product_review_summary to anon, authenticated;
grant select on public.v_product_reviews_public to anon, authenticated;

-- Quick check:
-- select * from public.product_reviews order by created_at desc limit 20;
-- select * from public.v_product_review_summary limit 20;
-- select * from public.v_product_reviews_public order by created_at desc limit 20;
