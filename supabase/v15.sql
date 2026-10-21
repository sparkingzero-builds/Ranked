-- Ranked v15: Fantasy moments are detected automatically (a daily checker reads episode/chapter
-- recaps and posts fights, power-ups, deaths and appearances). Run after v14.sql.

insert into app_config values ('fantasy_bot_secret', encode(gen_random_bytes(24), 'hex')) on conflict do nothing;

-- one row per (character, kind, episode/chapter) so a rerun can't double-score
alter table fantasy_events add column if not exists ref text;
create unique index if not exists fantasy_events_ref on fantasy_events (season, char_id, kind, ref) where ref is not null;

-- drafted characters + what dropped for them recently, for the checker
create or replace function fantasy_bot_watchlist(p_secret text) returns table (
  char_id int, name text, media_title text, form text, team text, event_label text, event_until timestamptz, dead boolean, logged jsonb)
language plpgsql security definer set search_path = public as $$
begin
  if p_secret is distinct from (select value from app_config where key = 'fantasy_bot_secret') then raise exception 'bad secret'; end if;
  return query
    select c.id, c.name, c.media_title, c.form, pr.username, c.event_label, c.event_until, fantasy_dead(c.id, fp.season),
      coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'ref', e.ref)) from fantasy_events e
        where e.char_id = c.id and e.season = fp.season and e.ref is not null), '[]')
    from fantasy_picks fp join characters c on c.id = fp.char_id join profiles pr on pr.id = fp.user_id
    where fp.season = fantasy_season();
end $$;

-- post a detected moment (confirmed straight away)
create or replace function fantasy_bot_log(p_secret text, p_char int, p_kind text, p_ref text, p_note text, p_link text) returns text
language plpgsql security definer set search_path = public as $$
declare s text := fantasy_season(); owner uuid; pts int;
begin
  if p_secret is distinct from (select value from app_config where key = 'fantasy_bot_secret') then raise exception 'bad secret'; end if;
  pts := case p_kind when 'transform' then 20 when 'win' then 15 when 'appear' then 3 when 'lose' then -5 when 'death' then -20 when 'revive' then 0 end;
  if pts is null then raise exception 'Unknown kind %', p_kind; end if;
  select user_id into owner from fantasy_picks where season = s and char_id = p_char;
  if owner is null then return 'not drafted'; end if;
  if fantasy_dead(p_char, s) and p_kind not in ('revive') then return 'dead, scores 0'; end if;
  insert into fantasy_events (team_user, char_id, kind, points, note, link, source, status, ref)
    values (owner, p_char, p_kind, pts, left(p_note, 200), left(p_link, 300), 'bot', 'confirmed', p_ref)
    on conflict do nothing;
  return case when found then 'ok' else 'already logged' end;
end $$;
revoke execute on function fantasy_bot_watchlist(text) from public;
revoke execute on function fantasy_bot_log(text, int, text, text, text, text) from public;
grant execute on function fantasy_bot_watchlist(text) to anon, authenticated;
grant execute on function fantasy_bot_log(text, int, text, text, text, text) to anon, authenticated;

select value as fantasy_bot_secret from app_config where key = 'fantasy_bot_secret';
