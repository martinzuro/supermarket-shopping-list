import { expect, test } from "@playwright/test";
import { v7 as newId } from "uuid";
import type { TablesUpdate } from "../src/lib/supabase/database.types";
import { adminClient, anonymousUser, type Client } from "./supabase-admin";

/**
 * Phase 3, the database side of the remembered price (migration
 * `catalog_price_unit_pair`): the catalog keeps the last price with the unit
 * it was given in, so a new item gets it only in the same basis (per kilo,
 * per litre, per unit). And the remembered quantity (migration
 * `catalog_last_quantity`, docs/improvements.md A-3): the last quantity a
 * product was on the list with, and its unit, apart from the price's pair.
 * Items are written as a real user, as the app does; the catalog is read
 * with the service role.
 */

test.skip(
  process.env.E2E_SUPABASE !== "1",
  "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
);

type Person = { client: Client; listId: string };

async function person(): Promise<Person> {
  const { client } = await anonymousUser();
  const listId = newId();
  const { error } = await client
    .from("lists")
    .insert({ id: listId, name: "Mi lista" });
  if (error) throw error;
  return { client, listId };
}

async function add(
  who: Person,
  fields: {
    name: string;
    unit?: string | null;
    quantity?: number | null;
    estimated_price?: number | null;
    currency?: string;
  },
) {
  const { data, error } = await who.client
    .from("items")
    .insert({ id: newId(), list_id: who.listId, ...fields })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function edit(who: Person, id: string, changes: TablesUpdate<"items">) {
  const { error } = await who.client.from("items").update(changes).eq("id", id);
  if (error) throw error;
}

async function remembered(listId: string, name: string) {
  const { data, error } = await adminClient()
    .from("catalog")
    .select(
      "display_name, last_unit, last_price, last_currency, last_quantity, last_quantity_unit, times_added",
    )
    .eq("list_id", listId)
    .eq("name_normalized", name)
    .single();
  if (error) throw error;
  return data;
}

test.describe("the catalog's remembered price and its unit", () => {
  test("a price set on a line without unit is remembered per unit, not in the earlier kilo", async () => {
    const ana = await person();
    await add(ana, {
      name: "Tomates",
      quantity: 2,
      unit: "kg",
      estimated_price: 180,
    });
    expect(await remembered(ana.listId, "tomates")).toMatchObject({
      last_unit: "kg",
      last_price: 180,
      last_currency: "UYU",
    });

    // "3 tomates": no unit and no price; the kilo price stays with its kilo.
    const bare = await add(ana, { name: "tomates", quantity: 3 });
    expect(await remembered(ana.listId, "tomates")).toMatchObject({
      last_unit: "kg",
      last_price: 180,
      times_added: 2,
    });

    // Its price is set: per unit. The pair comes from this row.
    await edit(ana, bare.id, { estimated_price: 30 });
    expect(await remembered(ana.listId, "tomates")).toMatchObject({
      last_unit: null,
      last_price: 30,
      last_currency: "UYU",
    });
  });

  test("an add with a price brings its unit, even none; one without price leaves the pair alone", async () => {
    const ana = await person();
    await add(ana, { name: "Leche", estimated_price: 45 });
    // A later line in litres, without price: 45 is still a price per unit.
    await add(ana, { name: "Leche", quantity: 2, unit: "L" });
    expect(await remembered(ana.listId, "leche")).toMatchObject({
      last_unit: null,
      last_price: 45,
    });
    // Priced in litres: the pair moves together.
    await add(ana, { name: "Leche", unit: "L", estimated_price: 50 });
    expect(await remembered(ana.listId, "leche")).toMatchObject({
      last_unit: "L",
      last_price: 50,
    });
  });

  test("the same price read in another unit moves with the unit", async () => {
    const ana = await person();
    const ham = await add(ana, {
      name: "Jamón",
      quantity: 200,
      unit: "g",
      estimated_price: 450,
    });
    expect(await remembered(ana.listId, "jamon")).toMatchObject({
      last_unit: "g",
      last_price: 450,
    });
    // The sheet now reads that 450 per unit: so does the catalog.
    await edit(ana, ham.id, { unit: null });
    expect(await remembered(ana.listId, "jamon")).toMatchObject({
      last_unit: null,
      last_price: 450,
    });
  });

  test("clearing the price forgets it, and the unit follows the item again", async () => {
    const ana = await person();
    const rice = await add(ana, {
      name: "Arroz",
      unit: "kg",
      estimated_price: 62,
      currency: "UYU",
    });
    await edit(ana, rice.id, { estimated_price: null, unit: "paquete" });
    expect(await remembered(ana.listId, "arroz")).toMatchObject({
      last_unit: "paquete",
      last_price: null,
      last_currency: null,
    });
  });

  test("without any price the unit is remembered as before", async () => {
    const ana = await person();
    const flour = await add(ana, { name: "Harina", quantity: 1, unit: "kg" });
    await add(ana, { name: "Harina" });
    expect(await remembered(ana.listId, "harina")).toMatchObject({
      last_unit: "kg",
      last_price: null,
      times_added: 2,
    });
    await edit(ana, flour.id, { unit: "paquete" });
    expect((await remembered(ana.listId, "harina")).last_unit).toBe("paquete");
  });

  test("a currency change alone on a priced row brings that row's unit with it", async () => {
    const ana = await person();
    const oil = await add(ana, {
      name: "Aceite",
      unit: "L",
      estimated_price: 12,
      currency: "USD",
    });
    // A later line without unit, priced per unit, takes the catalog over.
    await add(ana, { name: "aceite", estimated_price: 480, currency: "UYU" });
    expect(await remembered(ana.listId, "aceite")).toMatchObject({
      last_unit: null,
      last_price: 480,
    });
    // The first row changes only its currency: its price is per litre, and
    // the catalog takes it with its litre (12 per unit would be wrong).
    await edit(ana, oil.id, { currency: "UYU" });
    expect(await remembered(ana.listId, "aceite")).toMatchObject({
      last_unit: "L",
      last_price: 12,
      last_currency: "UYU",
    });
  });
});

test.describe("the catalog's remembered quantity", () => {
  test("an add with a quantity is remembered with its unit; a bare one leaves it", async () => {
    const ana = await person();
    await add(ana, { name: "Tomates", quantity: 2, unit: "kg" });
    expect(await remembered(ana.listId, "tomates")).toMatchObject({
      last_quantity: 2,
      last_quantity_unit: "kg",
    });

    // "tomates" bare, once: the usual 2 kg stays.
    await add(ana, { name: "tomates" });
    expect(await remembered(ana.listId, "tomates")).toMatchObject({
      last_quantity: 2,
      last_quantity_unit: "kg",
      times_added: 2,
    });

    // A count without unit is a quantity too, and its unit is none.
    await add(ana, { name: "Tomates", quantity: 6 });
    expect(await remembered(ana.listId, "tomates")).toMatchObject({
      last_quantity: 6,
      last_quantity_unit: null,
    });
  });

  test("an edit of the quantity or its unit is remembered; clearing it is not", async () => {
    const ana = await person();
    const milk = await add(ana, { name: "Leche", quantity: 3 });
    // As "Sumar" does (A-2): only the quantity changes.
    await edit(ana, milk.id, { quantity: 5 });
    expect(await remembered(ana.listId, "leche")).toMatchObject({
      last_quantity: 5,
      last_quantity_unit: null,
      // An edit is not another add.
      times_added: 1,
    });
    await edit(ana, milk.id, { unit: "L" });
    expect(await remembered(ana.listId, "leche")).toMatchObject({
      last_quantity: 5,
      last_quantity_unit: "L",
    });
    await edit(ana, milk.id, { quantity: null });
    expect(await remembered(ana.listId, "leche")).toMatchObject({
      last_quantity: 5,
      last_quantity_unit: "L",
    });
  });

  test("an edit that is not a rename keeps the name the catalog shows", async () => {
    const ana = await person();
    const first = await add(ana, { name: "Tomates", quantity: 2, unit: "kg" });
    // Typed again in lowercase: the catalog shows the last spelling.
    await add(ana, { name: "tomates" });
    expect((await remembered(ana.listId, "tomates")).display_name).toBe(
      "tomates",
    );
    // The first row's quantity changes: no rename, so no other spelling.
    await edit(ana, first.id, { quantity: 3 });
    expect(await remembered(ana.listId, "tomates")).toMatchObject({
      display_name: "tomates",
      last_quantity: 3,
    });
    // A rename does give it the new spelling.
    await edit(ana, first.id, { name: "Tomates perita" });
    expect((await remembered(ana.listId, "tomates perita")).display_name).toBe(
      "Tomates perita",
    );
  });

  test("the quantity and the price keep their own units", async () => {
    const ana = await person();
    await add(ana, {
      name: "Tomates",
      quantity: 2,
      unit: "kg",
      estimated_price: 180,
    });
    // Three tomatoes, without price: the quantity is 3 units, and the price
    // is still 180 per kilo.
    await add(ana, { name: "tomates", quantity: 3 });
    expect(await remembered(ana.listId, "tomates")).toMatchObject({
      last_quantity: 3,
      last_quantity_unit: null,
      last_unit: "kg",
      last_price: 180,
    });
  });

  test("a merge brings the remembered quantity with the rest of the history", async () => {
    const ana = await person();
    await add(ana, { name: "Yerba", quantity: 1, unit: "kg" });
    const targetId = newId();
    const { error: listError } = await ana.client
      .from("lists")
      .insert({ id: targetId, name: "Mi lista" });
    if (listError) throw listError;

    const { error } = await ana.client.rpc("merge_list", {
      source_list_id: ana.listId,
      target_list_id: targetId,
      new_ids: [newId()],
    });
    if (error) throw error;
    expect(await remembered(targetId, "yerba")).toMatchObject({
      last_quantity: 1,
      last_quantity_unit: "kg",
    });
  });
});
