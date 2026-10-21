-- =============================================================================
-- Members can forget a product of their list's catalog
-- (docs/improvements.md, M-5).
--
-- A product typed wrong ("tomatse"), or one the household no longer buys,
-- keeps coming back in the suggestions and the frequents, since the catalog
-- remembers everything ever added. Until now members could only read it (the
-- items triggers write it). Now they can also delete a row of a list they
-- are in: the product stops being suggested, and if it is added again the
-- trigger starts it from scratch (times_added 1, no remembered category,
-- price or quantity).
--
--   * Only DELETE is granted, besides the SELECT of the initial migration:
--     inserting or editing the catalog stays the triggers' job, so its
--     history can only be what items made it.
--   * The policy is the one items and categories have for members: the row's
--     list must be one the caller is in. A member could empty the catalog,
--     as they can already delete every item of the list.
--   * The catalog is not in the Realtime publication: the other members see
--     it gone with their next read of it.
-- =============================================================================

grant delete on table public.catalog to authenticated;

create policy "Members can forget catalog products"
on public.catalog for delete to authenticated
using (private.is_list_member(list_id));
