-- DIAGNOSTIC STOCK MUTATIONS
-- Jalankan jika ingin melihat struktur stock_mutations saat ini.

select
  table_schema,
  table_name,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'stock_mutations'
order by ordinal_position;

-- Cek 10 mutasi terbaru:
select *
from public.stock_mutations
order by created_at desc
limit 10;