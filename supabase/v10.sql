-- Ranked v10: players can reset (delete) their own Hypest Moment bracket and play again
create policy "reset own hype run" on hype_brackets for delete to authenticated using (user_id = auth.uid());
