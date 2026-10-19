-- Ranked v6: safety pass. Run once in the SQL Editor after v5.sql.

-- 1. New wallets must start at exactly 10,000 coins, empty
drop policy if exists "create own wallet" on wallets;
create policy "create own wallet" on wallets for insert to authenticated
  with check (user_id = auth.uid() and cash = 10000 and holdings = '{}'::jsonb and trades = '[]'::jsonb);

-- 2. Wallet reset: once a week, and the squad sees it
alter table wallets add column if not exists last_reset timestamptz;
create or replace function reset_wallet() returns wallets
language plpgsql security definer set search_path = public as $$
declare w wallets;
begin
  select * into w from wallets where user_id = auth.uid() for update;
  if w.last_reset > now() - interval '7 days' then
    raise exception 'You can reset once a week (next reset %)', to_char(w.last_reset + interval '7 days', 'Dy DD Mon HH24:MI');
  end if;
  update wallets set cash = 10000, holdings = '{}', trades = '[]', last_reset = now(), updated_at = now()
    where user_id = auth.uid() returning * into w;
  insert into activity (user_id, kind, payload) values (auth.uid(), 'reset', '{}'::jsonb);
  return w;
end $$;

-- 3. Dividends only on shares held before the episode dropped (buys after the event started don't count)
create or replace function pay_dividends() returns void
language plpgsql security definer set search_path = public as $$
declare c record; w record; amt numeric; late int; started_ms bigint;
begin
  for c in select * from characters where event_key is not null and event_key is distinct from dividend_key and event_until > now() loop
    started_ms := (extract(epoch from c.event_until - interval '24 hours') * 1000)::bigint;
    for w in select user_id, trades, (holdings -> c.id::text ->> 'qty')::int as qty from wallets where holdings ? c.id::text loop
      select coalesce(sum((t ->> 'qty')::int), 0) into late from jsonb_array_elements(w.trades) t
        where (t ->> 'id')::int = c.id and (t ->> 'qty')::int > 0 and (t ->> 'at')::bigint >= started_ms;
      amt := round(greatest(0, w.qty - late) * c.price * 0.02, 2);
      if amt > 0 then
        update wallets set cash = cash + amt, updated_at = now() where user_id = w.user_id;
        insert into notifications (user_id, text) values (w.user_id, format('💰 Dividend: $%s paid you %s coins (%s)', c.sym, amt, c.event_label));
        insert into activity (user_id, kind, payload) values (w.user_id, 'dividend', jsonb_build_object('sym', c.sym, 'amount', amt));
      end if;
    end loop;
    update characters set dividend_key = c.event_key where id = c.id;
  end loop;
end $$;
revoke execute on function pay_dividends() from public, anon, authenticated;

-- 4a. Players can only post their own kinds of feed entries; money events come from the server
drop policy if exists "own activity" on activity;
create policy "own activity" on activity for insert to authenticated
  with check (user_id = auth.uid() and kind in ('rate', 'top1', 'poll', 'char_top', 'status', 'battle', 'achievement'));

-- 4b. Battles always use each player's real Top 10 at the moment of the challenge
create or replace function battle_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements(rankings -> '10') x limit 10) s), '[]') into new.a_list from user_state where user_id = new.a_user;
  select coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements(rankings -> '10') x limit 10) s), '[]') into new.b_list from user_state where user_id = new.b_user;
  new.ends_at := now() + interval '48 hours';
  return new;
end $$;
drop trigger if exists battle_snapshot on battles;
create trigger battle_snapshot before insert on battles for each row execute function battle_snapshot();

-- 5. Profile images must come from AniList's image CDN; tidy limits on polls and profiles
alter table profiles drop constraint if exists profiles_images_check;
alter table profiles add constraint profiles_images_check check (
  (banner is null or banner = '' or banner ~ '^https://(s4\.)?anilist\.co/') and
  (avatar is null or avatar = '' or avatar ~ '^https://(s4\.)?anilist\.co/') and
  (accent is null or accent ~ '^#[0-9a-fA-F]{6}$') and
  jsonb_array_length(coalesce(showcase, '[]')) <= 4);
alter table polls drop constraint if exists polls_options_check;
alter table polls add constraint polls_options_check check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 4);

-- 6. One small row per stock for sparklines (avoids loading 24k rows / the 1,000-row cap)
create or replace function sparklines() returns table (char_id int, prices numeric[])
language sql stable security invoker set search_path = public as $$
  select char_id, array_agg(round(price, 2) order by t) from price_ticks
  where t > now() - interval '24 hours' and extract(minute from t) < 5 group by char_id
$$;

-- 7. Usernames: anyone may check if a name is free before signing up (returns true/false only)
create or replace function username_taken(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where lower(username) = lower(p_name))
$$;
grant execute on function username_taken(text) to anon, authenticated;
