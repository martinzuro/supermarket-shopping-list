-- =============================================================================
-- Initial schema (docs/plan.md, section 3.2).
--
-- Tables: lists, list_members, list_invites, categories, items, catalog.
--
-- Access model:
--   * RLS is enabled on every table. Data is reachable only through the
--     `authenticated` role. Supabase anonymous users also get that role (with
--     the `is_anonymous` claim), so every policy keyed on auth.uid() covers
--     them too. The `anon` role (no session at all) gets no privileges.
--   * A user sees a list, and everything inside it, only while they are a
--     member of it (list_members).
--
-- Ids: the client generates UUID v7 ids (ADR 0003). The gen_random_uuid()
-- defaults are a fallback for rows the database creates itself (the default
-- categories seeded by trigger). No function here generates ids for the client.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Internal schema for RLS helpers and trigger functions. It is not in the Data
-- API's exposed schemas, so nothing in it can be called as an RPC.
create schema private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- normalize_name
-- -----------------------------------------------------------------------------
-- Canonical form of an item name, used as the catalog key (autocomplete and
-- "frecuentes"). The TypeScript twin in src/lib/domain must return exactly the
-- same string for every input. The steps, in this order:
--
--   1. Lowercase with Unicode simple case mapping: the builtin pg_c_utf8
--      collation, which does not depend on the OS locale or on ICU.
--      JavaScript's toLowerCase() gives the same result for every character
--      except two: a word-final Σ becomes ς (step 2 folds it) and İ becomes
--      i + U+0307 (step 4 strips the U+0307).
--   2. Replace ς (U+03C2) with σ (U+03C3).
--   3. Unicode NFD normalization.
--   4. Remove every code point in U+0300..U+036F (Combining Diacritical
--      Marks): accents, diaeresis, tilde. á→a, ü→u, ñ→n. Letters without a
--      canonical decomposition stay as they are (ø, ß, æ, ł).
--   5. Unicode NFC normalization.
--   6. Replace every run of whitespace with one U+0020. Whitespace is exactly
--      the set matched by JavaScript's \s: U+0009..U+000D, U+0020, U+00A0,
--      U+1680, U+2000..U+200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF.
--   7. Remove a leading and a trailing U+0020.
--
-- TypeScript twin (escapes as written in source code):
--
--   value
--     .toLowerCase()
--     .replace(/\u03c2/g, "\u03c3")
--     .normalize("NFD")
--     .replace(/[\u0300-\u036f]/g, "")
--     .normalize("NFC")
--     .replace(/\s+/g, " ")
--     .trim();
--
-- The two can only diverge on characters whose data differs between the
-- Unicode version of Postgres and that of the JavaScript engine.
--
-- Examples: '  Leche   ENTERA ' → 'leche entera', 'Ñoquis' → 'noquis',
-- 'Café\tde  Colombia' → 'cafe de colombia', 'PINGÜINO' → 'pinguino'.
create function public.normalize_name(value text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
return btrim(
  regexp_replace(
    normalize(
      regexp_replace(
        normalize(replace(lower(value collate pg_c_utf8), U&'\03C2', U&'\03C3'), nfd),
        '[\u0300-\u036f]',
        '',
        'g'
      ),
      nfc
    ),
    '[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+',
    ' ',
    'g'
  ),
  ' '
);

comment on function public.normalize_name(text) is
  'Catalog key for an item name: simple lowercase, fold final sigma, NFD, strip U+0300..U+036F, NFC, collapse JavaScript \s runs to one space, trim. Mirrored one-to-one in src/lib/domain.';

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '' and char_length(name) <= 100),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.list_members (
  list_id uuid not null references public.lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create table public.list_invites (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  -- 192 random bits, hex encoded. The client may omit it and read it back.
  token text not null unique
    default encode(extensions.gen_random_bytes(24), 'hex')
    check (char_length(token) >= 16),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 100),
  -- Order of the categories in the list: the route through the supermarket.
  position integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- Target of the composite foreign keys below, which keep an item's (and a
  -- catalog entry's) category inside the same list.
  unique (list_id, id)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  -- Always overwritten by the items_set_name_normalized trigger. The default
  -- only keeps the column optional on insert.
  name_normalized text not null default '' check (name_normalized <> ''),
  quantity numeric check (quantity > 0),
  unit text check (char_length(unit) <= 30),
  note text check (char_length(note) <= 2000),
  category_id uuid,
  estimated_price numeric check (estimated_price >= 0),
  currency text default 'UYU' check (currency ~ '^[A-Z]{3}$'),
  checked boolean not null default false,
  checked_at timestamptz,
  position integer not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint items_category_id_fkey foreign key (list_id, category_id)
    references public.categories (list_id, id) on delete set null (category_id)
);

create table public.catalog (
  list_id uuid not null references public.lists (id) on delete cascade,
  name_normalized text not null,
  display_name text not null,
  last_category_id uuid,
  last_unit text,
  last_price numeric,
  last_currency text,
  times_added integer not null default 0,
  last_added_at timestamptz not null default now(),
  primary key (list_id, name_normalized),
  constraint catalog_last_category_id_fkey foreign key (list_id, last_category_id)
    references public.categories (list_id, id) on delete set null (last_category_id)
);

create index items_list_id_idx on public.items (list_id);
create index items_list_id_category_id_idx on public.items (list_id, category_id);
create index categories_list_id_position_idx on public.categories (list_id, position);
create index list_members_user_id_idx on public.list_members (user_id);
create index list_invites_list_id_idx on public.list_invites (list_id);

-- -----------------------------------------------------------------------------
-- RLS helpers
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER so that policies on list_members can ask about membership
-- without recursing into list_members' own policies.

create function private.is_list_member(target_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.list_members m
    where m.list_id = target_list_id
      and m.user_id = (select auth.uid())
  );
$$;

create function private.is_list_owner(target_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.list_members m
    where m.list_id = target_list_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

-- updated_at on every table that has it.
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at
before update on public.lists
for each row execute function private.set_updated_at();

create trigger set_updated_at
before update on public.categories
for each row execute function private.set_updated_at();

create trigger set_updated_at
before update on public.items
for each row execute function private.set_updated_at();

-- lists.created_by is immutable. Without this, a member could point it at
-- another user and make the list show up for them (see the lists select policy).
create function private.prevent_created_by_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot be changed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger prevent_created_by_change
before update of created_by on public.lists
for each row execute function private.prevent_created_by_change();

-- New list: owner membership and the ten default categories, in the order of
-- a typical walk through the supermarket. SECURITY DEFINER because
-- list_members has no insert policy.
create function private.handle_new_list()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.list_members (list_id, user_id, role)
  values (new.id, new.created_by, 'owner');

  insert into public.categories (list_id, name, position, is_default)
  select new.id, d.name, (d.ord - 1)::integer, true
  from unnest(array[
    'Frutas y verduras',
    'Carnes y pescados',
    'Fiambres y lácteos',
    'Panadería',
    'Almacén',
    'Bebidas',
    'Congelados',
    'Limpieza',
    'Higiene',
    'Otros'
  ]) with ordinality as d (name, ord);

  return null;
end;
$$;

create trigger lists_after_insert
after insert on public.lists
for each row execute function private.handle_new_list();

-- items.name_normalized always derives from items.name. It also fires when an
-- update targets name_normalized directly, so the column cannot be tampered with.
create function private.set_item_name_normalized()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name_normalized := public.normalize_name(new.name);
  return new;
end;
$$;

create trigger items_set_name_normalized
before insert or update of name, name_normalized on public.items
for each row execute function private.set_item_name_normalized();

-- Catalog upsert, keyed by (list_id, name_normalized).
--
-- On item insert:
--   * display_name takes the item's name; times_added += 1 (1 for a new
--     entry); last_added_at = now().
--   * last_category_id and last_unit take the item's value when it is not
--     null, so a quick add with only a name keeps what the catalog remembers.
--   * last_price and last_currency move together, and only when the item has
--     a price. last_currency is null exactly when last_price is null, so the
--     catalog never pairs a price with the wrong currency.
--
-- On item update (only when name_normalized, category_id, unit,
-- estimated_price or currency changed, and the item is not soft-deleted):
--   * An entry that does not exist yet (the item was renamed) is created as on
--     insert, with times_added = 1.
--   * An existing entry takes display_name plus only the fields that changed
--     in this update (price and currency as a pair). An explicit edit can
--     clear a value. times_added and last_added_at do not change.
--
-- SECURITY DEFINER so it can write catalog, which users can only read.
create function private.upsert_catalog_from_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_price boolean := new.estimated_price is not null;
  price_changed boolean := false;
begin
  if tg_op = 'INSERT' then
    insert into public.catalog as c (
      list_id, name_normalized, display_name, last_category_id, last_unit,
      last_price, last_currency, times_added, last_added_at
    )
    values (
      new.list_id, new.name_normalized, new.name, new.category_id, new.unit,
      new.estimated_price, case when has_price then new.currency end, 1, now()
    )
    on conflict (list_id, name_normalized) do update set
      display_name = excluded.display_name,
      last_category_id = coalesce(excluded.last_category_id, c.last_category_id),
      last_unit = coalesce(excluded.last_unit, c.last_unit),
      last_price = case when has_price then excluded.last_price else c.last_price end,
      last_currency = case when has_price then excluded.last_currency else c.last_currency end,
      times_added = c.times_added + 1,
      last_added_at = excluded.last_added_at;
  else
    price_changed := (new.estimated_price, new.currency)
      is distinct from (old.estimated_price, old.currency);

    insert into public.catalog as c (
      list_id, name_normalized, display_name, last_category_id, last_unit,
      last_price, last_currency, times_added, last_added_at
    )
    values (
      new.list_id, new.name_normalized, new.name, new.category_id, new.unit,
      new.estimated_price, case when has_price then new.currency end, 1, now()
    )
    on conflict (list_id, name_normalized) do update set
      display_name = excluded.display_name,
      last_category_id = case
        when new.category_id is distinct from old.category_id then excluded.last_category_id
        else c.last_category_id
      end,
      last_unit = case
        when new.unit is distinct from old.unit then excluded.last_unit
        else c.last_unit
      end,
      last_price = case when price_changed then excluded.last_price else c.last_price end,
      last_currency = case when price_changed then excluded.last_currency else c.last_currency end;
  end if;

  return null;
end;
$$;

create trigger items_upsert_catalog_after_insert
after insert on public.items
for each row
when (new.deleted_at is null)
execute function private.upsert_catalog_from_item();

create trigger items_upsert_catalog_after_update
after update on public.items
for each row
when (
  new.deleted_at is null
  and (
    new.name_normalized is distinct from old.name_normalized
    or new.category_id is distinct from old.category_id
    or new.unit is distinct from old.unit
    or new.estimated_price is distinct from old.estimated_price
    or new.currency is distinct from old.currency
  )
)
execute function private.upsert_catalog_from_item();

-- -----------------------------------------------------------------------------
-- accept_invite
-- -----------------------------------------------------------------------------
-- Adds the caller to the invite's list as 'member' and returns the list id.
--   * Caller already a member (including the owner opening their own link):
--     returns the list id and leaves the invite unused.
--   * Otherwise the invite must exist, belong to a list that is not
--     soft-deleted, be unused and not expired. It is then marked used.
-- Errors (the message is a stable key for the client to map to a text):
--   not_authenticated (42501), invite_not_found, invite_already_used,
--   invite_expired (P0001).
create function public.accept_invite(invite_token text)
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
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.lists enable row level security;
alter table public.list_members enable row level security;
alter table public.list_invites enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.catalog enable row level security;

-- lists. The creator can always read the row: `insert ... returning` checks
-- the select policy before the after-insert trigger has created the
-- membership. created_by is immutable (trigger above).
create policy "Members can read their lists"
on public.lists for select to authenticated
using (created_by = (select auth.uid()) or private.is_list_member(id));

create policy "Users can create lists they own"
on public.lists for insert to authenticated
with check (created_by = (select auth.uid()));

create policy "Members can update their lists"
on public.lists for update to authenticated
using (private.is_list_member(id))
with check (private.is_list_member(id));

create policy "Owners can delete their lists"
on public.lists for delete to authenticated
using (private.is_list_owner(id));

-- list_members. Rows are created only by the lists trigger and by
-- accept_invite, so there is no insert or update policy. The owner row cannot
-- be deleted directly: a list always keeps its owner until it is deleted.
create policy "Members can read the members of their lists"
on public.list_members for select to authenticated
using (user_id = (select auth.uid()) or private.is_list_member(list_id));

create policy "Owners remove members and members leave"
on public.list_members for delete to authenticated
using (
  role = 'member'
  and (user_id = (select auth.uid()) or private.is_list_owner(list_id))
);

-- list_invites: owner only.
create policy "Owners can read invites"
on public.list_invites for select to authenticated
using (private.is_list_owner(list_id));

create policy "Owners can create invites"
on public.list_invites for insert to authenticated
with check (private.is_list_owner(list_id) and created_by = (select auth.uid()));

create policy "Owners can update invites"
on public.list_invites for update to authenticated
using (private.is_list_owner(list_id))
with check (private.is_list_owner(list_id));

create policy "Owners can delete invites"
on public.list_invites for delete to authenticated
using (private.is_list_owner(list_id));

-- categories: members of the list.
create policy "Members can read categories"
on public.categories for select to authenticated
using (private.is_list_member(list_id));

create policy "Members can create categories"
on public.categories for insert to authenticated
with check (private.is_list_member(list_id));

create policy "Members can update categories"
on public.categories for update to authenticated
using (private.is_list_member(list_id))
with check (private.is_list_member(list_id));

create policy "Members can delete categories"
on public.categories for delete to authenticated
using (private.is_list_member(list_id));

-- items: members of the list. created_by must be the caller on insert.
create policy "Members can read items"
on public.items for select to authenticated
using (private.is_list_member(list_id));

create policy "Members can create items"
on public.items for insert to authenticated
with check (private.is_list_member(list_id) and created_by = (select auth.uid()));

create policy "Members can update items"
on public.items for update to authenticated
using (private.is_list_member(list_id))
with check (private.is_list_member(list_id));

create policy "Members can delete items"
on public.items for delete to authenticated
using (private.is_list_member(list_id));

-- catalog: read-only for members. Written only by the items triggers.
create policy "Members can read the catalog"
on public.catalog for select to authenticated
using (private.is_list_member(list_id));

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
-- Supabase grants everything on new public tables to anon and authenticated by
-- default. Replace that with the minimum each table needs (RLS still applies
-- on top). TRUNCATE in particular bypasses RLS, so nobody but service_role
-- keeps it.

revoke all on table
  public.lists, public.list_members, public.list_invites,
  public.categories, public.items, public.catalog
from anon, authenticated;

grant select, insert, update, delete on table
  public.lists, public.list_invites, public.categories, public.items
to authenticated;
grant select, delete on table public.list_members to authenticated;
grant select on table public.catalog to authenticated;

-- Functions are executable by PUBLIC by default. Trigger functions need no
-- EXECUTE grant to fire.
revoke all on function public.normalize_name(text) from public, anon;
grant execute on function public.normalize_name(text) to authenticated, service_role;

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_list_member(uuid) to authenticated;
grant execute on function private.is_list_owner(uuid) to authenticated;

-- Objects created later in public by migrations: nothing for anon by default.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------
-- Change events for the tables the list screen subscribes to. Full replica
-- identity on items and categories so update and delete events carry the old
-- row (and filters on list_id work for them).

alter publication supabase_realtime
  add table public.lists, public.list_members, public.categories, public.items;

alter table public.items replica identity full;
alter table public.categories replica identity full;
