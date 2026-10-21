import { expect, test } from "@playwright/test";
import { v7 as newId } from "uuid";
import type { TablesInsert } from "../src/lib/supabase/database.types";
import {
  addMember,
  adminClient,
  anonymousUser,
  noSessionClient,
  type Client,
} from "./supabase-admin";

/**
 * F-4, the database side of the history (migration `trips`,
 * docs/improvements.md): emptying the cart makes a trip and marks its rows,
 * undoing it takes them out, deleting a row never makes one; members read
 * their lists' trips and nobody writes them by hand. Calls are made as real
 * users, as the app makes them; what the database holds is checked with the
 * service role.
 */

test.skip(
  process.env.E2E_SUPABASE !== "1",
  "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
);

type Person = { client: Client; id: string; listId: string };

async function person(): Promise<Person> {
  const { client, id } = await anonymousUser();
  const listId = await newList(client);
  return { client, id, listId };
}

async function newList(client: Client) {
  const listId = newId();
  const { error } = await client
    .from("lists")
    .insert({ id: listId, name: "Mi lista" });
  if (error) throw error;
  return listId;
}

async function add(
  who: Person,
  fields: Omit<TablesInsert<"items">, "list_id">,
  listId = who.listId,
) {
  const { data, error } = await who.client
    .from("items")
    .insert({ id: newId(), list_id: listId, ...fields })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** The call the app makes when "Vaciar el carro" is tapped. */
function emptyCart(
  who: Person,
  tripId: string,
  itemIds: string[],
  emptiedAt: string,
  listId = who.listId,
) {
  return who.client.rpc("empty_cart", {
    target_list_id: listId,
    target_trip_id: tripId,
    item_ids: itemIds,
    emptied_at: emptiedAt,
  });
}

function restoreTrip(who: Pick<Person, "client">, tripId: string) {
  return who.client.rpc("restore_trip", { target_trip_id: tripId });
}

/** The history as the app reads it (src/lib/queries/trips.ts). */
function history(client: Client, listId: string) {
  return client
    .from("trips")
    .select("id, emptied_at, items!items_trip_id_fkey!inner(id, name, trip_id)")
    .eq("list_id", listId)
    .is("deleted_at", null)
    .order("emptied_at", { ascending: false });
}

/** Every trip of the list, undone ones included, as the database holds them. */
async function tripsOf(listId: string) {
  const { data, error } = await adminClient()
    .from("trips")
    .select("id, emptied_at, emptied_by, deleted_at")
    .eq("list_id", listId);
  if (error) throw error;
  return data;
}

async function rowOf(itemId: string) {
  const { data, error } = await adminClient()
    .from("items")
    .select("id, checked, deleted_at, trip_id")
    .eq("id", itemId)
    .single();
  if (error) throw error;
  return data;
}

const sameInstant = (a: string | null, b: string) =>
  a !== null && Date.parse(a) === Date.parse(b);

const at = () => new Date().toISOString();

test.describe("emptying the cart makes a trip (F-4)", () => {
  test("empty_cart archives what is in the cart into a trip, and a retry returns the same rows", async () => {
    const ana = await person();
    const milk = await add(ana, { name: "Leche", checked: true });
    const bread = await add(ana, { name: "Pan", checked: true, position: 1 });
    const rice = await add(ana, { name: "Arroz", position: 2 });
    const tripId = newId();
    const emptiedAt = at();

    const first = await emptyCart(
      ana,
      tripId,
      [milk.id, bread.id, rice.id],
      emptiedAt,
    );
    expect(first.error).toBeNull();
    expect(first.data?.map((row) => row.id)).toEqual([milk.id, bread.id]);
    for (const row of first.data ?? []) {
      expect(row.trip_id).toBe(tripId);
      expect(sameInstant(row.deleted_at, emptiedAt)).toBe(true);
    }
    // Pending, it stays on the list.
    expect(await rowOf(rice.id)).toMatchObject({
      deleted_at: null,
      trip_id: null,
    });
    const trips = await tripsOf(ana.listId);
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({
      id: tripId,
      emptied_by: ana.id,
      deleted_at: null,
    });
    expect(sameInstant(trips[0].emptied_at, emptiedAt)).toBe(true);

    // The answer was lost: the retry finds the work done.
    const retry = await emptyCart(
      ana,
      tripId,
      [milk.id, bread.id, rice.id],
      emptiedAt,
    );
    expect(retry.error).toBeNull();
    expect(retry.data?.map((row) => row.id)).toEqual([milk.id, bread.id]);
    expect(await tripsOf(ana.listId)).toHaveLength(1);
  });

  test("a row that left the cart stays, and with nothing left there is no trip", async () => {
    const ana = await person();
    const milk = await add(ana, { name: "Leche", checked: true });
    // Unchecked (another member, say) before the emptying ran.
    const { error } = await ana.client
      .from("items")
      .update({ checked: false, checked_at: null })
      .eq("id", milk.id);
    if (error) throw error;

    const result = await emptyCart(ana, newId(), [milk.id], at());
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
    expect(await tripsOf(ana.listId)).toEqual([]);
    expect(await rowOf(milk.id)).toMatchObject({
      deleted_at: null,
      trip_id: null,
    });
  });

  test("deleting a row that was in the cart never makes a trip", async () => {
    const ana = await person();
    const milk = await add(ana, { name: "Leche", checked: true });
    // What useRemoveItem sends.
    const { error } = await ana.client
      .from("items")
      .update({ deleted_at: at() })
      .eq("id", milk.id);
    if (error) throw error;

    expect(await tripsOf(ana.listId)).toEqual([]);
    expect((await rowOf(milk.id)).trip_id).toBeNull();
  });

  test("restore_trip brings the rows back to the cart and takes the trip out of the history; a retry changes nothing", async () => {
    const ana = await person();
    const milk = await add(ana, { name: "Leche", checked: true });
    const bread = await add(ana, { name: "Pan", checked: true, position: 1 });
    const tripId = newId();
    const emptiedAt = at();
    const emptied = await emptyCart(
      ana,
      tripId,
      [milk.id, bread.id],
      emptiedAt,
    );
    expect(emptied.error).toBeNull();

    const restored = await restoreTrip(ana, tripId);
    expect(restored.error).toBeNull();
    expect(restored.data?.map((row) => row.id)).toEqual([milk.id, bread.id]);
    for (const id of [milk.id, bread.id]) {
      expect(await rowOf(id)).toMatchObject({
        checked: true,
        deleted_at: null,
        trip_id: null,
      });
    }
    // Soft-deleted: no ghost trip in the history.
    expect((await history(ana.client, ana.listId)).data).toEqual([]);
    expect((await tripsOf(ana.listId))[0].deleted_at).not.toBeNull();

    const retry = await restoreTrip(ana, tripId);
    expect(retry.error).toBeNull();
    expect(retry.data).toEqual([]);

    // Nor does a late retry of the emptying (the same call) archive them
    // again.
    const late = await emptyCart(ana, tripId, [milk.id, bread.id], emptiedAt);
    expect(late.error).toBeNull();
    expect(late.data).toEqual([]);
    expect((await rowOf(milk.id)).deleted_at).toBeNull();
  });

  test("undoing an emptying that never reached the server changes nothing", async () => {
    const ana = await person();
    const result = await restoreTrip(ana, newId());
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  });

  test("two emptyings at once put each row in one trip", async () => {
    const ana = await person();
    const bob = await anonymousUser();
    await addMember(ana.listId, bob.id);
    const bobs = { ...bob, listId: ana.listId };
    const milk = await add(ana, { name: "Leche", checked: true });
    const bread = await add(ana, { name: "Pan", checked: true, position: 1 });
    const ids = [milk.id, bread.id];

    const [first, second] = await Promise.all([
      emptyCart(ana, newId(), ids, at()),
      emptyCart(bobs, newId(), ids, at()),
    ]);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    const took = [...(first.data ?? []), ...(second.data ?? [])];
    expect(took.map((row) => row.id).sort()).toEqual([...ids].sort());
    // The one that found nothing left made no trip.
    expect(await tripsOf(ana.listId)).toHaveLength(1);
  });

  test("a merge brings the live rows, not the history", async () => {
    const ana = await person();
    const bob = await person();
    const milk = await add(ana, { name: "Leche", checked: true });
    await add(ana, { name: "Pan" });
    expect((await emptyCart(ana, newId(), [milk.id], at())).error).toBeNull();
    // Ana joins Bob's list and brings hers.
    await addMember(bob.listId, ana.id);

    const merged = await ana.client.rpc("merge_list", {
      source_list_id: ana.listId,
      target_list_id: bob.listId,
      new_ids: [newId()],
    });
    expect(merged.error).toBeNull();
    expect(merged.data?.map((row) => [row.name, row.trip_id])).toEqual([
      ["Pan", null],
    ]);
    expect(await tripsOf(bob.listId)).toEqual([]);
    expect((await history(bob.client, bob.listId)).data).toEqual([]);
  });
});

test.describe("who reads and writes trips", () => {
  async function anaWithTrip() {
    const ana = await person();
    const milk = await add(ana, { name: "Leche", checked: true });
    const tripId = newId();
    const emptiedAt = at();
    const emptied = await emptyCart(ana, tripId, [milk.id], emptiedAt);
    if (emptied.error) throw emptied.error;
    return { ana, milk, tripId, emptiedAt };
  }

  test("a member reads the list's trips with their rows", async () => {
    const { ana, milk, tripId } = await anaWithTrip();
    const bob = await anonymousUser();
    await addMember(ana.listId, bob.id);

    const { data, error } = await history(bob.client, ana.listId);
    expect(error).toBeNull();
    expect(data).toEqual([
      {
        id: tripId,
        emptied_at: expect.any(String),
        items: [{ id: milk.id, name: "Leche", trip_id: tripId }],
      },
    ]);
  });

  test("someone outside the list reads nothing, and can neither empty nor undo", async () => {
    const { ana, milk, tripId } = await anaWithTrip();
    const pending = await add(ana, { name: "Pan", checked: true });
    const stranger = await person();

    const read = await history(stranger.client, ana.listId);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    const emptied = await emptyCart(
      stranger,
      newId(),
      [pending.id],
      at(),
      ana.listId,
    );
    expect(emptied.error?.message).toBe("list_not_found");
    expect((await rowOf(pending.id)).deleted_at).toBeNull();

    const restored = await restoreTrip(stranger, tripId);
    expect(restored.error).toBeNull();
    expect(restored.data).toEqual([]);
    expect((await rowOf(milk.id)).trip_id).toBe(tripId);
    expect((await tripsOf(ana.listId))[0].deleted_at).toBeNull();
  });

  test("a member who left the list no longer reads its trips", async () => {
    const { ana, tripId } = await anaWithTrip();
    const bob = await anonymousUser();
    await addMember(ana.listId, bob.id);
    expect((await history(bob.client, ana.listId)).data).toHaveLength(1);

    const { error } = await bob.client
      .from("list_members")
      .delete()
      .eq("list_id", ana.listId)
      .eq("user_id", bob.id);
    if (error) throw error;

    const read = await history(bob.client, ana.listId);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);
    const restored = await restoreTrip(bob, tripId);
    expect(restored.data).toEqual([]);
    expect((await tripsOf(ana.listId))[0].deleted_at).toBeNull();
  });

  test("without a session there is nothing to read or call", async () => {
    const { ana, tripId } = await anaWithTrip();
    const nobody = noSessionClient();

    const read = await nobody.from("trips").select("id").eq("id", tripId);
    expect(read.error?.code).toBe("42501");
    const restored = await nobody.rpc("restore_trip", {
      target_trip_id: tripId,
    });
    expect(restored.error?.code).toBe("42501");
    const emptied = await nobody.rpc("empty_cart", {
      target_list_id: ana.listId,
      target_trip_id: newId(),
      item_ids: [],
      emptied_at: at(),
    });
    expect(emptied.error?.code).toBe("42501");
  });

  test("a trip is its emptier's: nobody else adds to it or undoes it", async () => {
    const { ana, milk, tripId } = await anaWithTrip();
    const bob = await anonymousUser();
    await addMember(ana.listId, bob.id);
    const bobs = { ...bob, listId: ana.listId };
    const bread = await add(ana, { name: "Pan", checked: true });

    // Bob empties into Ana's trip: not a retry of hers.
    const appended = await emptyCart(bobs, tripId, [bread.id], at());
    expect(appended.error?.message).toBe("invalid_trip");
    // Nor is Ana's own call with another time: another emptying.
    const later = await emptyCart(ana, tripId, [bread.id], at());
    expect(later.error?.message).toBe("invalid_trip");
    expect(await rowOf(bread.id)).toMatchObject({
      deleted_at: null,
      trip_id: null,
    });

    // Bob's undo of Ana's emptying changes nothing.
    const undone = await restoreTrip(bob, tripId);
    expect(undone.error).toBeNull();
    expect(undone.data).toEqual([]);
    expect((await rowOf(milk.id)).trip_id).toBe(tripId);
    expect((await tripsOf(ana.listId))[0].deleted_at).toBeNull();
  });

  test("a row of a trip stays archived: it comes back only with restore_trip", async () => {
    const { ana, milk, tripId } = await anaWithTrip();

    const back = await ana.client
      .from("items")
      .update({ deleted_at: null })
      .eq("id", milk.id);
    expect(back.error?.code).toBe("23514");
    expect(await rowOf(milk.id)).toMatchObject({ trip_id: tripId });
    expect((await rowOf(milk.id)).deleted_at).not.toBeNull();
  });

  test("a trip whose rows were deleted for good leaves the history", async () => {
    const { ana, milk } = await anaWithTrip();
    expect((await history(ana.client, ana.listId)).data).toHaveLength(1);

    const { error } = await ana.client.from("items").delete().eq("id", milk.id);
    if (error) throw error;

    const read = await history(ana.client, ana.listId);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);
  });

  test("a trip cannot be moved to another list, nor written by hand", async () => {
    const { ana, milk, tripId, emptiedAt } = await anaWithTrip();
    const otherList = await newList(ana.client);

    const moved = await ana.client
      .from("trips")
      .update({ list_id: otherList })
      .eq("id", tripId);
    expect(moved.error?.code).toBe("42501");
    const inserted = await ana.client.from("trips").insert({
      id: newId(),
      list_id: ana.listId,
      emptied_at: at(),
    });
    expect(inserted.error?.code).toBe("42501");
    const deleted = await ana.client.from("trips").delete().eq("id", tripId);
    expect(deleted.error?.code).toBe("42501");
    expect(await tripsOf(ana.listId)).toHaveLength(1);
    expect(await tripsOf(otherList)).toEqual([]);

    // Nor through the rows: trip_id belongs to the two functions.
    const taken = await ana.client
      .from("items")
      .update({ trip_id: null })
      .eq("id", milk.id);
    expect(taken.error?.code).toBe("42501");
    const bread = await add(ana, { name: "Pan", checked: true });
    const slipped = await ana.client
      .from("items")
      .update({ trip_id: tripId })
      .eq("id", bread.id);
    expect(slipped.error?.code).toBe("42501");
    const forged = await ana.client.from("items").insert({
      id: newId(),
      list_id: ana.listId,
      name: "Yerba",
      trip_id: tripId,
    });
    expect(forged.error?.code).toBe("42501");
    expect((await rowOf(milk.id)).trip_id).toBe(tripId);
    expect((await rowOf(bread.id)).trip_id).toBeNull();

    // Nor by emptying another list into this trip's id, even as its own
    // retry would (same caller, same time).
    const other = { ...ana, listId: otherList };
    const elsewhere = await add(other, { name: "Arroz", checked: true });
    const reused = await emptyCart(other, tripId, [elsewhere.id], emptiedAt);
    expect(reused.error?.message).toBe("invalid_trip");
    expect((await rowOf(elsewhere.id)).deleted_at).toBeNull();
  });
});
