-- Ranked v12: hype brackets up to 128 moments (picks = 2 to 7 rounds)
drop policy if exists "one hype run" on hype_brackets;
create policy "one hype run" on hype_brackets for insert to authenticated
  with check (user_id = auth.uid() and jsonb_array_length(picks) between 2 and 7
    and picks -> (jsonb_array_length(picks) - 1) ->> 0 = champion);
