import { expect, test } from "@playwright/test";
import { v7 as newId } from "uuid";
import {
  addMember,
  adminClient,
  anonymousUser,
  noSessionClient,
  type Client,
} from "./supabase-admin";

/**
 * Phase 3, the database side of the route (migration `category_order`):
 * move_category called as real users (anonymous sessions with the
 * publishable key, as the app makes them). No browser: these run in Node.
 * The service role only prepares and checks.
 */

test.skip(
  process.env.E2E_SUPABASE !== "1",
  "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
);

type Person = { client: Client; id: string; listId: string };

/** A first use: an anonymous user and their list (the app's own calls). */
async function person(): Promise<Person> {
  const { client, id } = await anonymousUser();
  const listId = newId();
  const { error } = await client
    .from("lists")
    .insert({ id: listId, name: "Mi lista" });
  if (error) throw error;
  return { client, id, listId };
}

type Row = { id: string; name: string; position: number; updated_at: string };

/** The list's live categories in route order, as the service role sees them. */
async function route(listId: string): Promise<Row[]> {
  const { data, error } = await adminClient()
    .from("categories")
    .select("id, name, position, updated_at")
    .eq("list_id", listId)
    .is("deleted_at", null)
    .order("position")
    .order("created_at")
    .order("id");
  if (error) throw error;
  return data;
}

const names = (rows: Row[]) => rows.map((row) => row.name);

function idOf(rows: Row[], name: string) {
  const row = rows.find((r) => r.name === name);
  if (!row) throw new Error(`no category ${name}`);
  return row.id;
}

async function move(
  who: Client,
  rows: Row[],
  name: string,
  direction: string,
  pastName: string,
) {
  return who.rpc("move_category", {
    target_category_id: idOf(rows, name),
    direction,
    past_category_id: idOf(rows, pastName),
  });
}

const DEFAULT_ROUTE = [
  "Frutas y verduras",
  "Carnes y pescados",
  "Fiambres y lácteos",
  "Panadería",
  "Almacén",
  "Bebidas",
  "Congelados",
  "Limpieza",
  "Higiene",
  "Otros",
];

test.describe("move_category", () => {
  test("moves a category past the next one, writing only the two rows that change", async () => {
    const ana = await person();
    const before = await route(ana.listId);
    expect(names(before)).toEqual(DEFAULT_ROUTE);

    const { data, error } = await move(
      ana.client,
      before,
      "Bebidas",
      "up",
      "Almacén",
    );
    expect(error).toBeNull();
    const after = await route(ana.listId);
    // The answer is the whole route, in its new order.
    expect(data!.map((c) => c.name)).toEqual(names(after));
    expect(names(after)).toEqual([
      ...DEFAULT_ROUTE.slice(0, 4),
      "Bebidas",
      "Almacén",
      ...DEFAULT_ROUTE.slice(6),
    ]);
    expect(after.map((c) => c.position)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    const changed = after.filter(
      (row) =>
        row.updated_at !== before.find((b) => b.id === row.id)!.updated_at,
    );
    expect(names(changed).sort()).toEqual(["Almacén", "Bebidas"]);

    // And down: Frutas past Carnes.
    await move(
      ana.client,
      after,
      "Frutas y verduras",
      "down",
      "Carnes y pescados",
    );
    expect(names(await route(ana.listId)).slice(0, 2)).toEqual([
      "Carnes y pescados",
      "Frutas y verduras",
    ]);
  });

  test("moves once when the same move comes twice, as a retry after a lost answer does", async () => {
    const ana = await person();
    const before = await route(ana.listId);
    await move(ana.client, before, "Otros", "up", "Higiene");
    const once = await route(ana.listId);
    const { error } = await move(ana.client, before, "Otros", "up", "Higiene");
    expect(error).toBeNull();
    const twice = await route(ana.listId);
    expect(names(twice)).toEqual(names(once));
    expect(twice.map((c) => c.updated_at)).toEqual(
      once.map((c) => c.updated_at),
    );
  });

  test("puts it right before or after a category further away", async () => {
    const ana = await person();
    const before = await route(ana.listId);
    await move(ana.client, before, "Otros", "up", "Carnes y pescados");
    expect(names(await route(ana.listId)).slice(0, 3)).toEqual([
      "Frutas y verduras",
      "Otros",
      "Carnes y pescados",
    ]);
    await move(ana.client, before, "Frutas y verduras", "down", "Higiene");
    const after = await route(ana.listId);
    expect(names(after).slice(-2)).toEqual(["Higiene", "Frutas y verduras"]);
    expect(after.map((c) => c.position)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  test("changes nothing when the category to move past is gone or in another list", async () => {
    const ana = await person();
    const bob = await person();
    const before = await route(ana.listId);
    const theirs = await route(bob.listId);

    const { error } = await ana.client.rpc("move_category", {
      target_category_id: idOf(before, "Bebidas"),
      direction: "up",
      past_category_id: idOf(theirs, "Almacén"),
    });
    expect(error).toBeNull();
    expect(names(await route(ana.listId))).toEqual(DEFAULT_ROUTE);

    await adminClient()
      .from("categories")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", idOf(before, "Almacén"));
    const gone = await move(ana.client, before, "Bebidas", "up", "Almacén");
    expect(gone.error).toBeNull();
    expect(names(await route(ana.listId))).toEqual(
      DEFAULT_ROUTE.filter((name) => name !== "Almacén"),
    );
  });

  test("refuses a direction that is not up or down, or a move past itself", async () => {
    const ana = await person();
    const rows = await route(ana.listId);
    for (const [direction, past] of [
      ["left", "Almacén"],
      ["up", "Bebidas"],
    ]) {
      const { error } = await move(
        ana.client,
        rows,
        "Bebidas",
        direction,
        past,
      );
      expect(error?.message).toBe("invalid_move");
      expect(error?.code).toBe("22023");
    }
    const { error } = await ana.client.rpc("move_category", {
      target_category_id: idOf(rows, "Bebidas"),
      direction: "up",
      past_category_id: null as unknown as string,
    });
    expect(error?.message).toBe("invalid_move");
    expect(names(await route(ana.listId))).toEqual(DEFAULT_ROUTE);
  });

  test("lets every member move, and nobody else", async () => {
    const ana = await person();
    const bob = await person();
    const eve = await person();
    await addMember(ana.listId, bob.id);
    const rows = await route(ana.listId);

    const byMember = await move(bob.client, rows, "Bebidas", "up", "Almacén");
    expect(byMember.error).toBeNull();

    // Outside the list: the category is not found, and nothing moves.
    const after = await route(ana.listId);
    const byOutsider = await move(eve.client, rows, "Otros", "up", "Higiene");
    expect(byOutsider.error?.message).toBe("category_not_found");
    expect(byOutsider.status).toBe(400);
    expect(await route(ana.listId)).toEqual(after);

    // Without a session at all, the function cannot even be called.
    const byAnon = await move(
      noSessionClient(),
      rows,
      "Otros",
      "up",
      "Higiene",
    );
    expect(byAnon.error?.code).toBe("42501");
    expect(await route(ana.listId)).toEqual(after);
  });

  test("finds no category of a list its owner deleted", async () => {
    const ana = await person();
    const rows = await route(ana.listId);
    await ana.client
      .from("lists")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", ana.listId);
    const { error } = await move(ana.client, rows, "Bebidas", "up", "Almacén");
    expect(error?.message).toBe("category_not_found");
  });

  test("applies moves by two members at once, every one, and keeps the positions 0..n-1", async () => {
    const ana = await person();
    const bob = await person();
    await addMember(ana.listId, bob.id);
    const rows = await route(ana.listId);

    // Two moves of different categories at the same moment: both apply.
    const [mine, theirs] = await Promise.all([
      move(ana.client, rows, "Higiene", "up", "Limpieza"),
      move(bob.client, rows, "Panadería", "down", "Almacén"),
    ]);
    expect(mine.error).toBeNull();
    expect(theirs.error).toBeNull();
    const after = names(await route(ana.listId));
    expect(after.indexOf("Higiene")).toBe(after.indexOf("Limpieza") - 1);
    expect(after.indexOf("Panadería")).toBe(after.indexOf("Almacén") + 1);

    // A burst of moves from both, each from the route it last saw.
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, n) => {
        const who = n % 2 === 0 ? ana : bob;
        const name = DEFAULT_ROUTE[(n * 3) % DEFAULT_ROUTE.length];
        const past = DEFAULT_ROUTE[(n * 3 + 1) % DEFAULT_ROUTE.length];
        return move(who.client, rows, name, n % 3 === 0 ? "down" : "up", past);
      }),
    );
    expect(results.map((r) => r.error)).toEqual(results.map(() => null));
    const final = await route(ana.listId);
    expect(final.map((c) => c.position)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect([...names(final)].sort()).toEqual([...DEFAULT_ROUTE].sort());
  });
});
