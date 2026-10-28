-- Ranked v21: market crash alerts, insider-tip rumours, IPO hype week (48h pre-order window + first-buyer badge).
-- Run after v20.sql. Redefines market_tick (same as v4 plus: coming-soon IPOs stay frozen, then launches + crash alerts).

-- rumours (set by the hype collector a day before a premiere / season finale)
alter table characters add column if not exists rumour text;
alter table characters add column if not exists rumour_key text;
alter table characters add column if not exists rumour_until timestamptz;

-- IPO hype week: new listings are announced 48h early (ipo_at in the future) and can be pre-ordered at a fixed price
alter table characters add column if not exists ipo_filled boolean not null default true;

create table if not exists ipo_preorders (
  user_id uuid not null references profiles on delete cascade,
  char_id int not null references characters on delete cascade,
  qty int not null check (qty > 0),
  price numeric not null,
  filled boolean not null default false,
  created_at timestamptz default now(),
  primary key (user_id, char_id)
);
alter table ipo_preorders enable row level security;
create policy "read preorders" on ipo_preorders for select to authenticated using (true);

create or replace function ipo_preorder(p_char int, p_qty int) returns void
language plpgsql security definer set search_path = public as $$
declare ch characters; cost numeric; w wallets;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_qty <= 0 or p_qty > 10000 then raise exception 'Bad quantity'; end if;
  select * into ch from characters where id = p_char;
  if ch.ipo_at is null or ch.ipo_at <= now() then raise exception 'Pre-orders are closed for this one'; end if;
  cost := ch.price * p_qty;
  insert into wallets (user_id) values (auth.uid()) on conflict do nothing;
  select * into w from wallets where user_id = auth.uid() for update;
  if cost > w.cash then raise exception 'Not enough coins'; end if;
  update wallets set cash = cash - cost, updated_at = now() where user_id = auth.uid();
  insert into ipo_preorders (user_id, char_id, qty, price) values (auth.uid(), p_char, p_qty, ch.price)
    on conflict (user_id, char_id) do update set qty = ipo_preorders.qty + excluded.qty;
end $$;

-- no normal trading until launch
create or replace function trade(p_char int, p_qty int) returns wallets
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if exists (select 1 from characters where id = p_char and ipo_at > now()) then raise exception 'Not listed yet: pre-order it instead'; end if;
  return do_trade(auth.uid(), p_char, p_qty);
end $$;

-- launch: pre-orders become real shares at the IPO price
create or replace function ipo_launch() returns void
language plpgsql security definer set search_path = public as $$
declare ch record; po record; h jsonb; cur int; avgc numeric;
begin
  for ch in select * from characters where not ipo_filled and ipo_at <= now() loop
    for po in select * from ipo_preorders where char_id = ch.id and not filled loop
      insert into wallets (user_id) values (po.user_id) on conflict do nothing;
      select coalesce(holdings -> ch.id::text, '{"qty":0,"avg":0}'::jsonb) into h from wallets where user_id = po.user_id;
      cur := (h ->> 'qty')::int; avgc := (h ->> 'avg')::numeric;
      update wallets set holdings = jsonb_set(holdings, array[ch.id::text],
        jsonb_build_object('qty', cur + po.qty, 'avg', (avgc * cur + po.price * po.qty) / (cur + po.qty))), updated_at = now()
        where user_id = po.user_id;
      update ipo_preorders set filled = true where user_id = po.user_id and char_id = ch.id;
      insert into notifications (user_id, text) values (po.user_id,
        format('🚀 $%s is live! Your %s pre-order shares are in at %s (now %s)', ch.sym, po.qty, round(po.price, 2), round(ch.price, 2)));
    end loop;
    update characters set ipo_filled = true where id = ch.id;
    insert into news (char_id, up, source, text) values (ch.id, true, 'event', format('🚀 IPO: $%s (%s) IS NOW LIVE. Trading open', ch.sym, ch.name));
  end loop;
end $$;

-- crash alerts: a stock you hold is down 15%+ on the day (once per stock per day)
create table if not exists crash_alerts (user_id uuid, char_id int, at timestamptz default now(), primary key (user_id, char_id));
alter table crash_alerts enable row level security;

create or replace function market_crash_alerts() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select w.user_id, ch.id, ch.sym, ch.price, ch.price_24h, (h.value ->> 'qty')::int as qty
    from wallets w cross join lateral jsonb_each(w.holdings) h
    join characters ch on ch.id = h.key::int
    where ch.price_24h > 0 and ch.price <= ch.price_24h * 0.85
      and not exists (select 1 from crash_alerts ca where ca.user_id = w.user_id and ca.char_id = ch.id and ca.at > now() - interval '24 hours')
  loop
    insert into notifications (user_id, text) values (r.user_id,
      format('📉 CRASH: $%s is down %s%% today (%s → %s). You hold %s', r.sym, round((1 - r.price / r.price_24h) * 100), round(r.price_24h, 2), round(r.price, 2), r.qty));
    insert into crash_alerts (user_id, char_id, at) values (r.user_id, r.id, now())
      on conflict (user_id, char_id) do update set at = now();
  end loop;
end $$;

create or replace function market_tick() returns void language plpgsql security definer set search_path = public as $$
declare c record; o record; npow numeric; target numeric; np numeric; eff numeric; keep boolean; glob numeric;
begin
  keep := extract(minute from now())::int % 15 < 5;
  select coalesce(sum(hype_delta), 0) into glob from market_events where char_ids is null and now() between starts_at and ends_at;
  for c in select * from characters where ipo_at is null or ipo_at <= now() loop
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
  perform ipo_launch();
  perform market_crash_alerts();

  delete from price_ticks where t < now() - interval '7 days';
  delete from hype_history where t < now() - interval '14 days';
  delete from news where created_at < now() - interval '14 days';
  delete from notifications where created_at < now() - interval '30 days';
end $$;

alter publication supabase_realtime add table ipo_preorders;

-- song bracket shares the hype bracket table: one finished run per player per kind
alter table hype_brackets add column if not exists kind text not null default 'moment';
alter table hype_brackets drop constraint if exists hype_brackets_pkey;
alter table hype_brackets add primary key (user_id, kind);
