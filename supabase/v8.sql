-- Ranked v8: manga chapter buzz feeds the market. Run after v7.sql.
alter table characters add column if not exists manga_id int;
alter table characters add column if not exists manga_title text;
alter table characters add column if not exists manga_status text;
create index if not exists characters_manga on characters (manga_id);

-- one row per releasing manga, updated by the collector from Reddit chapter chatter
create table if not exists manga_buzz (
  manga_id int primary key,
  title text not null,
  posts_24h int, score_24h int,              -- Reddit posts about "<title> chapter" in the last day, and their upvotes
  base_posts numeric, base_score numeric,    -- rolling normal levels (exponential average)
  last_chapter int, chapter_at timestamptz,  -- newest chapter seen in post titles, and when we first saw it
  updated_at timestamptz default now()
);
alter table manga_buzz enable row level security;
create policy "read manga buzz" on manga_buzz for select to authenticated using (true);

-- v8b: sources that actually answer from the cloud (MangaDex, Wikipedia, AniList trending)
alter table manga_buzz add column if not exists md_id text;
alter table manga_buzz add column if not exists wiki_title text;
alter table manga_buzz add column if not exists views_ratio numeric;
alter table manga_buzz add column if not exists trending int;
alter table manga_buzz add column if not exists base_trending numeric;
alter table manga_buzz add column if not exists chapter_published timestamptz;
