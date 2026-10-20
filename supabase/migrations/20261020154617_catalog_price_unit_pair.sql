-- =============================================================================
-- The catalog keeps a price with the unit it was given in (Phase 3).
--
-- Since Phase 3 an item's estimated price is a shelf price whose basis comes
-- from its unit: per kilo for g and kg, per litre for ml and L, per unit
-- otherwise (docs/plan.md 3.2). A new item starts with the catalog's last
-- price only when its unit has the same basis as the catalog's last unit
-- (src/lib/domain/price.ts, rememberedPrice). That needs last_unit to be the
-- unit of last_price, and the trigger of the initial migration moved them
-- apart: the unit was coalesced on insert and changed on update only with
-- the item's unit, while the price changed only with the item's price. A
-- product priced 180 per kilo and then 30 for a line without unit ended as
-- "30 per kilo".
--
-- Now:
--   * A row with a price, inserted or updated in its price, currency or
--     unit, gives the catalog its price, currency and unit together (the
--     unit even when it is null: per unit).
--   * A row without a price leaves a remembered price alone, with the unit
--     it was given in. With no price remembered, the unit is remembered as
--     before (coalesced on insert, taken on an explicit change).
--   * Clearing an item's price clears the remembered one (as before), and
--     the unit is then free to follow the item.
-- Everything else (display_name, category, times_added, last_added_at, the
-- trigger's WHEN clauses) is as in the initial migration.
-- =============================================================================

create or replace function private.upsert_catalog_from_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_price boolean := new.estimated_price is not null;
  price_changed boolean := false;
  unit_changed boolean := false;
  repaired boolean := false;
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
      last_unit = case
        when has_price then excluded.last_unit
        when c.last_price is null then coalesce(excluded.last_unit, c.last_unit)
        else c.last_unit
      end,
      last_price = case when has_price then excluded.last_price else c.last_price end,
      last_currency = case when has_price then excluded.last_currency else c.last_currency end,
      times_added = c.times_added + 1,
      last_added_at = excluded.last_added_at;
  else
    price_changed := (new.estimated_price, new.currency)
      is distinct from (old.estimated_price, old.currency);
    unit_changed := new.unit is distinct from old.unit;
    -- The row's (price, currency, unit) becomes the catalog's: a new price,
    -- or the same price now read in another unit.
    repaired := has_price and (price_changed or unit_changed);

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
      end;
  end if;

  return null;
end;
$$;

-- CREATE OR REPLACE keeps the function's owner and privileges; restated, as
-- in the initial migration: a trigger function needs no EXECUTE grant.
revoke all on function private.upsert_catalog_from_item() from public, anon, authenticated;
