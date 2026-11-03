-- =============================================================================
-- A query anyone can run, so staging does not pause
--
-- Supabase Free pauses a project after a week without activity (it happened
-- to staging on 2026-11-02). The keep-staging-awake workflow
-- (.github/workflows/keep-staging-awake.yml) calls this every few days through
-- the API with the publishable key, which runs as anon.
--
--   * anon has nothing else in public (initial migration), so this is the one
--     thing a request without a session can do: a real query in Postgres that
--     reads no data and changes nothing.
--   * It succeeds with 200, so a failed run of the workflow means staging is
--     really unreachable (paused, or the key changed), not a denied request.
-- =============================================================================

create function public.keep_alive()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;

-- Functions are executable by PUBLIC by default, and Supabase also grants
-- them to authenticated. Signed-in users have no reason to call this one.
revoke all on function public.keep_alive() from public, authenticated;
grant execute on function public.keep_alive() to anon;
