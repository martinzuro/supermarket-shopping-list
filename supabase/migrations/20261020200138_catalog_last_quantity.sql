-- =============================================================================
-- The catalog remembers the quantity a product is bought in
-- (docs/improvements.md, A-3).
--
-- "Lo de siempre" and the frequents add products from the catalog. Until
-- now they came without quantity or unit: "2 kg tomates" came back as
-- "tomates", and so without its price per kilo. Now the catalog keeps the
-- last quantity a product was on the list with, and its unit:
--
--   * last_quantity and last_quantity_unit are a pair from the same row. They
--     are not last_unit, which is the unit of last_price (migration
--     catalog_price_unit_pair): mixing the two would break that pair.
--   * A row inserted with a quantity, or updated in its quantity or unit to
--     one with a quantity, gives the catalog its quantity and unit.
--   * A row without a quantity, or one whose quantity is cleared, leaves the
--     remembered pair alone: "tomates" typed bare once does not forget the
--     usual 2 kg.
--   * The update trigger also fires when only the quantity changes. So that
--     a quantity edit (and any other edit that is not a rename) does not
--     rewrite display_name with that row's spelling, an update now takes the
--     display name only when the item's name changed.
--   * private.copy_list_into (merge_list, claim_carry_over) carries the pair
--     with the rest of the catalog.
-- Everything else is as in catalog_price_unit_pair and sharing.
-- =============================================================================

alter table public.catalog
  add column last_quantity numeric,
  add column last_quantity_unit text;

comment on column public.catalog.last_quantity is
  'Quantity of the last item of this product that had one (A-3).';
comment on column public.catalog.last_quantity_unit is
  'Unit of last_quantity, from the same item. Not the unit of last_price.';

create or replace function private.upsert_catalog_from_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_price boolean := new.estimated_price is not null;
  has_quantity boolean := new.quantity is not null;
  price_changed boolean := false;
  unit_changed boolean := false;
  quantity_changed boolean := false;
  repaired boolean := false;
begin
  if tg_op = 'INSERT' then
    insert into public.catalog as c (
      list_id, name_normalized, display_name, last_category_id, last_unit,
      last_price, last_currency, last_quantity, last_quantity_unit,
      times_added, last_added_at
    )
    values (
      new.list_id, new.name_normalized, new.name, new.category_id, new.unit,
      new.estimated_price, case when has_price then new.currency end,
      new.quantity, case when has_quantity then new.unit end, 1, now()
    )
    on conflict (list_id, name_normalized) do update set
      display_name = excluded.display_name,
      last_category_id = coalesce(excluded.last_category_id, c.last_category_id),
      last_unit = case
        when has_price then excluded.last_unit
        when c.last_price is null then coalesce(excluded.last_unit, c.last_unit)
        else c.last_unit
      end,
      last_price = case when has_price then excluded.last_price else c.last_price end,
      last_currency = case when has_price then excluded.last_currency else c.last_currency end,
      last_quantity = case
        when has_quantity then excluded.last_quantity
        else c.last_quantity
      end,
      last_quantity_unit = case
        when has_quantity then excluded.last_quantity_unit
        else c.last_quantity_unit
      end,
      times_added = c.times_added + 1,
      last_added_at = excluded.last_added_at;
  else
    price_changed := (new.estimated_price, new.currency)
      is distinct from (old.estimated_price, old.currency);
    unit_changed := new.unit is distinct from old.unit;
    quantity_changed := has_quantity
      and (new.quantity, new.unit) is distinct from (old.quantity, old.unit);
    -- The row's (price, currency, unit) becomes the catalog's: a new price,
    -- or the same price now read in another unit.
    repaired := has_price and (price_changed or unit_changed);

    insert into public.catalog as c (
      list_id, name_normalized, display_name, last_category_id, last_unit,
      last_price, last_currency, last_quantity, last_quantity_unit,
      times_added, last_added_at
    )
    values (
      new.list_id, new.name_normalized, new.name, new.category_id, new.unit,
      new.estimated_price, case when has_price then new.currency end,
      new.quantity, case when has_quantity then new.unit end, 1, now()
    )
    on conflict (list_id, name_normalized) do update set
      display_name = case
        when new.name is distinct from old.name then excluded.display_name
        else c.display_name
      end,
      last_category_id = case
        when new.category_id is distinct from old.category_id then excluded.last_category_id
        else c.last_category_id
      end,
      last_unit = case
        when repaired then excluded.last_unit
        -- The price was cleared: no price is left to keep a unit for.
        when price_changed then excluded.last_unit
        when unit_changed and c.last_price is null then excluded.last_unit
        else c.last_unit
      end,
      last_price = case
        when repaired or price_changed then excluded.last_price
        else c.last_price
      end,
      last_currency = case
        when repaired or price_changed then excluded.last_currency
        else c.last_currency
      end,
      last_quantity = case
        when quantity_changed then excluded.last_quantity
        else c.last_quantity
      end,
      last_quantity_unit = case
        when quantity_changed then excluded.last_quantity_unit
        else c.last_quantity_unit
      end;
  end if;

  return null;
end;
$$;

-- CREATE OR REPLACE keeps the function's owner and privileges; restated, as
-- in the initial migration: a trigger function needs no EXECUTE grant.
revoke all on function private.upsert_catalog_from_item() from public, anon, authenticated;

-- The update trigger of the initial migration, now also on a quantity change.
drop trigger items_upsert_catalog_after_update on public.items;

create trigger items_upsert_catalog_after_update
after update on public.items
for each row
when (
  new.deleted_at is null
  and (
    new.name_normalized is distinct from old.name_normalized
    or new.category_id is distinct from old.category_id
    or new.unit is distinct from old.unit
    or new.quantity is distinct from old.quantity
    or new.estimated_price is distinct from old.estimated_price
    or new.currency is distinct from old.currency
  )
)
execute function private.upsert_catalog_from_item();

-- As in the sharing migration, with the remembered quantity in the catalog
-- copy. The items part is unchanged.
create or replace function private.copy_list_into(
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
    last_price, last_currency, last_quantity, last_quantity_unit,
    times_added, last_added_at
  )
  select
    target_list_id, s.name_normalized, s.display_name,
    private.matching_category(s.last_category_id, target_list_id),
    s.last_unit, s.last_price, s.last_currency, s.last_quantity,
    s.last_quantity_unit, s.times_added, s.last_added_at
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

revoke all on function private.copy_list_into(uuid, uuid, uuid, uuid[])
from public, anon, authenticated;
