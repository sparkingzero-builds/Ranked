-- Ranked v5: profile customisation + episode release notifications (run after v4.sql)
alter table profiles add column if not exists banner text;          -- anime banner image url
alter table profiles add column if not exists avatar text;          -- character image url
alter table profiles add column if not exists bio text check (char_length(bio) <= 160);
alter table profiles add column if not exists accent text;          -- hex colour
alter table profiles add column if not exists title_key text;       -- featured achievement
alter table profiles add column if not exists showcase jsonb default '[]'::jsonb;  -- pinned anime [{id,title,cover}]

select cron.schedule('episode-alerts', '*/15 * * * *', $q$
  select net.http_post(url := 'https://kzadwdqfpvxaaotbifvf.supabase.co/functions/v1/collect-hype',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_config where key = 'cron_secret')),
    body := '{"mode":"episodes"}'::jsonb, timeout_milliseconds := 30000) $q$);
