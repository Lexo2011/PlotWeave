-- Plot Weave setup. Run in Supabase > SQL Editor. Safe to re-run: keeps existing data and updates the functions.

-- The admin is whoever logs in with this email (create that user in Supabase). Change it here AND in config.js.
create or replace function is_admin() returns boolean language sql stable as $$
  select coalesce(auth.jwt()->>'email','') = 'admin@example.com' $$;

create table if not exists circles(id uuid primary key default gen_random_uuid(), name text not null, concluded boolean default false, created_at timestamptz default now());
create table if not exists members(circle_id uuid references circles on delete cascade, username text, joined_at timestamptz default now(), primary key(circle_id, username));
create table if not exists stories(id uuid primary key default gen_random_uuid(), circle_id uuid references circles on delete cascade, starter text not null, created_at timestamptz default now());
create table if not exists contributions(id uuid primary key default gen_random_uuid(), story_id uuid references stories on delete cascade, author text not null, body text check (char_length(body) between 1 and 500), created_at timestamptz default now(), edited_at timestamptz, unique(story_id, author));
create table if not exists assignments(id uuid primary key default gen_random_uuid(), circle_id uuid references circles on delete cascade, username text not null, story_id uuid references stories on delete cascade, done boolean default false, assigned_at timestamptz default now());
create table if not exists settings(key text primary key, value text not null);
alter table contributions add column if not exists edited_by text;
alter table assignments add column if not exists active boolean default true;  -- false once a new day has started
insert into settings values ('visible_first','1'),('visible_last','2') on conflict do nothing;

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

create or replace function my_state(p_user text) returns json language plpgsql security definer set search_path=public as $$
declare u text := lower(trim(p_user)); t json;
  vf int := coalesce((select value::int from settings where key='visible_first'),1);
  vl int := coalesce((select value::int from settings where key='visible_last'),2);
begin
  if auth.uid() is null or u !~ '^[a-z0-9_]{2,24}$' then raise exception 'Not allowed'; end if;
  select json_build_object('story_id',a.story_id,'done',a.done,
      'own',(select body from contributions where story_id=a.story_id and author=u),
      'parts',case when a.done or a.story_id is null then '[]'::json else (
        select coalesce(json_agg(json_build_object('n',r.rn,'body',r.body) order by r.rn),'[]'::json)
        from (select body, row_number() over(order by created_at) rn, count(*) over() cnt from contributions where story_id=a.story_id) r
        where r.rn <= vf or r.rn > r.cnt - vl) end)
    into t from assignments a join circles c on c.id=a.circle_id
    where a.username=u and a.active and not c.concluded order by a.assigned_at desc limit 1;
  return json_build_object('turn',t,
    'in_circle',exists(select 1 from members m join circles c on c.id=m.circle_id where m.username=u and not c.concluded),
    'joinable',(select coalesce(json_agg(json_build_object('id',c.id,'name',c.name)),'[]'::json) from circles c
      where not c.concluded and not exists(select 1 from members m where m.circle_id=c.id and m.username=u)));
end $$;

create or replace function join_circle(p_user text, p_circle uuid) returns void language plpgsql security definer set search_path=public as $$
declare u text := lower(trim(p_user));
begin
  if auth.uid() is null or u !~ '^[a-z0-9_]{2,24}$' then raise exception 'Not allowed'; end if;
  insert into members(circle_id,username) select id,u from circles where id=p_circle and not concluded on conflict do nothing;
end $$;

create or replace function submit_turn(p_user text, p_body text) returns void language plpgsql security definer set search_path=public as $$
declare u text := lower(trim(p_user)); a assignments; sid uuid;
begin
  if auth.uid() is null or u !~ '^[a-z0-9_]{2,24}$' then raise exception 'Not allowed'; end if;
  select * into a from assignments where username=u and not done limit 1 for update;
  if not found then raise exception 'No turn is waiting for you'; end if;
  sid := a.story_id;
  if sid is null then insert into stories(circle_id,starter) values (a.circle_id,u) returning id into sid; end if;
  insert into contributions(story_id,author,body) values (sid,u,trim(p_body));
  update assignments set done=true, story_id=sid where id=a.id;
end $$;

-- A user may change their own paragraph until the next day starts.
create or replace function edit_turn(p_user text, p_body text) returns void language plpgsql security definer set search_path=public as $$
declare u text := lower(trim(p_user)); a assignments;
begin
  if auth.uid() is null or u !~ '^[a-z0-9_]{2,24}$' then raise exception 'Not allowed'; end if;
  select * into a from assignments where username=u and done and active order by assigned_at desc limit 1;
  if not found then raise exception 'There is nothing to edit'; end if;
  update contributions set body=trim(p_body), edited_at=now(), edited_by=u where story_id=a.story_id and author=u;
end $$;

-- The "new day" logic. Also callable from a schedule (pg_cron) as: select do_new_day();
create or replace function do_new_day() returns int language plpgsql security definer set search_path=public as $$
declare c record; s record; m text; n int := 0; busy text[];
begin
  delete from assignments where not done;        -- unanswered turns are handed out again
  update assignments set active=false where active;  -- yesterday's turns can no longer be edited
  for c in select id from circles where not concluded loop
    busy := '{}';
    -- members who have not started a story yet are asked to start one
    for m in select mb.username from members mb where mb.circle_id=c.id
        and not exists(select 1 from stories st where st.circle_id=c.id and st.starter=mb.username) loop
      insert into assignments(circle_id,username) values (c.id,m); busy := busy||m; n := n+1;
    end loop;
    -- each story goes to a random member who has not written in it and has no other turn today
    for s in select st.id from stories st where st.circle_id=c.id order by random() loop
      select mb.username into m from members mb where mb.circle_id=c.id and not (mb.username = any(busy))
        and not exists(select 1 from contributions co where co.story_id=s.id and co.author=mb.username)
      order by random() limit 1;
      if m is not null then
        insert into assignments(circle_id,username,story_id) values (c.id,m,s.id); busy := busy||m; n := n+1;
      end if;
    end loop;
  end loop;
  return n;
end $$;

create or replace function run_new_day() returns int language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() then raise exception 'Admin only'; end if;
  return do_new_day();
end $$;

create or replace function circle_ready(p_circle uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from members where circle_id=p_circle)
    and (select count(*) from stories where circle_id=p_circle) >= (select count(*) from members where circle_id=p_circle)
    and not exists(select 1 from stories s where s.circle_id=p_circle
      and (select count(*) from contributions c where c.story_id=s.id) < (select count(*) from members where circle_id=p_circle)) $$;

create or replace function conclude_circle(p_circle uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() then raise exception 'Admin only'; end if;
  if not circle_ready(p_circle) then raise exception 'Not every member has written in every story yet'; end if;
  update circles set concluded=true where id=p_circle;
end $$;

revoke execute on function do_new_day() from public, anon, authenticated;
revoke execute on function is_admin(), my_state(text), join_circle(text,uuid), submit_turn(text,text), edit_turn(text,text), run_new_day(), circle_ready(uuid), conclude_circle(uuid) from public, anon;
grant execute on function is_admin(), my_state(text), join_circle(text,uuid), submit_turn(text,text), edit_turn(text,text), run_new_day(), circle_ready(uuid), conclude_circle(uuid) to authenticated;
