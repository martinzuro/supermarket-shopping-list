import { execSync } from "node:child_process";

/**
 * Preparación de datos para los e2e contra el Supabase local: usa la clave
 * secreta del stack (solo existe en local) desde Node, nunca desde la página.
 * Sirve para dejar ítems en una categoría sin que haya selector todavía.
 */

const REST = "http://127.0.0.1:54331/rest/v1";

let cachedKey: string | undefined;

/** `E2E_SUPABASE_SECRET_KEY`, o la `SECRET_KEY` de `supabase status`. */
function secretKey(): string {
  if (cachedKey) return cachedKey;
  const fromEnv = process.env.E2E_SUPABASE_SECRET_KEY;
  if (fromEnv) return (cachedKey = fromEnv);
  const status = execSync("npx supabase status -o json", {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const key = (JSON.parse(status) as { SECRET_KEY?: string }).SECRET_KEY;
  if (!key) throw new Error("supabase status did not report a SECRET_KEY");
  return (cachedKey = key);
}

async function admin<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${REST}${path}`, {
    ...init,
    headers: {
      apikey: secretKey(),
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  });
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path}: ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Ids of the list's categories by name. */
export async function categoryIds(
  listId: string,
): Promise<Map<string, string>> {
  const rows = await admin<{ id: string; name: string }[]>(
    `/categories?select=id,name&list_id=eq.${listId}`,
  );
  return new Map(rows.map((row) => [row.name, row.id]));
}

/** Puts an item in a category (the catalog follows through its trigger). */
export async function setCategory(itemId: string, categoryId: string) {
  await admin(`/items?id=eq.${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ category_id: categoryId }),
  });
}

/** Archives an item, as the app does when it is deleted or emptied. */
export async function archiveItem(itemId: string) {
  await admin(`/items?id=eq.${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
}

/** Makes a user a plain member of a list (the app has no invites yet). */
export async function addMember(listId: string, userId: string) {
  await admin("/list_members", {
    method: "POST",
    body: JSON.stringify({ list_id: listId, user_id: userId, role: "member" }),
  });
}

/** Deletes a list for good, with its items, categories and memberships. */
export async function deleteList(listId: string) {
  await admin(`/lists?id=eq.${listId}`, { method: "DELETE" });
}
