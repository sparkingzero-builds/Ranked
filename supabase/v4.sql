-- Ranked v4: squad bets, dividends, market-wide events, head-to-head Top 10 battles.
-- Run once in the SQL Editor after features.sql.

alter table characters add column if not exists dividend_key text;

-- ---------- squad bets: "which of two stocks gains more by the deadline" ----------
create table if not exists bets (
  id bigserial primary key,
  creator uuid not null references profiles on delete cascade,
  char_a int not null references characters on delete cascade,
  char_b int not null references characters on delete cascade,
  a_start numeric not null, b_start numeric not null,
  stake numeric not null check (stake between 10 and 5000),
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'settled', 'void')),
  winner text, a_change numeric, b_change numeric,
  created_at timestamptz default now()
);
create table if not exists bet_entries (
  bet_id bigint references bets on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  pick text not null check (pick in ('a', 'b')),
  payout numeric,
  primary key (bet_id, user_id)
);

-- ---------- market events: crashes, bull runs, hype weeks ----------
create table if not exists market_events (
  id bigserial primary key,
  kind text not null,                 -- crash | bull | hype
  title text not null,
  char_ids int[],                     -- null = whole market
  hype_delta numeric not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null
);

-- ---------- head-to-head Top 10 battles, the squad votes ----------
create table if not exists battles (
  id bigserial primary key,
  a_user uuid not null references profiles on delete cascade,
  b_user uuid not null references profiles on delete cascade,
  a_list jsonb not null, b_list jsonb not null,           -- snapshot of each Top 10 (AniList media ids)
  ends_at timestamptz not null default now() + interval '48 hours',
  created_at timestamptz default now()
);
create table if not exists battle_votes (
  battle_id bigint references battles on delete cascade,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  pick text not null check (pick in ('a', 'b')),
  primary key (battle_id, user_id)
);

alter table bets enable row level security;
alter table bet_entries enable row level security;
alter table market_events enable row level security;
alter table battles enable row level security;
alter table battle_votes enable row level security;
create policy "read bets" on bets for select to authenticated using (true);
create policy "read bet entries" on bet_entries for select to authenticated using (true);
create policy "read events" on market_events for select to authenticated using (true);
create policy "read battles" on battles for select to authenticated using (true);
create policy "start battles" on battles for insert to authenticated with check (a_user = auth.uid() and b_user <> auth.uid());
create policy "read battle votes" on battle_votes for select to authenticated using (true);
create policy "vote in battles" on battle_votes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from battles b where b.id = battle_id
    and b.ends_at > now() and auth.uid() not in (b.a_user, b.b_user)));

-- take coins for a bet (server-side so balances can't be faked)
create or replace function pay_stake(p_user uuid, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare c numeric;
begin
  insert into wallets (user_id) values (p_user) on conflict do nothing;
  select cash into c from wallets where user_id = p_user for update;
  if c < p_amount then raise exception 'Not enough coins'; end if;
  update wallets set cash = cash - p_amount, updated_at = now() where user_id = p_user;
end $$;
revoke execute on function pay_stake(uuid, numeric) from public, anon, authenticated;

create or replace function create_bet(p_a int, p_b int, p_stake numeric, p_days int, p_pick text) returns bigint
language plpgsql security definer set search_path = public as $$
declare pa numeric; pb numeric; sa text; sb text; bid bigint;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_a = p_b then raise exception 'Pick two different stocks'; end if;
  if p_days not in (1, 3, 7) then raise exception 'Bad length'; end if;
  select price, sym into pa, sa from characters where id = p_a;
  select price, sym into pb, sb from characters where id = p_b;
  if pa is null or pb is null then raise exception 'Unknown stock'; end if;
  perform pay_stake(auth.uid(), p_stake);
  insert into bets (creator, char_a, char_b, a_start, b_start, stake, ends_at)
    values (auth.uid(), p_a, p_b, pa, pb, p_stake, now() + make_interval(days => p_days)) returning id into bid;
  insert into bet_entries (bet_id, user_id, pick) values (bid, auth.uid(), p_pick);
  insert into activity (user_id, kind, payload) values (auth.uid(), 'bet',
    jsonb_build_object('bet_id', bid, 'a', sa, 'b', sb, 'stake', p_stake, 'pick', case when p_pick = 'a' then sa else sb end));
  return bid;
end $$;

create or replace function join_bet(p_bet bigint, p_pick text) returns void
language plpgsql security definer set search_path = public as $$
declare b bets;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into b from bets where id = p_bet for update;
  if b is null or b.status <> 'open' or b.ends_at <= now() then raise exception 'Bet is closed'; end if;
  if exists (select 1 from bet_entries where bet_id = p_bet and user_id = auth.uid()) then raise exception 'You are already in'; end if;
  perform pay_stake(auth.uid(), b.stake);
  insert into bet_entries (bet_id, user_id, pick) values (p_bet, auth.uid(), p_pick);
end $$;

-- settle finished bets: the side whose stock gained more splits the whole pot
create or replace function settle_bets() returns void
language plpgsql security definer set search_path = public as $$
declare b record; ca numeric; cb numeric; w text; pot numeric; nwin int; e record; sa text; sb text;
begin
  for b in select * from bets where status = 'open' and ends_at <= now() loop
    select price / b.a_start - 1, sym into ca, sa from characters where id = b.char_a;
    select price / b.b_start - 1, sym into cb, sb from characters where id = b.char_b;
    w := case when ca > cb then 'a' when cb > ca then 'b' end;
    select count(*) * b.stake into pot from bet_entries where bet_id = b.id;
    select count(*) into nwin from bet_entries where bet_id = b.id and pick = w;
    if w is null or nwin = 0 or nwin = (select count(*) from bet_entries where bet_id = b.id) then
      -- tie, nobody on the winning side, or everyone picked the same side: refund
      update wallets wl set cash = cash + b.stake from bet_entries be where be.bet_id = b.id and wl.user_id = be.user_id;
      update bet_entries set payout = b.stake where bet_id = b.id;
      update bets set status = 'void', winner = w, a_change = ca, b_change = cb where id = b.id;
      insert into notifications (user_id, text) select user_id, format('↩️ Bet $%s vs $%s refunded (no contest)', sa, sb) from bet_entries where bet_id = b.id;
    else
      update bet_entries set payout = case when pick = w then pot / nwin else 0 end where bet_id = b.id;
      update wallets wl set cash = cash + be.payout from bet_entries be where be.bet_id = b.id and be.pick = w and wl.user_id = be.user_id;
      update bets set status = 'settled', winner = w, a_change = ca, b_change = cb where id = b.id;
      for e in select * from bet_entries where bet_id = b.id loop
        insert into notifications (user_id, text) values (e.user_id, case when e.pick = w
          then format('🏆 You won the $%s vs $%s bet: +%s coins', sa, sb, round(e.payout, 2))
          else format('💀 You lost the $%s vs $%s bet ($%s won)', sa, sb, case when w = 'a' then sa else sb end) end);
      end loop;
      insert into activity (user_id, kind, payload)
        select user_id, 'bet_won', jsonb_build_object('a', sa, 'b', sb, 'payout', round(payout, 2)) from bet_entries where bet_id = b.id and pick = w;
    end if;
  end loop;
end $$;
revoke execute on function settle_bets() from public, anon, authenticated;

-- dividends: when a character's show airs a new episode, holders get 2% of the share price per share
create or replace function pay_dividends() returns void
language plpgsql security definer set search_path = public as $$
declare c record; w record; amt numeric;
begin
  for c in select * from characters where event_key is not null and event_key is distinct from dividend_key and event_until > now() loop
    for w in select user_id, (holdings -> c.id::text ->> 'qty')::int as qty from wallets where holdings ? c.id::text loop
      amt := round(w.qty * c.price * 0.02, 2);
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

-- daily dice roll for a market event (18:00 UTC)
create or replace function roll_market_event() returns void
language plpgsql security definer set search_path = public as $$
declare r numeric := random(); ids int[]; names text;
begin
  if exists (select 1 from market_events where ends_at > now()) then return; end if;
  if r < 0.2 then
    insert into market_events (kind, title, hype_delta, ends_at) values ('crash', '📉 MARKET CRASH: panic selling across the board', -0.4, now() + interval '6 hours');
    insert into news (up, source, text) values (false, 'event', 'MARKET CRASH! Everything is bleeding for the next 6 hours. Buy the dip?');
  elsif r < 0.4 then
    insert into market_events (kind, title, hype_delta, ends_at) values ('bull', '🚀 BULL RUN: the whole market is pumping', 0.3, now() + interval '6 hours');
    insert into news (up, source, text) values (true, 'event', 'BULL RUN! Every stock is getting a hype boost for 6 hours.');
  else
    select array_agg(id), string_agg('$' || sym, ', ') into ids, names from (select id, sym from characters order by random() limit 3) x;
    insert into market_events (kind, title, char_ids, hype_delta, ends_at) values ('hype', '🔥 HYPE WEEK: ' || names, ids, 0.5, now() + interval '3 days');
    insert into news (up, source, text) values (true, 'event', 'HYPE WEEK for ' || names || '. Big boosts for the next 3 days!');
  end if;
end $$;
revoke execute on function roll_market_event() from public, anon, authenticated;

-- market step, now with event boosts + dividends + bet settlement
create or replace function market_tick() returns void language plpgsql security definer set search_path = public as $$
declare c record; o record; npow numeric; target numeric; np numeric; eff numeric; keep boolean; glob numeric;
begin
  keep := extract(minute from now())::int % 15 < 5;
  select coalesce(sum(hype_delta), 0) into glob from market_events where char_ids is null and now() between starts_at and ends_at;
  for c in select * from characters loop
    eff := c.hype + glob
      + case when c.event_until > now() then 0.25 else 0 end
      + case when c.ipo_at > now() - interval '48 hours' then 0.15 else 0 end
      + coalesce((select sum(me.hype_delta) from market_events me where c.id = any(me.char_ids) and now() between me.starts_at and me.ends_at), 0);
    npow := c.power * (1 + (random() - 0.5) * 0.004);
    npow := npow + (c.p0 * (1 + eff) - npow) * 0.02;
    target := c.base * npow / c.p0;
    np := c.price + (target - c.price) * 0.04 + c.price * (random() - 0.5) * 0.006;
    np := greatest(1, least(c.price * 1.15, greatest(c.price * 0.85, np)));
    update characters set power = npow, price = np, updated_at = now(),
      price_24h = coalesce((select p.price from price_ticks p where p.char_id = c.id and p.t <= now() - interval '24 hours' order by p.t desc limit 1), price_24h, np)
      where id = c.id;
    if keep then insert into price_ticks (char_id, price, power, hype) values (c.id, np, npow, eff); end if;
  end loop;

  -- (aliases must not reuse the loop variable names c / o above, or plpgsql calls them ambiguous)
  for o in select od.*, ch.price as now_price, ch.sym from orders od join characters ch on ch.id = od.char_id
           where od.status = 'open' and ((od.qty > 0 and ch.price <= od.limit_price) or (od.qty < 0 and ch.price >= od.limit_price)) loop
    begin
      perform do_trade(o.user_id, o.char_id, o.qty);
      update orders set status = 'filled', filled_at = now(), fill_price = o.now_price where id = o.id;
      insert into notifications (user_id, text) values (o.user_id,
        format('✅ Order filled: %s %s $%s @ %s', case when o.qty > 0 then 'bought' else 'sold' end, abs(o.qty), o.sym, round(o.now_price, 2)));
    exception when others then
      update orders set status = 'failed', note = sqlerrm where id = o.id;
      insert into notifications (user_id, text) values (o.user_id, format('⚠️ Order for $%s failed: %s', o.sym, sqlerrm));
    end;
  end loop;

  with t as (
    update alerts al set triggered_at = now() from characters ch
    where ch.id = al.char_id and al.triggered_at is null
      and ((al.above and ch.price >= al.price) or (not al.above and ch.price <= al.price))
    returning al.user_id, ch.sym, al.above, al.price, ch.price as now_price)
  insert into notifications (user_id, text)
    select user_id, format('🔔 $%s %s %s (now %s)', sym, case when above then 'rose above' else 'fell below' end, round(price, 2), round(now_price, 2)) from t;

  perform pay_dividends();
  perform settle_bets();

  delete from price_ticks where t < now() - interval '7 days';
  delete from hype_history where t < now() - interval '14 days';
  delete from news where created_at < now() - interval '14 days';
  delete from notifications where created_at < now() - interval '30 days';
end $$;

alter publication supabase_realtime add table bets;
alter publication supabase_realtime add table bet_entries;
alter publication supabase_realtime add table battle_votes;
alter publication supabase_realtime add table market_events;

select cron.schedule('market-event', '0 18 * * *', 'select roll_market_event()');

-- readable tickers: first name, up to 6 letters (ICHIGO, RUKIA, ACE); clashes get a number (most-loved keeps the plain one)
update characters set sym = 'TMP' || id;
with base as (
  select id, favourites, coalesce(nullif(upper(left(regexp_replace(split_part(name, ' ', 1), '[^A-Za-z]', '', 'g'), 6)), ''), 'CHR') as b from characters),
r as (select id, b, row_number() over (partition by b order by favourites desc) as rn from base)
update characters c set sym = case when r.rn = 1 then r.b else left(r.b, 5) || r.rn end from r where r.id = c.id;
