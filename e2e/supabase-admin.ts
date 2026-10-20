import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeName } from "../src/lib/domain/normalize-name";
import type { Database } from "../src/lib/supabase/database.types";

/**
 * Preparación de datos para los e2e contra el Supabase local: usa la clave
 * secreta del stack (solo existe en local) desde Node, nunca desde la página.
 * Sirve para dejar ítems en una categoría sin que haya selector todavía, y
 * para que `sharing-db.spec.ts` pruebe las RPC como usuarios reales.
 */

export const API_URL = "http://127.0.0.1:54331";
const REST = `${API_URL}/rest/v1`;

let cachedStatus: { SECRET_KEY?: string; PUBLISHABLE_KEY?: string } | undefined;

function status() {
  cachedStatus ??= JSON.parse(
    execSync("npx supabase status -o json", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  ) as { SECRET_KEY?: string; PUBLISHABLE_KEY?: string };
  return cachedStatus;
}

/** `E2E_SUPABASE_SECRET_KEY`, o la `SECRET_KEY` de `supabase status`. */
function secretKey(): string {
  const key = process.env.E2E_SUPABASE_SECRET_KEY ?? status().SECRET_KEY;
  if (!key) throw new Error("supabase status did not report a SECRET_KEY");
  return key;
}

/** La clave pública del build, o la `PUBLISHABLE_KEY` de `supabase status`. */
function publishableKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    status().PUBLISHABLE_KEY;
  if (!key) throw new Error("supabase status did not report a PUBLISHABLE_KEY");
  return key;
}

export type Client = SupabaseClient<Database>;

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Cliente con la clave secreta: salta RLS. Solo para preparar y comprobar. */
export function adminClient(): Client {
  return createClient<Database>(API_URL, secretKey(), noSession);
}

/** Cliente con la clave pública y sin sesión: el rol `anon` de PostgREST. */
export function noSessionClient(): Client {
  return createClient<Database>(API_URL, publishableKey(), noSession);
}

/** Un usuario anónimo nuevo, con su propio cliente, como la app al primer uso. */
export async function anonymousUser(): Promise<{ client: Client; id: string }> {
  const client = createClient<Database>(API_URL, publishableKey(), noSession);
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error("no anonymous user");
  return { client, id: data.user.id };
}

/**
 * Le pone un email confirmado a un usuario, que deja de ser anónimo. Atajo
 * de preparación: el flujo real (código por email) lo prueban los e2e de
 * navegador.
 */
export async function confirmEmail(userId: string, email: string) {
  const { error } = await adminClient().auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });
  if (error) throw error;
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

/**
 * Puts an item in a category (the catalog follows through its trigger). The
 * item may have been added through the app a moment ago: its row is on
 * screen before its insert reaches the server, so this waits for the row
 * to exist instead of updating nothing.
 */
export async function setCategory(itemId: string, categoryId: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const rows = await admin<unknown[]>(`/items?id=eq.${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ category_id: categoryId }),
    });
    if (rows.length === 1) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`no item ${itemId} to put in a category`);
}

export type CatalogSeed = {
  name: string;
  /** How many times the list "added" it (what the add bar's rows go by). */
  times: number;
  /** A default category by name, for the one the catalog remembers. */
  category?: string;
  price?: number;
  /** The unit of the price (per kilo with "kg"); per unit by default. */
  priceUnit?: string;
  /** The quantity it was last on the list with, and its unit (A-3). */
  quantity?: number;
  quantityUnit?: string;
  /** The last add, this many days ago (0 by default). */
  daysAgo?: number;
};

/**
 * Gives a list a history: catalog rows, as if its products had been added
 * before. Only the service role writes the catalog (the items triggers keep
 * it); the app reads it when it loads, so the page reloads after this.
 */
export async function seedCatalog(listId: string, rows: CatalogSeed[]) {
  const categories = await categoryIds(listId);
  await admin("/catalog", {
    method: "POST",
    body: JSON.stringify(
      rows.map((row) => ({
        list_id: listId,
        name_normalized: normalizeName(row.name),
        display_name: row.name,
        last_category_id: row.category
          ? (categories.get(row.category) ?? null)
          : null,
        last_price: row.price ?? null,
        last_currency: row.price === undefined ? null : "UYU",
        last_unit: row.priceUnit ?? null,
        last_quantity: row.quantity ?? null,
        last_quantity_unit:
          row.quantity === undefined ? null : (row.quantityUnit ?? null),
        times_added: row.times,
        last_added_at: new Date(
          Date.now() - (row.daysAgo ?? 0) * 86_400_000,
        ).toISOString(),
      })),
    ),
  });
}

/** Archives an item, as the app does when it is deleted or emptied. */
export async function archiveItem(itemId: string) {
  await admin(`/items?id=eq.${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
}

/** Makes a user a plain member of a list (phase-2b.spec.ts: sharing is phase 2c). */
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

/**
 * Moves an invite's expiry into the past, by its token, as if its seven days
 * had gone by (the trigger lets an expiry move earlier, never later).
 */
export async function expireInvite(token: string) {
  const { data, error } = await adminClient()
    .from("list_invites")
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("token", token)
    .select("id");
  if (error) throw error;
  if (data.length !== 1) throw new Error(`no invite with token ${token}`);
}
