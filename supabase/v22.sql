-- Ranked v22: hype profiles. A 🔥 Hype button (once a day per mate, owner gets notified) and a profile anthem (an anime opening). Run after v21.sql.

alter table profiles add column if not exists anthem text check (char_length(anthem) <= 40);  -- song id from songs.js

create table if not exists profile_hypes (
  target uuid not null references profiles on delete cascade,
  from_user uuid not null references profiles on delete cascade,
  day date not null default current_date,
  primary key (target, from_user, day)
);
alter table profile_hypes enable row level security;
create policy "read hypes" on profile_hypes for select to authenticated using (true);

create or replace function hype_profile(p_target uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_target = auth.uid() then raise exception 'You can''t hype yourself'; end if;
  insert into profile_hypes (target, from_user) values (p_target, auth.uid()) on conflict do nothing;
  if not found then raise exception 'Already hyped today. Come back tomorrow'; end if;
  insert into notifications (user_id, text) values (p_target, format('🔥 %s hyped your profile!', (select username from profiles where id = auth.uid())));
  select count(*) into n from profile_hypes where target = p_target;
  return n;
end $$;

alter publication supabase_realtime add table profile_hypes;
