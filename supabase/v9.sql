-- Ranked v9: Hypest Moment Ever bracket. One run per player: insert only, no edits or deletes.
create table if not exists hype_brackets (
  user_id uuid primary key default auth.uid() references profiles on delete cascade,
  champion text not null,
  picks jsonb not null,          -- winners per round [[16 ids], [8], [4], [2], [1]]
  "order" jsonb,                 -- the shuffled starting bracket
  completed_at timestamptz default now()
);
alter table hype_brackets enable row level security;
create policy "read hype brackets" on hype_brackets for select to authenticated using (true);
create policy "one hype run" on hype_brackets for insert to authenticated
  with check (user_id = auth.uid() and jsonb_array_length(picks) = 5 and picks -> 4 ->> 0 = champion);

drop policy if exists "own activity" on activity;
create policy "own activity" on activity for insert to authenticated
  with check (user_id = auth.uid() and kind in ('rate', 'top1', 'poll', 'char_top', 'status', 'battle', 'achievement', 'ep_rate', 'hype_champ'));
