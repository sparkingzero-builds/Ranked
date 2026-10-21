-- Ranked v11: hype brackets can be 4, 8, 16 or 32 moments (picks = 2 to 5 rounds)
drop policy if exists "one hype run" on hype_brackets;
create policy "one hype run" on hype_brackets for insert to authenticated
  with check (user_id = auth.uid() and jsonb_array_length(picks) between 2 and 5
    and picks -> (jsonb_array_length(picks) - 1) ->> 0 = champion);
