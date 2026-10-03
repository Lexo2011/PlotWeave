-- Run in Supabase > SQL Editor. Replaces the earlier setup (prototype data is deleted).
drop function if exists get_turn();
drop function if exists submit_turn(text,text,boolean);
drop table if exists assignments, contributions, stories cascade;

create table stories(id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), finished boolean default false);
create table contributions(id uuid primary key default gen_random_uuid(), story_id uuid references stories on delete cascade, author text not null, body text check (char_length(body) between 1 and 500), created_at timestamptz default now());
create table assignments(author text, day date default current_date, story_id uuid references stories, done boolean default false, primary key(author, day));

alter table stories enable row level security;
alter table contributions enable row level security;
alter table assignments enable row level security;
-- Only someone logged in with the site password can read finished stories. Everything else goes through the functions.
create policy "read finished" on stories for select to authenticated using (finished);
create policy "read finished" on contributions for select to authenticated using (exists(select 1 from stories s where s.id = story_id and s.finished));

create function get_turn(p_user text) returns json language plpgsql security definer set search_path=public as $$
declare u text := lower(trim(p_user)); a assignments; sid uuid; lastbody text; n int;
begin
  if auth.uid() is null or u !~ '^[a-z0-9_]{2,24}$' then raise exception 'Not allowed'; end if;
  select * into a from assignments where author=u and day=current_date;
  if not found then
    select s.id into sid from stories s where not s.finished
      and not exists(select 1 from contributions c where c.story_id=s.id and c.author=u)
    order by random() limit 1;
    insert into assignments(author, story_id) values (u, sid) returning * into a;
  end if;
  if a.story_id is not null then
    select body into lastbody from contributions where story_id=a.story_id order by created_at desc limit 1;
    select count(*) into n from contributions where story_id=a.story_id;
  end if;
  return json_build_object('done',a.done,'story_id',a.story_id,'last',lastbody,'count',n);
end $$;

create function submit_turn(p_user text, p_body text, p_finish boolean) returns void language plpgsql security definer set search_path=public as $$
declare u text := lower(trim(p_user)); a assignments; sid uuid;
begin
  if auth.uid() is null or u !~ '^[a-z0-9_]{2,24}$' then raise exception 'Not allowed'; end if;
  select * into a from assignments where author=u and day=current_date for update;
  if not found or a.done then raise exception 'No turn available today'; end if;
  sid := a.story_id;
  if sid is null then insert into stories default values returning id into sid; end if;
  insert into contributions(story_id,author,body) values (sid,u,p_body);
  if p_finish or (select count(*) from contributions where story_id=sid) >= 10 then update stories set finished=true where id=sid; end if;
  update assignments set done=true, story_id=sid where author=u and day=current_date;
end $$;

revoke execute on function get_turn(text), submit_turn(text,text,boolean) from public, anon;
grant execute on function get_turn(text), submit_turn(text,text,boolean) to authenticated;
