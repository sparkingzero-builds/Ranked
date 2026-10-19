-- Ranked v3: limit orders, price alerts, notifications, squad activity, polls, achievements,
-- episode-day events and character IPOs. Run once in the SQL Editor after market.sql.

alter table user_state add column if not exists extra jsonb default '{}'::jsonb;   -- season + character rankings
alter table characters add column if not exists ipo_at timestamptz;
alter table characters add column if not exists event_label text;
alter table characters add column if not exists event_until timestamptz;
alter table characters add column if not exists event_key text;

create table if not exists orders (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  char_id int not null references characters on delete cascade,
  qty int not null check (qty <> 0 and abs(qty) <= 100000),   -- positive = buy, negative = sell
  limit_price numeric not null check (limit_price > 0),
  status text not null default 'open' check (status in ('open', 'filled', 'cancelled', 'failed')),
  fill_price numeric, note text,
  created_at timestamptz default now(), filled_at timestamptz
);
create table if not exists alerts (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  char_id int not null references characters on delete cascade,
  above boolean not null, price numeric not null check (price > 0),
  created_at timestamptz default now(), triggered_at timestamptz
);
create table if not exists notifications (
  id bigserial primary key,
  user_id uuid not null references profiles on delete cascade,
  text text not null, read boolean not null default false, created_at timestamptz default now()
);
create table if not exists activity (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  kind text not null, payload jsonb not null default '{}'::jsonb, created_at timestamptz default now()
);
create table if not exists polls (
  id bigserial primary key,
  user_id uuid default auth.uid() references profiles on delete set null,
  question text not null check (char_length(question) between 3 and 200),
  options jsonb not null, created_at timestamptz default now()
);
create table if not exists poll_votes (
  poll_id bigint references polls on delete cascade,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  option int not null, primary key (poll_id, user_id)
);
create table if not exists achievements (
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  key text not null, unlocked_at timestamptz default now(), primary key (user_id, key)
);
create index if not exists activity_created on activity (created_at desc);

alter table orders enable row level security;
alter table alerts enable row level security;
alter table notifications enable row level security;
alter table activity enable row level security;
alter table polls enable row level security;
alter table poll_votes enable row level security;
alter table achievements enable row level security;

create policy "own orders read" on orders for select to authenticated using (user_id = auth.uid());
create policy "own orders create" on orders for insert to authenticated with check (user_id = auth.uid() and status = 'open');
create policy "own alerts" on alerts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own notifications read" on notifications for select to authenticated using (user_id = auth.uid());
create policy "own notifications mark" on notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "read activity" on activity for select to authenticated using (true);
create policy "own activity" on activity for insert to authenticated with check (user_id = auth.uid());
create policy "read polls" on polls for select to authenticated using (true);
create policy "own polls" on polls for insert to authenticated with check (user_id = auth.uid());
create policy "delete own polls" on polls for delete to authenticated using (user_id = auth.uid());
create policy "read votes" on poll_votes for select to authenticated using (true);
create policy "own votes" on poll_votes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "read achievements" on achievements for select to authenticated using (true);
create policy "own achievements" on achievements for insert to authenticated with check (user_id = auth.uid());

-- Core trade, used by trade() for players and by the tick for limit orders.
create or replace function do_trade(p_user uuid, p_char int, p_qty int) returns wallets
language plpgsql security definer set search_path = public as $$
declare w wallets; pr numeric; s text; nm text; h jsonb; cur int; avgc numeric; cost numeric;
begin
  if p_qty = 0 or abs(p_qty) > 100000 then raise exception 'Bad quantity'; end if;
  select price, sym, name into pr, s, nm from characters where id = p_char;
  if pr is null then raise exception 'Unknown stock'; end if;
  insert into wallets (user_id) values (p_user) on conflict do nothing;
  select * into w from wallets where user_id = p_user for update;
  h := coalesce(w.holdings -> p_char::text, '{"qty":0,"avg":0}'::jsonb);
  cur := (h ->> 'qty')::int; avgc := (h ->> 'avg')::numeric; cost := pr * p_qty;
  if p_qty > 0 and cost > w.cash then raise exception 'Not enough coins'; end if;
  if p_qty < 0 and -p_qty > cur then raise exception 'Not enough shares'; end if;
  if cur + p_qty = 0 then w.holdings := w.holdings - p_char::text;
  else w.holdings := jsonb_set(w.holdings, array[p_char::text], jsonb_build_object('qty', cur + p_qty,
    'avg', case when p_qty > 0 then (avgc * cur + cost) / (cur + p_qty) else avgc end));
  end if;
  update wallets set cash = cash - cost, holdings = w.holdings, updated_at = now(),
    trades = (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select x from jsonb_array_elements(jsonb_build_array(jsonb_build_object('id', p_char, 'sym', s, 'qty', p_qty, 'price', pr,
        'at', (extract(epoch from now()) * 1000)::bigint)) || w.trades) x limit 100) t)
    where user_id = p_user returning * into w;
  insert into activity (user_id, kind, payload) values (p_user, 'trade',
    jsonb_build_object('sym', s, 'name', nm, 'char_id', p_char, 'qty', p_qty, 'price', round(pr, 2),
      'pnl', case when p_qty < 0 then round((pr - avgc) * -p_qty, 2) end));
  return w;
end $$;
revoke execute on function do_trade(uuid, int, int) from public, anon, authenticated;

create or replace function trade(p_char int, p_qty int) returns wallets
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  return do_trade(auth.uid(), p_char, p_qty);
end $$;

create or replace function cancel_order(p_id bigint) returns void
language sql security definer set search_path = public as $$
  update orders set status = 'cancelled' where id = p_id and user_id = auth.uid() and status = 'open';
$$;

-- Market step: hype (+ episode-day and IPO boosts) pulls power, price chases power.
-- Price history is stored every 15 minutes to keep the database small with 500 stocks.
create or replace function market_tick() returns void language plpgsql security definer set search_path = public as $$
declare c record; o record; npow numeric; target numeric; np numeric; eff numeric; keep boolean;
begin
  keep := extract(minute from now())::int % 15 < 5;
  for c in select * from characters loop
    eff := c.hype
      + case when c.event_until > now() then 0.25 else 0 end
      + case when c.ipo_at > now() - interval '48 hours' then 0.15 else 0 end;
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

  -- limit orders
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

  -- price alerts
  with t as (
    update alerts al set triggered_at = now() from characters ch
    where ch.id = al.char_id and al.triggered_at is null
      and ((al.above and ch.price >= al.price) or (not al.above and ch.price <= al.price))
    returning al.user_id, ch.sym, al.above, al.price, ch.price as now_price)
  insert into notifications (user_id, text)
    select user_id, format('🔔 $%s %s %s (now %s)', sym, case when above then 'rose above' else 'fell below' end, round(price, 2), round(now_price, 2)) from t;

  delete from price_ticks where t < now() - interval '7 days';
  delete from hype_history where t < now() - interval '14 days';
  delete from news where created_at < now() - interval '14 days';
  delete from notifications where created_at < now() - interval '30 days';
end $$;

alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table activity;
alter publication supabase_realtime add table poll_votes;

-- collector now runs every 10 minutes over a sixth of the market; IPO scan once a day
select cron.schedule('collect-hype', '*/10 * * * *', $q$
  select net.http_post(url := 'https://kzadwdqfpvxaaotbifvf.supabase.co/functions/v1/collect-hype',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_config where key = 'cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 30000) $q$);
select cron.schedule('character-ipo', '0 12 * * *', $q$
  select net.http_post(url := 'https://kzadwdqfpvxaaotbifvf.supabase.co/functions/v1/collect-hype',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_config where key = 'cron_secret')),
    body := '{"mode":"ipo"}'::jsonb, timeout_milliseconds := 30000) $q$);

-- starter hot takes
insert into polls (user_id, question, options)
select null, q, o::jsonb from (values
  ('Is Naruto overrated?', '["Yes","No","Only Shippuden filler"]'),
  ('Best Big 3 ending?', '["Naruto","Bleach","One Piece (when it ends)"]'),
  ('Strongest: Goku or Saitama?', '["Goku","Saitama","Depends on the writer"]'),
  ('Sub or dub?', '["Sub","Dub","Whatever is out first"]'),
  ('Black Clover is peak shonen', '["Facts","Mid","Haven''t watched"]')
) v(q, o)
where not exists (select 1 from polls);
