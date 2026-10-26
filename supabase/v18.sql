-- Ranked v18: Fantasy captain. Each week you pick one of your 5 as captain and their points count double.
-- One pick per week (it locks once set); if you don't pick, last week's captain carries over. Run after v17.sql.

create table if not exists fantasy_captains (
  season text not null, week int not null,
  user_id uuid not null references profiles on delete cascade,
  char_id int not null references characters on delete cascade,
  set_at timestamptz default now(),
  primary key (season, week, user_id)
);
alter table fantasy_captains enable row level security;
create policy "read captains" on fantasy_captains for select to authenticated using (true);

create or replace function fantasy_captain_of(p_user uuid, p_season text, p_week int) returns int language sql stable as $$
  select char_id from fantasy_captains where user_id = p_user and season = p_season and week <= p_week order by week desc limit 1
$$;

create or replace function fantasy_set_captain(p_char int) returns void
language plpgsql security definer set search_path = public as $$
declare s text := fantasy_season(); w int := fantasy_week();
begin
  if not exists (select 1 from fantasy_picks where season = s and user_id = auth.uid() and char_id = p_char) then raise exception 'That character is not on your team'; end if;
  if exists (select 1 from fantasy_captains where season = s and week = w and user_id = auth.uid()) then raise exception 'Captain is locked for this week'; end if;
  insert into fantasy_captains (season, week, user_id, char_id) values (s, w, auth.uid(), p_char);
end $$;

-- double any character points scored while they're captain (team-wide points like the squad vote stay as they are)
create or replace function fantasy_captain_bonus() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.char_id is not null and new.char_id = fantasy_captain_of(new.team_user, new.season, new.week) then
    new.points := new.points * 2;
    new.note := left('(C) ' || coalesce(new.note, ''), 200);
  end if;
  return new;
end $$;
drop trigger if exists fantasy_captain_bonus on fantasy_events;
create trigger fantasy_captain_bonus before insert on fantasy_events for each row execute function fantasy_captain_bonus();

alter publication supabase_realtime add table fantasy_captains;
