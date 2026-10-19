-- =============================================================================
-- updated_at grows with every committed change of a row (Phase 2b).
--
-- The client keeps its cache in step with Realtime by comparing updated_at:
-- an event older than the row it already has is a late echo and is dropped
-- (src/lib/queries/items.ts, applyRemoteItem). now() is the start of the
-- transaction, so of two members writing the same row at once, the one that
-- commits last could carry the older timestamp, and its event would be taken
-- for stale. clock_timestamp() is read when the trigger runs, after the row
-- lock: the second writer waits for the first to commit, so its timestamp is
-- always later.
-- =============================================================================

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
