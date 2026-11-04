-- =============================================================================
-- Each product's rhythm, read from the trips (docs/improvements.md, F-7).
--
-- The catalog remembers how many times a product was added and when it was
-- last added, so "Lo de siempre" treats weekly water and quarterly ketchup
-- alike: anything added three times in the last 60 days comes back checked
-- every week, and anything slower never qualifies. The trips (F-4) know when
-- each product was actually bought: every emptying of the cart is a trip with
-- the rows it took. These two views read that history as what the add bar
-- needs to tell what is due from what is still at home: per product, how
-- many trips it was in, the last one and the typical gap between them; per
-- list, the typical gap between its trips (what "before the next trip"
-- means for that household).
--
--   * Views, not columns: computed when read, so an emptying that was undone
--     (restore_trip soft-deletes the trip and takes its rows out) stops
--     counting on its own, and nothing has to be kept in step with the
--     catalog. A household's history is hundreds of rows: the read is cheap.
--   * security_invoker: the views run as the caller, so the policies of
--     items and trips apply as if the client had made the query itself (a
--     member reads their lists' rows, a stranger reads nothing). Only
--     SELECT is granted, to authenticated: there is nothing to write.
--   * The typical gap is the median of the gaps between consecutive
--     purchases, in days with a fraction: two purchases give a first value,
--     and one late or early purchase does not drag it the way an average
--     would. Null with a single purchase.
--   * A product counts once per trip, whatever its rows there: the same
--     product twice in one cart is one purchase.
--   * An emptying less than half a day after the previous one is the same
--     visit to the store (one member empties the cart, another checks what
--     was missing and empties it again): it adds no purchase and no gap, so
--     a gap of minutes does not drag the median to zero. The visit's last
--     emptying is its time. Same rule for the list and for each product.
--   * A row deleted for good leaves its trip, as it leaves the history: a
--     purchase is a row that is still there. A trip with no rows left still
--     counts as a trip of the list, since the cart was emptied.
--   * Not in the Realtime publication (views cannot be): the client reads
--     them with the catalog, and again after emptying the cart or undoing
--     it, as it does with the history.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- catalog_rhythm: one row per product bought at least once
-- -----------------------------------------------------------------------------

create view public.catalog_rhythm
with (security_invoker = true)
as
with purchases as (
  select distinct i.list_id, i.name_normalized, t.emptied_at
  from public.items i
  join public.trips t on t.list_id = i.list_id and t.id = i.trip_id
  where t.deleted_at is null
),
gaps as (
  select
    list_id,
    name_normalized,
    emptied_at,
    (extract(epoch from emptied_at - lag(emptied_at) over (
      partition by list_id, name_normalized
      order by emptied_at
    )) / 86400)::double precision as gap_days
  from purchases
)
select
  list_id,
  name_normalized,
  -- The first purchase, and each one half a day or more after the previous.
  (count(*) filter (where gap_days is null or gap_days >= 0.5))::integer
    as times_bought,
  max(emptied_at) as last_bought_at,
  percentile_cont(0.5) within group (order by gap_days)
    filter (where gap_days >= 0.5) as interval_days
from gaps
group by list_id, name_normalized;

comment on view public.catalog_rhythm is
  'How often a product goes through the checkout (F-7): the trips it was in, the last one and the median gap between them, in days. Read as the caller.';
comment on column public.catalog_rhythm.times_bought is
  'Trips the product was in, once per trip; two within half a day are one.';
comment on column public.catalog_rhythm.last_bought_at is
  'emptied_at of the last emptying it was in.';
comment on column public.catalog_rhythm.interval_days is
  'Median of the gaps between consecutive trips it was in, in days with a fraction. Null with a single trip.';

-- -----------------------------------------------------------------------------
-- list_rhythm: one row per list with at least one trip
-- -----------------------------------------------------------------------------

create view public.list_rhythm
with (security_invoker = true)
as
with gaps as (
  select
    list_id,
    (extract(epoch from emptied_at - lag(emptied_at) over (
      partition by list_id
      order by emptied_at
    )) / 86400)::double precision as gap_days
  from public.trips
  where deleted_at is null
)
select
  list_id,
  -- The first trip, and each one half a day or more after the previous.
  (count(*) filter (where gap_days is null or gap_days >= 0.5))::integer
    as trips_count,
  percentile_cont(0.5) within group (order by gap_days)
    filter (where gap_days >= 0.5) as interval_days
from gaps
group by list_id;

comment on view public.list_rhythm is
  'How often a list''s cart is emptied (F-7): its trips and the median gap between them, in days. Read as the caller.';
comment on column public.list_rhythm.trips_count is
  'Trips of the list that were not undone; two within half a day are one.';
comment on column public.list_rhythm.interval_days is
  'Median of the gaps between consecutive trips, in days with a fraction. Null with a single trip.';

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
-- Supabase grants everything on new public relations to anon and
-- authenticated by default (initial migration). Members read; nobody writes
-- (the views are not updatable anyway: aggregates), and anon has nothing, as
-- with items and trips.

revoke all on table public.catalog_rhythm from anon, authenticated;
grant select on table public.catalog_rhythm to authenticated;

revoke all on table public.list_rhythm from anon, authenticated;
grant select on table public.list_rhythm to authenticated;
