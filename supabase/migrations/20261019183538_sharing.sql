-- =============================================================================
-- Sharing (Phase 2c): what the invite screen may know before joining, who the
-- other members are, and folding one list into another.
--
-- In v1 a user sees one list (docs/roadmap.md). Two flows leave a user with a
-- second one, and both end in a merge or a discard:
--
--   * Joining a shared list while having one's own: the own list is merged
--     into the shared one (merge_list) or discarded (a plain soft delete, or
--     leaving it, which the existing policies allow).
--   * Signing in to an existing account on a device whose anonymous list has
--     items: before the session changes, the anonymous user (the list's owner)
--     creates a 'carry_over' invite for it; the account then copies the items
--     with that token (claim_carry_over) without becoming a member, so the
--     account never ends up with two lists.
--
-- It also closes what sharing makes reachable (security review of this
-- migration): an invite's created_by can no longer change, an invite can
-- only get shorter and never be used again, accept_invite takes share
-- invites only, and only a list's owner can soft-delete or restore it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- list_invites: purpose and a cap on the lifetime
-- -----------------------------------------------------------------------------
-- 'share' is the link a member opens to join. 'carry_over' only lets the
-- account the owner signs in to copy the list's items (claim_carry_over). A
-- share link can never be used to copy a list without showing up as a member.
alter table public.list_invites
  add column purpose text not null default 'share'
    check (purpose in ('share', 'carry_over'));

-- An invite lives seven days at most from its creation, and is used once.
-- The default was already seven days, but the owner (policy "Owners can
-- update invites") could set any expires_at, push it forward again and
-- again, or clear used_at to use a link twice.
create function private.guard_invite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.expires_at := least(new.expires_at, now() + interval '7 days');
  else
    new.expires_at := least(new.expires_at, old.expires_at);
    if old.used_at is not null and new.used_at is null then
      raise exception 'invite cannot be used again'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_invite
before insert or update on public.list_invites
for each row execute function private.guard_invite();

-- created_by is immutable, as on lists: invite_preview shows an email, and
-- it must never be someone the owner points the invite at.
create trigger prevent_created_by_change
before update of created_by on public.list_invites
for each row execute function private.prevent_created_by_change();

-- accept_invite, as in the initial schema, for share invites only: a
-- carry-over token copies a list (claim_carry_over), it never joins it.
create or replace function public.accept_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  invite public.list_invites%rowtype;
begin
  if caller is null then
    raise exception 'not_authenticated'
      using errcode = '42501', detail = 'accept_invite requires a signed-in user.';
  end if;

  select i.* into invite
  from public.list_invites i
  join public.lists l on l.id = i.list_id
  where i.token = invite_token
    and i.purpose = 'share'
    and l.deleted_at is null
  for update of i;

  if not found then
    raise exception 'invite_not_found'
      using errcode = 'P0001', detail = 'No invite matches this token.';
  end if;

  if exists (
    select 1
    from public.list_members m
    where m.list_id = invite.list_id
      and m.user_id = caller
  ) then
    return invite.list_id;
  end if;

  if invite.used_at is not null then
    raise exception 'invite_already_used'
      using errcode = 'P0001', detail = 'This invite has already been used.';
  end if;

  if invite.expires_at <= now() then
    raise exception 'invite_expired'
      using errcode = 'P0001', detail = 'This invite has expired.';
  end if;

  insert into public.list_members (list_id, user_id, role)
  values (invite.list_id, caller, 'member')
  on conflict (list_id, user_id) do nothing;

  update public.list_invites
  set used_at = now(), used_by = caller
  where id = invite.id;

  return invite.list_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- lists: only the owner soft-deletes or restores, and never a list in use
-- -----------------------------------------------------------------------------
-- The update policy lets any member change a list, deleted_at included: with
-- sharing, a member could make the list disappear for everyone. And deleting
-- a shared list is not a feature of v1: an owner can soft-delete a list only
-- while nobody else is in it (the discard of a list left behind, and
-- merge_list, which checks the same first). Requests with no user (the
-- service role, migrations) are not end users and pass.
create function private.only_owner_changes_deleted_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not distinct from old.deleted_at
    or (select auth.uid()) is null
  then
    return new;
  end if;

  if not private.is_list_owner(old.id) then
    raise exception 'only the owner can delete or restore a list'
      using errcode = '42501';
  end if;

  if new.deleted_at is not null and exists (
    select 1
    from public.list_members m
    where m.list_id = old.id
      and m.user_id <> (select auth.uid())
  ) then
    raise exception 'list_shared'
      using errcode = 'P0001', detail = 'Other members still use this list.';
  end if;

  return new;
end;
$$;

create trigger only_owner_changes_deleted_at
before update of deleted_at on public.lists
for each row execute function private.only_owner_changes_deleted_at();

-- -----------------------------------------------------------------------------
-- invite_preview
-- -----------------------------------------------------------------------------
-- What the invite screen shows before the user decides, without using the
-- invite. Same checks and order as accept_invite, for share invites only:
--   * invite_not_found: no share invite with this token, or its list is gone.
--   * member: the caller is already in the list (the owner opening their own
--     link included); list_id says which, so the app can go there.
--   * invite_already_used, invite_expired.
--   * valid: accept_invite would add the caller.
-- inviter_email is the email of the list's owner (null while anonymous), the
-- only one who can create invites, and only when the token is valid or the
-- caller is a member: whoever holds a valid link can join and see it anyway.
create function public.invite_preview(invite_token text)
returns table (status text, list_id uuid, inviter_email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := (select auth.uid());
  invite public.list_invites%rowtype;
  inviter text;
begin
  if caller is null then
    raise exception 'not_authenticated'
      using errcode = '42501', detail = 'invite_preview requires a signed-in user.';
  end if;

  select i.* into invite
  from public.list_invites i
  join public.lists l on l.id = i.list_id
  where i.token = invite_token
    and i.purpose = 'share'
    and l.deleted_at is null;

  if not found then
    return query select 'invite_not_found'::text, null::uuid, null::text;
    return;
  end if;

  select u.email::text into inviter
  from public.list_members m
  join auth.users u on u.id = m.user_id
  where m.list_id = invite.list_id
    and m.role = 'owner';

  if exists (
    select 1
    from public.list_members m
    where m.list_id = invite.list_id
      and m.user_id = caller
  ) then
    return query select 'member'::text, invite.list_id, inviter;
    return;
  end if;

  if invite.used_at is not null then
    return query select 'invite_already_used'::text, null::uuid, null::text;
    return;
  end if;

  if invite.expires_at <= now() then
    return query select 'invite_expired'::text, null::uuid, null::text;
    return;
  end if;

  return query select 'valid'::text, null::uuid, inviter;
end;
$$;

-- -----------------------------------------------------------------------------
-- list_member_emails
-- -----------------------------------------------------------------------------
-- The members of a list with their email, for its members only (anyone else
-- gets no rows). The email is null while a member is anonymous. There are no
-- profiles: the email is the only way to tell members apart.
create function public.list_member_emails(target_list_id uuid)
returns table (user_id uuid, role text, joined_at timestamptz, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, m.role, m.joined_at, u.email::text
  from public.list_members m
  join auth.users u on u.id = m.user_id
  where m.list_id = target_list_id
    and private.is_list_member(target_list_id)
  order by m.joined_at, m.user_id;
$$;

-- -----------------------------------------------------------------------------
-- Copying one list into another
-- -----------------------------------------------------------------------------

-- The target list's category with the same normalized name as the source
-- category, if any. Every list starts with the same ten defaults.
create function private.matching_category(
  source_category_id uuid,
  target_list_id uuid
)
returns uuid
language sql
stable
set search_path = ''
as $$
  select t.id
  from public.categories s
  join public.categories t
    on t.list_id = target_list_id
    and t.deleted_at is null
    and public.normalize_name(t.name) = public.normalize_name(s.name)
  where s.id = source_category_id
  order by t.position, t.id
  limit 1;
$$;

-- Copies what the source list has into the target, for merge_list and
-- claim_carry_over, which check who may do it. Runs with their privileges.
--
--   * Catalog first: entries the target does not have come with their history
--     (times_added, last values); entries it has stay as they are.
--   * Items: every item of the source not soft-deleted, pending or in the
--     cart, as it is (checked stays checked). An item whose name_normalized
--     matches an item of the target not soft-deleted is skipped: the target
--     wins. Its category is the target's category with the same name, or
--     none. They go after the target's items, in the source's order, and
--     count as added by the caller (the catalog trigger counts them too).
--   * Ids: new_ids[n] is the id of the copy of the n-th source item in the
--     source's order (position, created_at, id), the ids the client generates
--     for every write (ADR 0003). A skipped item leaves its id unused. Items
--     beyond the array get a server id.
--
-- Returns the copies, in their new order.
create function private.copy_list_into(
  source_list_id uuid,
  target_list_id uuid,
  caller uuid,
  new_ids uuid[]
)
returns setof public.items
language plpgsql
set search_path = ''
as $$
declare
  base integer;
begin
  insert into public.catalog (
    list_id, name_normalized, display_name, last_category_id, last_unit,
    last_price, last_currency, times_added, last_added_at
  )
  select
    target_list_id, s.name_normalized, s.display_name,
    private.matching_category(s.last_category_id, target_list_id),
    s.last_unit, s.last_price, s.last_currency, s.times_added, s.last_added_at
  from public.catalog s
  where s.list_id = source_list_id
  on conflict (list_id, name_normalized) do nothing;

  select coalesce(max(t.position), -1) + 1 into base
  from public.items t
  where t.list_id = target_list_id;

  return query
  with source_items as (
    select
      s.*,
      row_number() over (order by s.position, s.created_at, s.id) as ord
    from public.items s
    where s.list_id = source_list_id
      and s.deleted_at is null
  ),
  kept as (
    select si.*, row_number() over (order by si.ord) as seq
    from source_items si
    where not exists (
      select 1
      from public.items t
      where t.list_id = target_list_id
        and t.deleted_at is null
        and t.name_normalized = si.name_normalized
    )
  ),
  copied as (
    insert into public.items (
      id, list_id, name, quantity, unit, note, category_id,
      estimated_price, currency, checked, checked_at, position, created_by
    )
    select
      coalesce(new_ids[k.ord::integer], gen_random_uuid()),
      target_list_id, k.name, k.quantity, k.unit, k.note,
      private.matching_category(k.category_id, target_list_id),
      k.estimated_price, k.currency, k.checked, k.checked_at,
      base + (k.seq - 1)::integer,
      caller
    from kept k
    order by k.ord
    returning *
  )
  select c.* from copied c order by c.position, c.created_at, c.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- merge_list
-- -----------------------------------------------------------------------------
-- Merges a list the caller is in into another one they are in (both not
-- soft-deleted), then retires the source for the caller: an owner with
-- nobody else in it soft-deletes it, a member leaves it. An owner cannot
-- merge away a list others still use (list_shared). Nothing here goes beyond
-- what the caller can already do with their own reads and writes, save the
-- catalog, which only the items triggers write.
--
-- A retry whose first attempt went through (its answer was lost) finds the
-- source gone for the caller and the copies in the target by their ids, and
-- returns them instead of failing.
--
-- Errors (stable keys, as in accept_invite): not_authenticated (42501),
-- list_not_found (the target), source_not_found, list_shared (P0001).
create function public.merge_list(
  source_list_id uuid,
  target_list_id uuid,
  new_ids uuid[] default '{}'
)
returns setof public.items
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  source_role text;
begin
  if caller is null then
    raise exception 'not_authenticated'
      using errcode = '42501', detail = 'merge_list requires a signed-in user.';
  end if;

  -- The caller's own membership rows are locked, never anyone else's: a
  -- removal waits for the merge, and two merges of the same source by the
  -- same caller run one after the other (the second finds nothing new to
  -- copy).
  perform 1
  from public.list_members m
  join public.lists l on l.id = m.list_id
  where m.list_id = target_list_id
    and m.user_id = caller
    and l.deleted_at is null
  for share of m;
  if not found then
    raise exception 'list_not_found'
      using errcode = 'P0001', detail = 'The caller is not in the target list.';
  end if;

  select m.role into source_role
  from public.list_members m
  join public.lists l on l.id = m.list_id
  where m.list_id = source_list_id
    and m.user_id = caller
    and l.deleted_at is null
    and source_list_id <> target_list_id
  for update of m;
  if not found then
    if exists (
      select 1
      from public.items i
      where i.list_id = target_list_id
        and i.id = any (new_ids)
    ) then
      return query
      select i.*
      from public.items i
      where i.list_id = target_list_id
        and i.id = any (new_ids)
      order by i.position, i.created_at, i.id;
      return;
    end if;
    raise exception 'source_not_found'
      using errcode = 'P0001', detail = 'The caller is not in the source list.';
  end if;

  if source_role = 'owner' and exists (
    select 1
    from public.list_members m
    where m.list_id = source_list_id
      and m.user_id <> caller
  ) then
    raise exception 'list_shared'
      using errcode = 'P0001', detail = 'Other members still use the source list.';
  end if;

  return query
  select * from private.copy_list_into(source_list_id, target_list_id, caller, new_ids);

  if source_role = 'owner' then
    update public.lists
    set deleted_at = now()
    where id = source_list_id;
  else
    delete from public.list_members
    where list_id = source_list_id
      and user_id = caller;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- claim_carry_over
-- -----------------------------------------------------------------------------
-- Copies the list of a 'carry_over' invite into a list the caller is in,
-- without making the caller a member of it, and marks the invite used. Only
-- the list's owner can create the invite (policy "Owners can create
-- invites"), so the token is that owner's consent. The source list is left
-- as it is.
--
-- A retry by the same caller after the invite was used returns the copies
-- already in the target by their ids.
--
-- Errors: not_authenticated (42501), list_not_found (the target),
-- invite_not_found, invite_already_used, invite_expired, source_not_found
-- (the invite is for the target itself) (P0001).
create function public.claim_carry_over(
  invite_token text,
  target_list_id uuid,
  new_ids uuid[] default '{}'
)
returns setof public.items
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  invite public.list_invites%rowtype;
begin
  if caller is null then
    raise exception 'not_authenticated'
      using errcode = '42501', detail = 'claim_carry_over requires a signed-in user.';
  end if;

  perform 1
  from public.list_members m
  join public.lists l on l.id = m.list_id
  where m.list_id = target_list_id
    and m.user_id = caller
    and l.deleted_at is null
  for share of m;
  if not found then
    raise exception 'list_not_found'
      using errcode = 'P0001', detail = 'The caller is not in the target list.';
  end if;

  select i.* into invite
  from public.list_invites i
  join public.lists l on l.id = i.list_id
  where i.token = invite_token
    and i.purpose = 'carry_over'
    and l.deleted_at is null
  for update of i;

  if not found then
    raise exception 'invite_not_found'
      using errcode = 'P0001', detail = 'No carry-over invite matches this token.';
  end if;

  if invite.used_at is not null then
    if invite.used_by = caller then
      return query
      select i.*
      from public.items i
      where i.list_id = target_list_id
        and i.id = any (new_ids)
      order by i.position, i.created_at, i.id;
      return;
    end if;
    raise exception 'invite_already_used'
      using errcode = 'P0001', detail = 'This invite has already been used.';
  end if;

  if invite.expires_at <= now() then
    raise exception 'invite_expired'
      using errcode = 'P0001', detail = 'This invite has expired.';
  end if;

  if invite.list_id = target_list_id then
    raise exception 'source_not_found'
      using errcode = 'P0001', detail = 'The invite is for the target list itself.';
  end if;

  return query
  select * from private.copy_list_into(invite.list_id, target_list_id, caller, new_ids);

  update public.list_invites
  set used_at = now(), used_by = caller
  where id = invite.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
-- Functions are executable by PUBLIC by default, and the initial migration's
-- revoke on schema private only covered the functions that existed then.

revoke all on function public.invite_preview(text) from public, anon;
grant execute on function public.invite_preview(text) to authenticated;

revoke all on function public.list_member_emails(uuid) from public, anon;
grant execute on function public.list_member_emails(uuid) to authenticated;

revoke all on function public.merge_list(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.merge_list(uuid, uuid, uuid[]) to authenticated;

revoke all on function public.claim_carry_over(text, uuid, uuid[]) from public, anon;
grant execute on function public.claim_carry_over(text, uuid, uuid[]) to authenticated;

revoke all on function
  private.guard_invite(),
  private.only_owner_changes_deleted_at(),
  private.matching_category(uuid, uuid),
  private.copy_list_into(uuid, uuid, uuid, uuid[])
from public, anon, authenticated;
