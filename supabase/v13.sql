-- Ranked v13: Fantasy League. Pick 5 characters per anime season; points come from real-world
-- signals (automatic) and squad-logged events (need a second person to confirm). Run after v12.sql.

-- season key + week number (seasons follow anime seasons: Winter Jan-Mar, Spring Apr-Jun, Summer Jul-Sep, Fall Oct-Dec)
create or replace function fantasy_season(ts timestamptz default now()) returns text language sql immutable as $$
  select (array['WINTER','SPRING','SUMMER','FALL'])[(extract(month from ts)::int - 1) / 3 + 1] || '-' || extract(year from ts)::int
$$;
create or replace function fantasy_season_start(ts timestamptz default now()) returns timestamptz language sql immutable as $$
  select make_timestamptz(extract(year from ts)::int, ((extract(month from ts)::int - 1) / 3) * 3 + 1, 1, 0, 0, 0, 'UTC')
$$;
create or replace function fantasy_week(ts timestamptz default now()) returns int language sql immutable as $$
  select floor(extract(epoch from ts - fantasy_season_start(ts)) / 604800)::int + 1
$$;

-- one row per picked character; a character can only be on one team per season
create table if not exists fantasy_picks (
  season text not null,
  char_id int not null references characters on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  picked_at timestamptz default now(),
  primary key (season, char_id)
);
create index if not exists fantasy_picks_user on fantasy_picks (season, user_id);

create table if not exists fantasy_swaps (
  season text not null, user_id uuid not null references profiles on delete cascade,
  week int not null, out_char int, in_char int, created_at timestamptz default now(),
  primary key (season, user_id, week)
);

-- every point change; team_user = whose team the character was on when it happened
create table if not exists fantasy_events (
  id bigserial primary key,
  season text not null default fantasy_season(),
  week int not null default fantasy_week(),
  team_user uuid not null references profiles on delete cascade,
  char_id int references characters on delete set null,
  kind text not null,
  points int not null,
  note text check (char_length(note) <= 200),
  link text check (char_length(link) <= 300),
  source text not null default 'auto',          -- auto | squad | vote
  status text not null default 'confirmed',     -- pending | confirmed | rejected
  logged_by uuid references profiles on delete set null,
  confirmed_by uuid references profiles on delete set null,
  created_at timestamptz default now()
);
create index if not exists fantasy_events_season on fantasy_events (season, team_user);

-- weekly "who's hyper?" vote between two teams
create table if not exists fantasy_votes (
  season text not null, week int not null,
  a_user uuid not null references profiles on delete cascade,
  b_user uuid not null references profiles on delete cascade,
  voter uuid not null default auth.uid() references profiles on delete cascade,
  pick uuid not null references profiles on delete cascade,
  primary key (season, week, a_user, b_user, voter)
);

alter table fantasy_picks enable row level security;
alter table fantasy_swaps enable row level security;
alter table fantasy_events enable row level security;
alter table fantasy_votes enable row level security;
create policy "read picks" on fantasy_picks for select to authenticated using (true);
create policy "read swaps" on fantasy_swaps for select to authenticated using (true);
create policy "read fantasy events" on fantasy_events for select to authenticated using (true);
create policy "read fantasy votes" on fantasy_votes for select to authenticated using (true);
create policy "cast fantasy vote" on fantasy_votes for all to authenticated
  using (voter = auth.uid())
  with check (voter = auth.uid() and voter not in (a_user, b_user) and pick in (a_user, b_user)
    and season = fantasy_season() and week = fantasy_week());

-- pick your 5 (once per season)
create or replace function fantasy_pick(p_chars int[]) returns void
language plpgsql security definer set search_path = public as $$
declare s text := fantasy_season(); c int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if (select count(distinct x) from unnest(p_chars) x) <> 5 then raise exception 'Pick exactly 5 different characters'; end if;
  if exists (select 1 from fantasy_picks where season = s and user_id = auth.uid()) then raise exception 'You already have a team this season'; end if;
  foreach c in array p_chars loop
    if exists (select 1 from fantasy_picks where season = s and char_id = c) then
      raise exception '% is already on someone''s team', (select name from characters where id = c);
    end if;
    insert into fantasy_picks (season, char_id, user_id) values (s, c, auth.uid());
  end loop;
end $$;

-- swap one character, once per week
create or replace function fantasy_swap(p_out int, p_in int) returns void
language plpgsql security definer set search_path = public as $$
declare s text := fantasy_season(); w int := fantasy_week();
begin
  if not exists (select 1 from fantasy_picks where season = s and user_id = auth.uid() and char_id = p_out) then raise exception 'That character is not on your team'; end if;
  if exists (select 1 from fantasy_swaps where season = s and user_id = auth.uid() and week = w) then raise exception 'You already swapped this week'; end if;
  if exists (select 1 from fantasy_picks where season = s and char_id = p_in) then raise exception 'That character is already taken'; end if;
  delete from fantasy_picks where season = s and char_id = p_out;
  insert into fantasy_picks (season, char_id, user_id) values (s, p_in, auth.uid());
  insert into fantasy_swaps values (s, auth.uid(), w, p_out, p_in, now());
end $$;

-- squad-logged events: anyone logs, someone else confirms
create or replace function fantasy_log(p_char int, p_kind text, p_note text, p_link text) returns bigint
language plpgsql security definer set search_path = public as $$
declare s text := fantasy_season(); owner uuid; pts int; eid bigint;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  pts := case p_kind when 'transform' then 20 when 'win' then 15 when 'appear' then 3 when 'lose' then -5 when 'death' then -20 when 'revive' then 0 end;
  if pts is null then raise exception 'Unknown event'; end if;
  select user_id into owner from fantasy_picks where season = s and char_id = p_char;
  if owner is null then raise exception 'That character is not on any team'; end if;
  insert into fantasy_events (team_user, char_id, kind, points, note, link, source, status, logged_by)
    values (owner, p_char, p_kind, pts, nullif(trim(p_note), ''), nullif(trim(p_link), ''), 'squad', 'pending', auth.uid()) returning id into eid;
  return eid;
end $$;

create or replace function fantasy_review(p_id bigint, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update fantasy_events set status = case when p_ok then 'confirmed' else 'rejected' end, confirmed_by = auth.uid()
    where id = p_id and status = 'pending' and logged_by <> auth.uid() and season = fantasy_season();
  if not found then raise exception 'Can''t review this one (you logged it, or it''s already done)'; end if;
end $$;

-- a character is "dead" if their latest confirmed death has no later revive
create or replace function fantasy_dead(p_char int, p_season text) returns boolean language sql stable as $$
  select coalesce((select kind = 'death' from fantasy_events
    where char_id = p_char and season = p_season and status = 'confirmed' and kind in ('death', 'revive')
    order by created_at desc limit 1), false)
$$;

-- automatic: new episode (+10) / new chapter (+8) the moment the collector flags it
create or replace function fantasy_on_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; s text := fantasy_season();
begin
  if new.event_key is not null and new.event_key is distinct from old.event_key then
    select user_id into owner from fantasy_picks where season = s and char_id = new.id;
    if owner is not null and not fantasy_dead(new.id, s) then
      insert into fantasy_events (team_user, char_id, kind, points, note)
        values (owner, new.id, case when new.event_key like 'm%' then 'chapter' else 'episode' end,
                case when new.event_key like 'm%' then 8 else 10 end, new.event_label);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists fantasy_on_event on characters;
create trigger fantasy_on_event after update of event_key on characters for each row execute function fantasy_on_event();

-- end of each league week (checked hourly): Wikipedia spike (up to 15), AniList fans (up to 10), trending (+5),
-- break (-5), and +5 to the winner of each squad vote. Runs once per finished week.
create or replace function fantasy_weekly() returns void
language plpgsql security definer set search_path = public as $$
declare s text := fantasy_season(now() - interval '1 hour'); w int := fantasy_week(now() - interval '1 hour');
  p record; v record; hp jsonb; air text; mb record;
begin
  if fantasy_season() = s and fantasy_week() = w then return; end if;  -- week not finished yet
  if exists (select 1 from app_config where key = 'fantasy_done_' || s || '_' || w) then return; end if;
  for p in select fp.*, c.hype_parts, c.manga_id, c.manga_status from fantasy_picks fp join characters c on c.id = fp.char_id where fp.season = s loop
    if fantasy_dead(p.char_id, s) then continue; end if;
    hp := coalesce(p.hype_parts, '{}');
    if (hp -> 'wiki' ->> 'score')::numeric > 0 then
      insert into fantasy_events (season, week, team_user, char_id, kind, points, note)
        values (s, w, p.user_id, p.char_id, 'wiki', least(15, ceil((hp -> 'wiki' ->> 'score')::numeric * 15))::int, hp -> 'wiki' ->> 'label');
    end if;
    if (hp -> 'anilist' ->> 'score')::numeric > 0 then
      insert into fantasy_events (season, week, team_user, char_id, kind, points, note)
        values (s, w, p.user_id, p.char_id, 'fans', least(10, ceil((hp -> 'anilist' ->> 'score')::numeric * 10))::int, hp -> 'anilist' ->> 'label');
    end if;
    if (hp -> 'trending' ->> 'score')::numeric >= 0.2 then
      insert into fantasy_events (season, week, team_user, char_id, kind, points, note) values (s, w, p.user_id, p.char_id, 'trending', 5, hp -> 'trending' ->> 'label');
    end if;
    -- on break: their show is on break and no new chapter in the last 2 weeks
    air := hp -> 'airing' ->> 'label';
    select * into mb from manga_buzz where manga_id = p.manga_id;
    if (air like '%on break%' or air = 'not airing')
       and not (p.manga_status = 'RELEASING' and mb.chapter_published > now() - interval '14 days') then
      insert into fantasy_events (season, week, team_user, char_id, kind, points, note) values (s, w, p.user_id, p.char_id, 'break', -5, coalesce(air, 'no new episodes or chapters'));
    end if;
  end loop;
  -- squad votes
  for v in select a_user, b_user, count(*) filter (where pick = a_user) as a, count(*) filter (where pick = b_user) as b
           from fantasy_votes where season = s and week = w group by a_user, b_user loop
    if v.a <> v.b then
      insert into fantasy_events (season, week, team_user, kind, points, note, source)
        values (s, w, case when v.a > v.b then v.a_user else v.b_user end, 'vote', 5, format('Won the squad vote %s-%s', greatest(v.a, v.b), least(v.a, v.b)), 'vote');
    end if;
  end loop;
  insert into app_config values ('fantasy_done_' || s || '_' || w, now()::text) on conflict do nothing;
end $$;
revoke execute on function fantasy_weekly() from public, anon, authenticated;
select cron.schedule('fantasy-weekly', '5 * * * *', 'select fantasy_weekly()');

alter publication supabase_realtime add table fantasy_events;
alter publication supabase_realtime add table fantasy_picks;

drop policy if exists "own activity" on activity;
create policy "own activity" on activity for insert to authenticated
  with check (user_id = auth.uid() and kind in ('rate', 'top1', 'poll', 'char_top', 'status', 'battle', 'achievement', 'ep_rate', 'hype_champ', 'fantasy_team'));
