-- Ranked v7: per-episode ratings (same categories as show ratings + emoji + note). Run after v6.sql.
create table if not exists episode_ratings (
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  media_id int not null,
  ep int not null check (ep > 0),
  scores jsonb not null default '{}'::jsonb,       -- { Story: 8, Animation: 9.5, ... }
  overall numeric check (overall between 0 and 10),
  emoji text check (char_length(emoji) <= 8),
  note text check (char_length(note) <= 500),
  updated_at timestamptz default now(),
  primary key (user_id, media_id, ep)
);
create index if not exists episode_ratings_media on episode_ratings (media_id, ep);
alter table episode_ratings enable row level security;
create policy "read episode ratings" on episode_ratings for select to authenticated using (true);
create policy "own episode ratings" on episode_ratings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
alter publication supabase_realtime add table episode_ratings;

-- allow the new feed entry
drop policy if exists "own activity" on activity;
create policy "own activity" on activity for insert to authenticated
  with check (user_id = auth.uid() and kind in ('rate', 'top1', 'poll', 'char_top', 'status', 'battle', 'achievement', 'ep_rate'));
