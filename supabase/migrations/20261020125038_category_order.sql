-- =============================================================================
-- The order of a list's categories, the route through the supermarket
-- (Phase 3, docs/plan.md 3.2: categories.position).
--
-- A member moves one category one step up or down the route. The client
-- sends the intent, never the positions it saw: two members moving at once
-- would otherwise each write positions computed from an order the other one
-- is changing, and leave two categories at the same position. Here the
-- server applies every move to the order as it stands when the move runs,
-- with the list's categories locked, so moves in a list run one after the
-- other, each one is applied, and the positions always end up 0..n-1.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- move_category
-- -----------------------------------------------------------------------------
-- Moves a category up the route past another one (it ends right before it;
-- 'up' is towards the start) or down past it (right after it), then
-- renumbers the list's live categories 0..n-1 in route order (position,
-- created_at, id: the order the client sorts by). The app sends the category
-- that was next to it when the user tapped, so a step is a swap. Only the rows
-- whose position changes are written: a step is two UPDATE events for the
-- other members, both sent after the commit.
--
-- Naming the category it moves past, rather than "one step", is what makes a
-- retry safe: when the answer to the first attempt is lost, the second finds
-- the category already in place and changes nothing, where "one more step"
-- would move it twice. A move past a category that is gone, or that is not in
-- the same list, changes nothing either.
--
-- SECURITY INVOKER: it runs with the caller's privileges and policies, so it
-- does nothing a member could not do with their own updates. A category the
-- caller cannot see (another list's, a list they left) is not found.
--
-- The lock is FOR NO KEY UPDATE, the lock the update of position takes
-- anyway: it serializes moves in the list without blocking the item writes
-- that reference a category (their foreign keys take FOR KEY SHARE). Moves
-- take the locks in id order, so two of them never deadlock; only a
-- multi-row UPDATE of categories from elsewhere could, and the app has none.
--
-- Returns the list's live categories in their new order.
--
-- Errors (stable keys, as in the sharing migration): category_not_found
-- (P0001), invalid_move (22023).
create function public.move_category(
  target_category_id uuid,
  direction text,
  past_category_id uuid
)
returns setof public.categories
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_list_id uuid;
  route uuid[];
  past integer;
begin
  if direction is null
    or direction not in ('up', 'down')
    or past_category_id is null
    or past_category_id = target_category_id
  then
    raise exception 'invalid_move'
      using errcode = '22023',
        detail = 'direction must be up or down, past another category.';
  end if;

  select c.list_id into target_list_id
  from public.categories c
  join public.lists l on l.id = c.list_id
  where c.id = target_category_id
    and c.deleted_at is null
    and l.deleted_at is null;

  if not found then
    raise exception 'category_not_found'
      using errcode = 'P0001', detail = 'No category of a list of the caller matches this id.';
  end if;

  -- Always in the same order, so two moves never wait on each other's locks.
  perform 1
  from public.categories c
  where c.list_id = target_list_id
    and c.deleted_at is null
  order by c.id
  for no key update;

  -- A new statement: it sees what a move that held the locks first committed.
  select array_agg(c.id order by c.position, c.created_at, c.id) into route
  from public.categories c
  where c.list_id = target_list_id
    and c.deleted_at is null;

  if array_position(route, target_category_id) is null then
    -- Soft-deleted while this move waited for the lock.
    raise exception 'category_not_found'
      using errcode = 'P0001', detail = 'No category of a list of the caller matches this id.';
  end if;

  route := array_remove(route, target_category_id);
  past := array_position(route, past_category_id);
  if past is not null then
    route := case direction
      when 'up' then route[:past - 1] || target_category_id || route[past:]
      else route[:past] || target_category_id || route[past + 1:]
    end;
  else
    -- Nothing to move past: the route stays as it was.
    route := null;
  end if;

  if route is not null then
    update public.categories c
    set position = r.ord - 1
    from unnest(route) with ordinality as r (id, ord)
    where c.id = r.id
      and c.position is distinct from (r.ord - 1)::integer;
  end if;

  -- Every statement reads with its own snapshot: a caller taken out of the
  -- list during the move would get an empty route back, as if the list had
  -- no categories. They no longer see any of it.
  if not private.is_list_member(target_list_id) then
    raise exception 'category_not_found'
      using errcode = 'P0001', detail = 'No category of a list of the caller matches this id.';
  end if;

  return query
  select c.*
  from public.categories c
  where c.list_id = target_list_id
    and c.deleted_at is null
  order by c.position, c.created_at, c.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
-- Functions are executable by PUBLIC by default.

revoke all on function public.move_category(uuid, text, uuid) from public, anon;
grant execute on function public.move_category(uuid, text, uuid) to authenticated;
