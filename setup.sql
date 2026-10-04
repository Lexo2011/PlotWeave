-- Plot Weave setup. Run in Supabase > SQL Editor. Safe to re-run: keeps existing data and updates the functions.

-- The admin is whoever logs in with this email (create that user in Supabase). Change it here AND in config.js.
create or replace function is_admin() returns boolean language sql stable as $$
  select coalesce(auth.jwt()->>'email','') = 'admin@example.com' $$;

create table if not exists circles(id uuid primary key default gen_random_uuid(), name text not null, concluded boolean default false, created_at timestamptz default now());
create table if not exists members(circle_id uuid references circles on delete cascade, username text, joined_at timestamptz default now(), primary key(circle_id, username));
create table if not exists stories(id uuid primary key default gen_random_uuid(), circle_id uuid references circles on delete cascade, starter text not null, created_at timestamptz default now());
create table if not exists contributions(id uuid primary key default gen_random_uuid(), story_id uuid references stories on delete cascade, author text not null, body text check (char_length(body) between 1 and 500), created_at timestamptz default now(), edited_at timestamptz, unique(story_id, author));
create table if not exists assignments(id uuid primary key default gen_random_uuid(), circle_id uuid references circles on delete cascade, username text not null, story_id uuid references stories on delete cascade, done boolean default false, assigned_at timestamptz default now());
create table if not exists settings(key text primary key, value text not null);  -- site-wide texts from the admin panel
alter table contributions add column if not exists edited_by text;
alter table assignments add column if not exists active boolean default true;  -- false once a new day has started
alter table assignments add column if not exists missed boolean default false; -- the writer did not write before the next day started
alter table assignments add column if not exists seen boolean default false;   -- the admin has dismissed the notice about a missed turn

-- Everything about one circle is configured on the circle (admin panel > Circle settings).
do $$ begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='circles' and column_name='visible_first') then
    alter table circles add column visible_first int not null default 1, add column visible_last int not null default 2;
    -- these two used to be site-wide settings
    update circles set visible_first=coalesce((select value::int from settings where key='visible_first'),1),
                       visible_last=coalesce((select value::int from settings where key='visible_last'),2);
  end if;
end $$;
delete from settings where key in ('visible_first','visible_last');
alter table circles add column if not exists description text not null default '';
alter table circles add column if not exists joinable boolean not null default true;
alter table circles add column if not exists max_chars int not null default 500;
alter table circles add column if not exists texts jsonb not null default '{}';
alter table circles add column if not exists distribute_at time;                -- daily hand-out time; null = only by hand
alter table circles add column if not exists tz text not null default 'UTC';    -- time zone distribute_at is meant in
alter table circles add column if not exists schedule_since timestamptz not null default now();
alter table circles add column if not exists last_distributed_at timestamptz;
-- The longest paragraph is set per circle (max_chars); this is only the upper bound.
alter table contributions drop constraint if exists contributions_body_check;
alter table contributions add constraint contributions_body_check check (char_length(body) between 1 and 5000);

do $$ declare t text; begin
  foreach t in array array['circles','members','stories','contributions','assignments','settings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists admin_all on %I', t);
    execute format('create policy admin_all on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;
-- Everyone with the site password can read concluded circles. All other access goes through the functions below.
drop policy if exists read_concluded on circles;
drop policy if exists read_concluded on stories;
drop policy if exists read_concluded on contributions;
create policy read_concluded on circles for select to authenticated using (concluded);
create policy read_concluded on stories for select to authenticated using (exists(select 1 from circles c where c.id=circle_id and c.concluded));
create policy read_concluded on contributions for select to authenticated using (exists(select 1 from stories s join circles c on c.id=s.circle_id where s.id=story_id and c.concluded));
-- The site texts are shown before anyone has entered the site password.
drop policy if exists read_all on settings;
create policy read_all on settings for select to anon, authenticated using (true);

-- Turns are handed out from the admin panel only. Remove a pg_cron job from an earlier setup, if there is one.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    execute $q$select cron.unschedule(jobid) from cron.job where command ilike '%do_new_day%'$q$;
  end if;
end $$;

-- The most recent moment the daily time t (in time zone z) has passed.
create or replace function last_slot(t time, z text) returns timestamptz language sql stable as $$
  select (case when l::time >= t then l::date else l::date - 1 end + t) at time zone z from (select now() at time zone z l) x $$;

-- A changed hand-out time only counts from now on, so saving a time that has already passed today does not hand out turns right away.
create or replace function circle_changed() returns trigger language plpgsql as $$
begin
  perform now() at time zone new.tz;  -- raises on an unknown time zone
  if tg_op = 'INSERT' then new.schedule_since := now();
  elsif new.distribute_at is distinct from old.distribute_at or new.tz is distinct from old.tz then new.schedule_since := now();
  end if;
  return new;
end $$;
drop trigger if exists circle_changed on circles;
create trigger circle_changed before insert or update on circles for each row execute function circle_changed();

-- The "new day" logic for one circle.
drop function if exists do_new_day();
drop function if exists run_new_day();
drop function if exists do_new_day(uuid);
create function do_new_day(p_circle uuid) returns int language plpgsql security definer set search_path=public as $$
declare s record; m text; n int := 0; busy text[] := '{}';
begin
  perform 1 from circles where id=p_circle and not concluded for update;
  if not found then return 0; end if;
  -- Yesterday's turns can no longer be edited. A turn nobody answered is skipped for good: the circle moves on without that paragraph.
  update assignments set missed = not done, active=false where circle_id=p_circle and active;
  -- members who have not been asked to start a story yet are asked to start one
  for m in select mb.username from members mb where mb.circle_id=p_circle
      and not exists(select 1 from stories st where st.circle_id=p_circle and st.starter=mb.username)
      and not exists(select 1 from assignments a where a.circle_id=p_circle and a.username=mb.username and a.story_id is null and a.missed) loop
    insert into assignments(circle_id,username) values (p_circle,m); busy := busy||m; n := n+1;
  end loop;
  -- each story goes to a random member who has not had a turn in it and has no other turn today
  for s in select st.id from stories st where st.circle_id=p_circle order by random() loop
    select mb.username into m from members mb where mb.circle_id=p_circle and not (mb.username = any(busy))
      and not exists(select 1 from contributions co where co.story_id=s.id and co.author=mb.username)
      and not exists(select 1 from assignments a where a.story_id=s.id and a.username=mb.username)
    order by random() limit 1;
    if m is not null then
      insert into assignments(circle_id,username,story_id) values (p_circle,m,s.id); busy := busy||m; n := n+1;
    end if;
  end loop;
  update circles set last_distributed_at=now() where id=p_circle;
  return n;
end $$;

-- Starts the new day of every circle whose daily hand-out time has passed. There is no background job:
-- this runs whenever a writer or the admin opens the page, so turns are handed out at the first visit after that time.
create or replace function tick() returns void language plpgsql security definer set search_path=public as $$
declare c record;
begin
  if auth.uid() is null then raise exception 'Nicht erlaubt'; end if;
  for c in select id from circles where not concluded and distribute_at is not null
      and last_slot(distribute_at, tz) > greatest(last_distributed_at, schedule_since) for update loop
    perform do_new_day(c.id);
  end loop;
end $$;

create or replace function my_state(p_user text) returns json language plpgsql security definer set search_path=public as $$
declare u text := lower(trim(p_user)); asg assignments; cir circles; t json;
begin
  if auth.uid() is null or u !~ '^[a-z0-9_]{2,24}$' then raise exception 'Nicht erlaubt'; end if;
  perform tick();
  select a.* into asg from assignments a join circles c on c.id=a.circle_id
    where a.username=u and a.active and not c.concluded order by a.assigned_at desc limit 1;
  if found then
    select * into cir from circles where id=asg.circle_id;
    t := json_build_object('story_id',asg.story_id,'done',asg.done,
      'own',(select body from contributions where story_id=asg.story_id and author=u),
      'parts',(select coalesce(json_agg(json_build_object('n',r.rn,'body',r.body) order by r.rn),'[]'::json)
        from (select body, row_number() over(order by created_at) rn, count(*) over() cnt from contributions where story_id=asg.story_id and author<>u) r
        where r.rn <= cir.visible_first or r.rn > r.cnt - cir.visible_last));
  else
    select c.* into cir from circles c join members mb on mb.circle_id=c.id where mb.username=u and not c.concluded order by mb.joined_at desc limit 1;
  end if;
  return json_build_object('turn',t,
    'in_circle',cir.id is not null,
    'circle',case when cir.id is not null then json_build_object('name',cir.name,'description',cir.description,'texts',cir.texts,'max_chars',cir.max_chars,
      'next',case when cir.distribute_at is not null then last_slot(cir.distribute_at,cir.tz) + interval '1 day' end) end,
    'joinable',(select coalesce(json_agg(json_build_object('id',c.id,'name',c.name,'description',c.description) order by c.created_at),'[]'::json) from circles c
      where not c.concluded and c.joinable and not exists(select 1 from members mb where mb.circle_id=c.id and mb.username=u)));
end $$;

create or replace function join_circle(p_user text, p_circle uuid) returns void language plpgsql security definer set search_path=public as $$
declare u text := lower(trim(p_user));
begin
  if auth.uid() is null or u !~ '^[a-z0-9_]{2,24}$' then raise exception 'Nicht erlaubt'; end if;
  insert into members(circle_id,username) select id,u from circles where id=p_circle and not concluded and joinable on conflict do nothing;
end $$;

create or replace function submit_turn(p_user text, p_body text) returns void language plpgsql security definer set search_path=public as $$
declare u text := lower(trim(p_user)); b text := trim(p_body); a assignments; sid uuid; mx int;
begin
  if auth.uid() is null or u !~ '^[a-z0-9_]{2,24}$' then raise exception 'Nicht erlaubt'; end if;
  perform tick();
  select x.* into a from assignments x join circles c on c.id=x.circle_id
    where x.username=u and not x.done and x.active and not c.concluded order by x.assigned_at desc limit 1 for update of x;
  if not found then raise exception 'Du bist gerade nicht an der Reihe'; end if;
  select max_chars into mx from circles where id=a.circle_id;
  if char_length(b) not between 1 and mx then raise exception 'Ein Absatz braucht 1 bis % Zeichen', mx; end if;
  sid := a.story_id;
  if sid is null then insert into stories(circle_id,starter) values (a.circle_id,u) returning id into sid; end if;
  insert into contributions(story_id,author,body) values (sid,u,b);
  update assignments set done=true, story_id=sid where id=a.id;
end $$;

-- A user may change their own paragraph until the next day starts.
create or replace function edit_turn(p_user text, p_body text) returns void language plpgsql security definer set search_path=public as $$
declare u text := lower(trim(p_user)); b text := trim(p_body); a assignments; mx int;
begin
  if auth.uid() is null or u !~ '^[a-z0-9_]{2,24}$' then raise exception 'Nicht erlaubt'; end if;
  perform tick();
  select x.* into a from assignments x join circles c on c.id=x.circle_id
    where x.username=u and x.done and x.active and not c.concluded order by x.assigned_at desc limit 1;
  if not found then raise exception 'Es gibt nichts zu ändern'; end if;
  select max_chars into mx from circles where id=a.circle_id;
  if char_length(b) not between 1 and mx then raise exception 'Ein Absatz braucht 1 bis % Zeichen', mx; end if;
  update contributions set body=b, edited_at=now(), edited_by=u where story_id=a.story_id and author=u;
end $$;

create or replace function run_new_day(p_circle uuid) returns int language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() then raise exception 'Nur für Admins'; end if;
  return do_new_day(p_circle);
end $$;

-- A circle is finished when no turn is open and every member has had (written or missed) a turn to start a story and a turn in every story.
create or replace function circle_ready(p_circle uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from stories where circle_id=p_circle)
    and not exists(select 1 from assignments where circle_id=p_circle and active and not done)
    and not exists(select 1 from members m where m.circle_id=p_circle
      and not exists(select 1 from stories s where s.circle_id=p_circle and s.starter=m.username)
      and not exists(select 1 from assignments a where a.circle_id=p_circle and a.username=m.username and a.story_id is null and a.missed))
    and not exists(select 1 from members m join stories s on s.circle_id=m.circle_id where m.circle_id=p_circle
      and not exists(select 1 from contributions c where c.story_id=s.id and c.author=m.username)
      and not exists(select 1 from assignments a where a.story_id=s.id and a.username=m.username and a.missed)) $$;

create or replace function conclude_circle(p_circle uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() then raise exception 'Nur für Admins'; end if;
  if not circle_ready(p_circle) then raise exception 'In diesem Kreis sind noch nicht alle an der Reihe gewesen'; end if;
  update circles set concluded=true where id=p_circle;
end $$;

revoke execute on function do_new_day(uuid), last_slot(time,text), circle_changed() from public, anon, authenticated;
revoke execute on function is_admin(), tick(), my_state(text), join_circle(text,uuid), submit_turn(text,text), edit_turn(text,text), run_new_day(uuid), circle_ready(uuid), conclude_circle(uuid) from public, anon;
grant execute on function is_admin(), tick(), my_state(text), join_circle(text,uuid), submit_turn(text,text), edit_turn(text,text), run_new_day(uuid), circle_ready(uuid), conclude_circle(uuid) to authenticated;
