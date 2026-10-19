-- Ranked market v2: server-side prices driven by real-world hype.
-- Run once in Supabase SQL Editor (after schema.sql).

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists characters (
  id int primary key,               -- AniList character id
  name text not null,
  sym text unique not null,
  image text,
  media_title text,
  color text,
  wiki_title text,
  mal_id int,
  favourites int,
  p0 numeric not null,              -- baseline power
  base numeric not null,            -- baseline price
  power numeric not null,
  price numeric not null,
  price_24h numeric,
  hype numeric not null default 0,  -- -0.5 .. 1.0, from the collector
  hype_parts jsonb not null default '{}'::jsonb,
  hype_at timestamptz,
  updated_at timestamptz default now()
);

create table if not exists price_ticks (
  char_id int references characters on delete cascade,
  t timestamptz not null default now(),
  price numeric not null,
  power numeric not null,
  hype numeric not null,
  primary key (char_id, t)
);
create index if not exists price_ticks_t on price_ticks (t);

create table if not exists hype_history (
  char_id int references characters on delete cascade,
  t timestamptz not null default now(),
  raw jsonb not null,               -- raw signal readings, used as baselines
  primary key (char_id, t)
);

create table if not exists news (
  id bigserial primary key,
  char_id int references characters on delete cascade,
  created_at timestamptz default now(),
  up boolean not null,
  source text,
  text text not null
);

-- service-role only (RLS on, no policies)
create table if not exists app_config (key text primary key, value text not null);

alter table characters enable row level security;
alter table price_ticks enable row level security;
alter table hype_history enable row level security;
alter table news enable row level security;
alter table app_config enable row level security;

create policy "read characters" on characters for select to authenticated using (true);
create policy "read ticks" on price_ticks for select to authenticated using (true);
create policy "read news" on news for select to authenticated using (true);

-- hourly price snapshots for sparklines (cheap to load for every stock)
create or replace view price_hourly with (security_invoker = true) as
  select char_id, t, price from price_ticks
  where t > now() - interval '24 hours' and extract(minute from t) < 5;

-- Wallets: clients may only create their own empty wallet. Money moves only through trade().
drop policy if exists "own wallet" on wallets;
create policy "create own wallet" on wallets for insert to authenticated with check (user_id = auth.uid());

-- One market step. Power is pulled toward a hype-adjusted target; price chases power with a lag.
create or replace function market_tick() returns void language plpgsql security definer set search_path = public as $$
declare c record; npow numeric; target numeric; np numeric;
begin
  for c in select * from characters loop
    npow := c.power * (1 + (random() - 0.5) * 0.004);
    npow := npow + (c.p0 * (1 + c.hype) - npow) * 0.02;
    target := c.base * npow / c.p0;
    np := c.price + (target - c.price) * 0.04 + c.price * (random() - 0.5) * 0.006;
    np := greatest(1, least(c.price * 1.15, greatest(c.price * 0.85, np)));
    update characters set power = npow, price = np, updated_at = now(),
      price_24h = coalesce((select p.price from price_ticks p where p.char_id = c.id and p.t <= now() - interval '24 hours' order by p.t desc limit 1), price_24h, np)
      where id = c.id;
    insert into price_ticks (char_id, price, power, hype) values (c.id, np, npow, c.hype);
  end loop;
  delete from price_ticks where t < now() - interval '30 days';
  delete from hype_history where t < now() - interval '30 days';
  delete from news where created_at < now() - interval '14 days';
end $$;
revoke execute on function market_tick() from public, anon, authenticated;

create or replace function trade(p_char int, p_qty int) returns wallets
language plpgsql security definer set search_path = public as $$
declare w wallets; pr numeric; s text; h jsonb; cur int; avgc numeric; cost numeric;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_qty = 0 or abs(p_qty) > 100000 then raise exception 'Bad quantity'; end if;
  select price, sym into pr, s from characters where id = p_char;
  if pr is null then raise exception 'Unknown stock'; end if;
  insert into wallets (user_id) values (auth.uid()) on conflict do nothing;
  select * into w from wallets where user_id = auth.uid() for update;
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
    where user_id = auth.uid() returning * into w;
  return w;
end $$;

create or replace function reset_wallet() returns wallets
language plpgsql security definer set search_path = public as $$
declare w wallets;
begin
  update wallets set cash = 10000, holdings = '{}', trades = '[]', updated_at = now() where user_id = auth.uid() returning * into w;
  return w;
end $$;

alter publication supabase_realtime add table characters;
alter publication supabase_realtime add table news;

-- schedules: price tick every 5 min, hype collection every 20 min (a third of the market each run)
insert into app_config values ('cron_secret', encode(gen_random_bytes(24), 'hex')) on conflict do nothing;
select cron.schedule('market-tick', '*/5 * * * *', 'select market_tick()');
select cron.schedule('collect-hype', '7,27,47 * * * *', $$
  select net.http_post(
    url := 'https://kzadwdqfpvxaaotbifvf.supabase.co/functions/v1/collect-hype',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_config where key = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 140000)
$$);
