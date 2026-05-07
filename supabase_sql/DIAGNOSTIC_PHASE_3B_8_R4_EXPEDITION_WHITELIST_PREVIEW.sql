-- Diagnostic Phase 3B.8-R4 - Expedition Source / Whitelist Preview
-- Tujuan: cek keberadaan tabel ekspedisi/manual/fallback yang mungkin dipakai aplikasi.
select 'phase_3b_8_r4_expedition_whitelist_preview_ready' as status, now() as executed_at;

select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and (
    table_name ilike '%exped%'
    or table_name ilike '%shipping%'
    or table_name ilike '%courier%'
  )
order by table_schema, table_name;

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    table_name ilike '%exped%'
    or table_name ilike '%shipping%'
    or table_name ilike '%courier%'
  )
order by table_name, ordinal_position;
