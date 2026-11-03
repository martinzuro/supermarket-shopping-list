import { expect, test } from "@playwright/test";
import { v7 as newId } from "uuid";
import {
  addMember,
  anonymousUser,
  noSessionClient,
  type Client,
} from "./supabase-admin";

/**
 * F-7, the database side of each product's rhythm (migration
 * `catalog_rhythm`, docs/improvements.md): the views read the trips as how
 * often each product goes through the checkout, and how often the list's
 * cart is emptied. Trips are made as real users, as the app makes them
 * (adding the rows and calling empty_cart), and the views are read as users
 * too, since they run as the caller.
 */

test.skip(
  process.env.E2E_SUPABASE !== "1",
  "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
);

type Person = { client: Client; id: string; listId: string };

async function person(): Promise<Person> {
  const { client, id } = await anonymousUser();
  const listId = newId();
  const { error } = await client
    .from("lists")
    .insert({ id: listId, name: "Mi lista" });
  if (error) throw error;
  return { client, id, listId };
}

/** 10:00 UTC of the given day of September 2026, as the app sends it. */
const day = (n: number) => new Date(Date.UTC(2026, 8, 1 + n, 10)).toISOString();

/**
 * One trip: the products go on the list checked and the cart is emptied at
 * `emptiedAt`. Returns the trip's id and the rows' ids, by product.
 */
async function shop(who: Person, names: string[], emptiedAt: string) {
  const ids: string[] = [];
  for (const name of names) {
    const { data, error } = await who.client
      .from("items")
      .insert({ id: newId(), list_id: who.listId, name, checked: true })
      .select("id")
      .single();
    if (error) throw error;
    ids.push(data.id);
  }
  const tripId = newId();
  const { error } = await who.client.rpc("empty_cart", {
    target_list_id: who.listId,
    target_trip_id: tripId,
    item_ids: ids,
    emptied_at: emptiedAt,
  });
  if (error) throw error;
  return { tripId, ids };
}

/** The products' rhythm as the app reads it, by name. */
async function rhythmOf(client: Client, listId: string) {
  const { data, error } = await client
    .from("catalog_rhythm")
    .select("name_normalized, times_bought, last_bought_at, interval_days")
    .eq("list_id", listId)
    .order("name_normalized");
  if (error) throw error;
  return data;
}

async function listRhythmOf(client: Client, listId: string) {
  const { data, error } = await client
    .from("list_rhythm")
    .select("trips_count, interval_days")
    .eq("list_id", listId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const at = (iso: string) => ({
  asymmetricMatch: (value: unknown) =>
    typeof value === "string" && Date.parse(value) === Date.parse(iso),
});

test.describe("each product's rhythm, from the trips (F-7)", () => {
  test("a product's rhythm is the median gap between the trips it was in, counted once per trip", async () => {
    const ana = await person();
    await shop(ana, ["Agua", "Ketchup"], day(0));
    // Water twice in one cart is one purchase.
    await shop(ana, ["Agua", "agua", "Pan"], day(7));
    await shop(ana, ["Agua", "Ketchup"], day(21));

    expect(await rhythmOf(ana.client, ana.listId)).toEqual([
      // Gaps of 7 and 14 days: the median is between them.
      {
        name_normalized: "agua",
        times_bought: 3,
        last_bought_at: at(day(21)),
        interval_days: 10.5,
      },
      {
        name_normalized: "ketchup",
        times_bought: 2,
        last_bought_at: at(day(21)),
        interval_days: 21,
      },
      // One purchase: no gap yet.
      {
        name_normalized: "pan",
        times_bought: 1,
        last_bought_at: at(day(7)),
        interval_days: null,
      },
    ]);
    expect(await listRhythmOf(ana.client, ana.listId)).toEqual({
      trips_count: 3,
      interval_days: 10.5,
    });
  });

  test("an undone emptying, and a row deleted for good, stop counting", async () => {
    const ana = await person();
    const first = await shop(ana, ["Agua", "Pan"], day(0));
    await shop(ana, ["Agua"], day(7));
    const last = await shop(ana, ["Agua", "Pan"], day(14));

    const restored = await ana.client.rpc("restore_trip", {
      target_trip_id: last.tripId,
    });
    expect(restored.error).toBeNull();
    expect(await rhythmOf(ana.client, ana.listId)).toEqual([
      {
        name_normalized: "agua",
        times_bought: 2,
        last_bought_at: at(day(7)),
        interval_days: 7,
      },
      {
        name_normalized: "pan",
        times_bought: 1,
        last_bought_at: at(day(0)),
        interval_days: null,
      },
    ]);
    expect(await listRhythmOf(ana.client, ana.listId)).toEqual({
      trips_count: 2,
      interval_days: 7,
    });

    // The bread of the first trip, deleted for good (a member may): its only
    // purchase goes with it. The trip is still one of the list's.
    const { error } = await ana.client
      .from("items")
      .delete()
      .eq("id", first.ids[1]);
    expect(error).toBeNull();
    expect(
      (await rhythmOf(ana.client, ana.listId)).map(
        (row) => row.name_normalized,
      ),
    ).toEqual(["agua"]);
    expect(await listRhythmOf(ana.client, ana.listId)).toMatchObject({
      trips_count: 2,
    });
  });

  test("a list with no trips has no rhythm", async () => {
    const ana = await person();
    const { error } = await ana.client
      .from("items")
      .insert({ id: newId(), list_id: ana.listId, name: "Agua" });
    if (error) throw error;

    expect(await rhythmOf(ana.client, ana.listId)).toEqual([]);
    expect(await listRhythmOf(ana.client, ana.listId)).toBeNull();
  });
});

test.describe("who reads the rhythm", () => {
  test("a member reads it; a stranger, and a member who left, read nothing", async () => {
    const ana = await person();
    await shop(ana, ["Agua"], day(0));
    await shop(ana, ["Agua"], day(7));
    const bob = await anonymousUser();
    await addMember(ana.listId, bob.id);
    const stranger = await person();

    expect(await rhythmOf(bob.client, ana.listId)).toEqual([
      expect.objectContaining({ name_normalized: "agua", times_bought: 2 }),
    ]);
    expect(await listRhythmOf(bob.client, ana.listId)).toEqual({
      trips_count: 2,
      interval_days: 7,
    });

    expect(await rhythmOf(stranger.client, ana.listId)).toEqual([]);
    expect(await listRhythmOf(stranger.client, ana.listId)).toBeNull();

    const { error } = await bob.client
      .from("list_members")
      .delete()
      .eq("list_id", ana.listId)
      .eq("user_id", bob.id);
    if (error) throw error;
    expect(await rhythmOf(bob.client, ana.listId)).toEqual([]);
    expect(await listRhythmOf(bob.client, ana.listId)).toBeNull();
  });

  test("without a session there is nothing to read, and nobody writes the views", async () => {
    const ana = await person();
    await shop(ana, ["Agua"], day(0));
    const nobody = noSessionClient();

    const products = await nobody
      .from("catalog_rhythm")
      .select("name_normalized")
      .eq("list_id", ana.listId);
    expect(products.error?.code).toBe("42501");
    const list = await nobody
      .from("list_rhythm")
      .select("trips_count")
      .eq("list_id", ana.listId);
    expect(list.error?.code).toBe("42501");

    // Refused as not updatable (55000, a view with an aggregate) before the
    // absent grant is even looked at (42501).
    const written = await ana.client
      .from("catalog_rhythm")
      // @ts-expect-error the views take no writes: the types say so too.
      .insert({ list_id: ana.listId, name_normalized: "agua" });
    expect(["55000", "42501"]).toContain(written.error?.code);
    expect(await rhythmOf(ana.client, ana.listId)).toEqual([
      expect.objectContaining({ name_normalized: "agua", times_bought: 1 }),
    ]);
  });
});
