-- Plot Weave backup. Run in Supabase > SQL Editor before bigger changes.
-- Copies every table into the schema "backup", with date and time in the name (e.g. backup.contributions_20261107_1530).
-- Nothing in the app changes, and the backup schema cannot be reached from the website.
create schema if not exists backup;
do $$ declare t text; s text := to_char(now() at time zone 'Europe/Berlin','YYYYMMDD_HH24MI'); begin
  foreach t in array array['circles','members','stories','contributions','assignments','settings'] loop
    execute format('create table backup.%I as table public.%I', t||'_'||s, t);
  end loop;
end $$;
-- Shows all backups with their number of rows, so you can see that it worked.
select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from backup.%I', table_name), false, true, '')))[1]::text::int as rows
from information_schema.tables where table_schema='backup' order by table_name;
