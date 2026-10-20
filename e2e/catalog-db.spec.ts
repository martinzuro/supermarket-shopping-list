import { expect, test } from "@playwright/test";
import { v7 as newId } from "uuid";
import type { TablesUpdate } from "../src/lib/supabase/database.types";
import { adminClient, anonymousUser, type Client } from "./supabase-admin";

/**
 * Phase 3, the database side of the remembered price (migration
 * `catalog_price_unit_pair`): the catalog keeps the last price with the unit
 * it was given in, so a new item gets it only in the same basis (per kilo,
 * per litre, per unit). Items are written as a real user, as the app does;
 * the catalog is read with the service role.
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
    .select("last_unit, last_price, last_currency, times_added")
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

  test("a currency change on a priced item moves the pair, and keeps its unit", async () => {
    const ana = await person();
    const oil = await add(ana, {
      name: "Aceite",
      unit: "L",
      estimated_price: 12,
      currency: "USD",
    });
    await edit(ana, oil.id, { currency: "UYU", estimated_price: 480 });
    expect(await remembered(ana.listId, "aceite")).toMatchObject({
      last_unit: "L",
      last_price: 480,
      last_currency: "UYU",
    });
  });
});
