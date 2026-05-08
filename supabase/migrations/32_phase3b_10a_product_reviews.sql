-- =============================================================
-- Phase 3B.10A-1 Product Reviews & Ratings Storage
-- UrbaNoiD Supabase Native
-- Purpose:
--   - Store buyer product reviews after order is received/completed
--   - One review per order item
--   - Provide safe RPC for buyer submit/update review
--   - Provide review summary view for catalog/detail product
-- =============================================================

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid null references public.product_variants(id) on delete set null,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  review_text text null,
  image_url text null,
  image_storage_path text null,
  status text not null default 'PUBLISHED' check (status in ('PUBLISHED','HIDDEN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_reviews_order_item_uidx
  on public.product_reviews(order_item_id);

create index if not exists product_reviews_product_idx
  on public.product_reviews(product_id);

create index if not exists product_reviews_buyer_idx
  on public.product_reviews(buyer_id);

create index if not exists product_reviews_status_idx
  on public.product_reviews(status);

create or replace function public.product_reviews_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_product_reviews_touch_updated_at on public.product_reviews;
create trigger trg_product_reviews_touch_updated_at
before update on public.product_reviews
for each row execute function public.product_reviews_touch_updated_at();

alter table public.product_reviews enable row level security;

-- Public catalog/detail may read published reviews only.
drop policy if exists "Published reviews are readable" on public.product_reviews;
create policy "Published reviews are readable"
on public.product_reviews
for select
to anon, authenticated
using (status = 'PUBLISHED');

-- Buyer can read their own reviews even if a moderation status changes later.
drop policy if exists "Buyer can read own reviews" on public.product_reviews;
create policy "Buyer can read own reviews"
on public.product_reviews
for select
to authenticated
using (buyer_id = auth.uid());

-- Direct insert/update are kept restricted. App should use RPC buyer_submit_product_review.
drop policy if exists "Buyer can insert own eligible review directly" on public.product_reviews;
create policy "Buyer can insert own eligible review directly"
on public.product_reviews
for insert
to authenticated
with check (
  buyer_id = auth.uid()
  and exists (
    select 1
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.id = product_reviews.order_id
      and oi.id = product_reviews.order_item_id
      and o.buyer_id = auth.uid()
      and oi.product_id = product_reviews.product_id
      and coalesce(oi.variant_id, product_reviews.variant_id) is not distinct from coalesce(product_reviews.variant_id, oi.variant_id)
      and (
        upper(coalesce(o.order_status, '')) = 'SELESAI'
        or upper(coalesce(o.shipping_status, '')) = 'DITERIMA'
      )
  )
);

drop policy if exists "Buyer can update own review" on public.product_reviews;
create policy "Buyer can update own review"
on public.product_reviews
for update
to authenticated
using (buyer_id = auth.uid())
with check (buyer_id = auth.uid());

-- Summary view for catalog and product detail.
create or replace view public.v_product_review_summary
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
group by product_id;

-- Detail/recent view for product modal. Avoid exposing buyer email; only display profile name if available.
create or replace view public.v_product_reviews_public
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
  coalesce(p.full_name, 'Buyer') as buyer_name,
  oi.product_name,
  oi.sku_variant
from public.product_reviews pr
left join public.profiles p on p.id = pr.buyer_id
left join public.order_items oi on oi.id = pr.order_item_id
where pr.status = 'PUBLISHED';

-- Secure RPC used by buyer UI. It validates buyer owns the order and order has completed/received status.
create or replace function public.buyer_submit_product_review(
  p_order_id uuid,
  p_order_item_id uuid,
  p_rating integer,
  p_review_text text default null,
  p_image_url text default null,
  p_image_storage_path text default null
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
    image_url,
    image_storage_path,
    status
  ) values (
    v_item.order_id,
    v_item.order_item_id,
    v_item.product_id,
    v_item.variant_id,
    v_buyer_id,
    p_rating,
    nullif(trim(coalesce(p_review_text, '')), ''),
    nullif(trim(coalesce(p_image_url, '')), ''),
    nullif(trim(coalesce(p_image_storage_path, '')), ''),
    'PUBLISHED'
  )
  on conflict (order_item_id) do update set
    rating = excluded.rating,
    review_text = excluded.review_text,
    image_url = excluded.image_url,
    image_storage_path = excluded.image_storage_path,
    status = 'PUBLISHED',
    updated_at = now()
  where public.product_reviews.buyer_id = v_buyer_id
  returning * into v_review;

  return v_review;
end;
$$;

revoke all on function public.buyer_submit_product_review(uuid, uuid, integer, text, text, text) from public;
grant execute on function public.buyer_submit_product_review(uuid, uuid, integer, text, text, text) to authenticated;

grant select on public.v_product_review_summary to anon, authenticated;
grant select on public.v_product_reviews_public to anon, authenticated;

-- Verification query examples:
-- select * from public.v_product_review_summary limit 10;
-- select * from public.v_product_reviews_public order by created_at desc limit 10;
