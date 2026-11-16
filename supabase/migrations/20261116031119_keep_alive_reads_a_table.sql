-- =============================================================================
-- keep_alive reads a table, and the workflow calls it every 4 hours
--
-- Staging paused again on 2026-11-16, although every ping of the
-- keep-staging-awake workflow had answered true (the last one on 2026-11-13).
-- Supabase does not publish what it counts as activity; the guides that work
-- read a real table, a few times a day. So keep_alive() now reads the one row
-- of public.heartbeat instead of answering a constant, and the workflow runs
-- every 4 hours (.github/workflows/keep-staging-awake.yml).
--
--   * heartbeat holds a single row with no data. anon can read it and nothing
--     else, since keep_alive() still runs as the caller (security invoker);
--     nobody but service_role writes it.
--   * keep_alive() answers true while the row is there, so the workflow
--     checks the answer and not only the status.
--   * The function keeps its grants (create or replace): only anon runs it.
-- =============================================================================

create table public.heartbeat (
  id boolean primary key default true check (id)
);

insert into public.heartbeat default values;

alter table public.heartbeat enable row level security;

create policy "Anyone without a session can read the heartbeat"
on public.heartbeat for select to anon
using (true);

-- Supabase grants everything on new public tables to authenticated (the
-- initial migration only changed that default for anon), and TRUNCATE
-- bypasses RLS: only anon's read stays.
revoke all on table public.heartbeat from anon, authenticated;
grant select on table public.heartbeat to anon;

create or replace function public.keep_alive()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.heartbeat);
$$;
