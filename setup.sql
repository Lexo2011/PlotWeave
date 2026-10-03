-- Run once in Supabase > SQL Editor
create table stories(id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), finished boolean default false);
create table contributions(id uuid primary key default gen_random_uuid(), story_id uuid references stories on delete cascade, user_id uuid references auth.users, author text, body text check (char_length(body) between 1 and 500), created_at timestamptz default now());
create table assignments(user_id uuid references auth.users, day date default current_date, story_id uuid references stories, done boolean default false, primary key(user_id, day));

alter table stories enable row level security;
alter table contributions enable row level security;
alter table assignments enable row level security;
-- Anyone can read finished stories. Everything else goes through the functions below.
create policy "read finished" on stories for select using (finished);
create policy "read finished" on contributions for select using (exists(select 1 from stories s where s.id = story_id and s.finished));

create function get_turn() returns json language plpgsql security definer set search_path=public as $$
declare a assignments; sid uuid; lastbody text; n int;
begin
  select * into a from assignments where user_id=auth.uid() and day=current_date;
  if not found then
    select s.id into sid from stories s where not s.finished
      and not exists(select 1 from contributions c where c.story_id=s.id and c.user_id=auth.uid())
    order by random() limit 1;
    insert into assignments(user_id, story_id) values (auth.uid(), sid) returning * into a;
  end if;
  if a.story_id is not null then
    select body into lastbody from contributions where story_id=a.story_id order by created_at desc limit 1;
    select count(*) into n from contributions where story_id=a.story_id;
  end if;
  return json_build_object('done',a.done,'story_id',a.story_id,'last',lastbody,'count',n);
end $$;

create function submit_turn(p_body text, p_author text, p_finish boolean) returns void language plpgsql security definer set search_path=public as $$
declare a assignments; sid uuid;
begin
  select * into a from assignments where user_id=auth.uid() and day=current_date for update;
  if not found or a.done then raise exception 'No turn available today'; end if;
  sid := a.story_id;
  if sid is null then insert into stories default values returning id into sid; end if;
  insert into contributions(story_id,user_id,author,body) values (sid,auth.uid(),left(p_author,40),p_body);
  if p_finish or (select count(*) from contributions where story_id=sid) >= 10 then update stories set finished=true where id=sid; end if;
  update assignments set done=true, story_id=sid where user_id=auth.uid() and day=current_date;
end $$;

grant execute on function get_turn(), submit_turn(text,text,boolean) to authenticated;
