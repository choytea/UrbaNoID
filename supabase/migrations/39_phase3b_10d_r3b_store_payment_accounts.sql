create table if not exists public.store_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  payment_type text not null default 'BANK_TRANSFER',
  bank_name text not null,
  account_number text,
  account_holder text not null,
  note text,
  qris_image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_payment_accounts_payment_type_check
    check (payment_type in ('BANK_TRANSFER', 'EWALLET', 'QRIS'))
);

alter table public.store_payment_accounts enable row level security;

drop policy if exists store_payment_accounts_select_authenticated on public.store_payment_accounts;
create policy store_payment_accounts_select_authenticated
on public.store_payment_accounts
for select
to authenticated
using (true);

drop policy if exists store_payment_accounts_write_authenticated on public.store_payment_accounts;
create policy store_payment_accounts_write_authenticated
on public.store_payment_accounts
for all
to authenticated
using (true)
with check (true);

create or replace function public.set_store_payment_accounts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_store_payment_accounts_updated_at on public.store_payment_accounts;
create trigger trg_store_payment_accounts_updated_at
before update on public.store_payment_accounts
for each row
execute function public.set_store_payment_accounts_updated_at();

insert into public.store_payment_accounts
  (payment_type, bank_name, account_number, account_holder, note, qris_image_url, is_active, sort_order)
select
  'BANK_TRANSFER',
  'BCA',
  '639593157',
  'Hadi Sukoco / UrbaNoID Official Store',
  'Transfer BCA',
  null,
  true,
  10
where not exists (
  select 1 from public.store_payment_accounts
  where payment_type = 'BANK_TRANSFER'
    and bank_name = 'BCA'
    and account_number = '639593157'
);

insert into public.store_payment_accounts
  (payment_type, bank_name, account_number, account_holder, note, qris_image_url, is_active, sort_order)
select
  'QRIS',
  'QRIS',
  null,
  'URBANOID OFFICIAL STORE, FASHION',
  'QRIS resmi UrbaNoID',
  '/payments/urbanoid-qris.jpeg',
  true,
  1
where not exists (
  select 1 from public.store_payment_accounts
  where payment_type = 'QRIS'
);
