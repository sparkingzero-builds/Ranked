-- Ranked: run this once in Supabase → SQL Editor → New query → Run.
-- Everyone signed in is treated as part of the friend group: they can read each other's
-- profiles, rankings and wallets, but only ever write their own rows.

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (char_length(username) between 2 and 20),
  anilist_name text,
  avatar text,
  created_at timestamptz default now()
);

create table if not exists user_state (
  user_id uuid primary key references profiles on delete cascade,
  rankings jsonb default '{}'::jsonb,
  ratings jsonb default '{}'::jsonb,
  history jsonb default '{}'::jsonb,
  elo jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists wallets (
  user_id uuid primary key references profiles on delete cascade,
  cash numeric not null default 10000,
  holdings jsonb not null default '{}'::jsonb,
  trades jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists watch_alongs (
  id uuid primary key default gen_random_uuid(),
  media jsonb not null,
  owner uuid not null references profiles on delete cascade,
  mate uuid not null references profiles on delete cascade,
  created_at timestamptz default now()
);

create table if not exists reactions (
  watch_id uuid references watch_alongs on delete cascade,
  user_id uuid references profiles on delete cascade,
  ep int not null,
  emoji text,
  score int check (score between 1 and 10),
  note text check (char_length(note) <= 500),
  updated_at timestamptz default now(),
  primary key (watch_id, user_id, ep)
);

alter table profiles enable row level security;
alter table user_state enable row level security;
alter table wallets enable row level security;
alter table watch_alongs enable row level security;
alter table reactions enable row level security;

-- read: any signed-in friend
create policy "read profiles" on profiles for select to authenticated using (true);
create policy "read state" on user_state for select to authenticated using (true);
create policy "read wallets" on wallets for select to authenticated using (true);

-- write: only your own rows
create policy "own profile" on profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "own state" on user_state for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own wallet" on wallets for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- watch-alongs: only the two people in it
create policy "members read watch" on watch_alongs for select to authenticated using (auth.uid() in (owner, mate));
create policy "owner creates watch" on watch_alongs for insert to authenticated with check (owner = auth.uid());
create policy "members delete watch" on watch_alongs for delete to authenticated using (auth.uid() in (owner, mate));

create policy "members read reactions" on reactions for select to authenticated
  using (exists (select 1 from watch_alongs w where w.id = watch_id and auth.uid() in (w.owner, w.mate)));
create policy "own reactions" on reactions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from watch_alongs w where w.id = watch_id and auth.uid() in (w.owner, w.mate)));

-- live updates for reactions and wallets
alter publication supabase_realtime add table reactions;
alter publication supabase_realtime add table wallets;
