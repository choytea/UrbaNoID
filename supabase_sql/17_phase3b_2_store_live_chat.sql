-- ============================================================
-- UrbaNoiD Supabase Native
-- PHASE 3B.2: Buyer Header, Store Follow, Store Live Chat
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. Helper role functions
-- ------------------------------------------------------------

create or replace function public.current_app_role_text()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.role::text
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
      limit 1
    ),
    auth.jwt() -> 'app_metadata' ->> 'role',
    ''
  );
$$;

create or replace function public.is_admin_or_seller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role_text() in ('ADMIN', 'SUPERADMIN', 'SELLER');
$$;

-- ------------------------------------------------------------
-- 2. Store live chat tables
-- ------------------------------------------------------------

create table if not exists public.store_chats (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.store_profiles(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  subject text,
  status text not null default 'OPEN',
  last_message text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, buyer_id)
);

create table if not exists public.store_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.store_chats(id) on delete cascade,
  sender_id uuid,
  sender_role text not null default 'BUYER',
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_store_chats_buyer_id on public.store_chats(buyer_id);
create index if not exists idx_store_chats_store_id on public.store_chats(store_id);
create index if not exists idx_store_chats_last_message_at on public.store_chats(last_message_at desc nulls last);
create index if not exists idx_store_chat_messages_chat_created on public.store_chat_messages(chat_id, created_at);

-- ------------------------------------------------------------
-- 3. RLS
-- ------------------------------------------------------------

alter table public.store_chats enable row level security;
alter table public.store_chat_messages enable row level security;

drop policy if exists "store_chats_read_related" on public.store_chats;
drop policy if exists "store_chats_insert_buyer" on public.store_chats;
drop policy if exists "store_chats_update_related" on public.store_chats;
drop policy if exists "store_chat_messages_read_related" on public.store_chat_messages;
drop policy if exists "store_chat_messages_insert_related" on public.store_chat_messages;

create policy "store_chats_read_related"
on public.store_chats for select
to authenticated
using (
  public.is_admin_or_seller()
  or buyer_id = auth.uid()
);

create policy "store_chats_insert_buyer"
on public.store_chats for insert
to authenticated
with check (buyer_id = auth.uid());

create policy "store_chats_update_related"
on public.store_chats for update
to authenticated
using (
  public.is_admin_or_seller()
  or buyer_id = auth.uid()
)
with check (
  public.is_admin_or_seller()
  or buyer_id = auth.uid()
);

create policy "store_chat_messages_read_related"
on public.store_chat_messages for select
to authenticated
using (
  public.is_admin_or_seller()
  or exists (
    select 1
    from public.store_chats sc
    where sc.id = store_chat_messages.chat_id
      and sc.buyer_id = auth.uid()
  )
);

create policy "store_chat_messages_insert_related"
on public.store_chat_messages for insert
to authenticated
with check (
  public.is_admin_or_seller()
  or exists (
    select 1
    from public.store_chats sc
    where sc.id = store_chat_messages.chat_id
      and sc.buyer_id = auth.uid()
  )
);

grant select, insert, update on public.store_chats to authenticated;
grant select, insert on public.store_chat_messages to authenticated;
grant usage on schema public to anon, authenticated;

commit;

select 'phase_3b_2_buyer_header_store_chat_ready' as status, now() as executed_at;
