import { expect, test } from "@playwright/test";
import { v7 as newId } from "uuid";
import {
  adminClient,
  anonymousUser,
  confirmEmail,
  type Client,
} from "./supabase-admin";

/**
 * Phase 2c, the database side of sharing, against the local Supabase stack:
 * the RPCs of migration `sharing` and the membership policies, called as real
 * users (anonymous sessions with the publishable key, as the app makes them).
 * No browser: these run in Node. The service role only prepares and checks.
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

/** A person with an account (email confirmed). */
async function account(label: string): Promise<Person & { email: string }> {
  const someone = await person();
  const email = `${label}-${someone.id.slice(0, 8)}@example.com`;
  await confirmEmail(someone.id, email);
  return { ...someone, email };
}

async function createInvite(
  owner: Person,
  purpose: "share" | "carry_over" = "share",
) {
  const { data, error } = await owner.client
    .from("list_invites")
    .insert({ list_id: owner.listId, purpose })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function accept(who: Person, token: string) {
  return who.client.rpc("accept_invite", { invite_token: token });
}

async function addItem(
  who: Person,
  name: string,
  extra: Record<string, unknown> = {},
  listId = who.listId,
) {
  const { data, error } = await who.client
    .from("items")
    .insert({ id: newId(), list_id: listId, name, ...extra })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function categoryId(who: Person, name: string, listId = who.listId) {
  const { data, error } = await who.client
    .from("categories")
    .select("id")
    .eq("list_id", listId)
    .eq("name", name)
    .single();
  if (error) throw error;
  return data.id;
}

async function liveItems(listId: string) {
  const { data, error } = await adminClient()
    .from("items")
    .select("*")
    .eq("list_id", listId)
    .is("deleted_at", null)
    .order("position");
  if (error) throw error;
  return data;
}

async function membersOf(listId: string) {
  const { data, error } = await adminClient()
    .from("list_members")
    .select("user_id, role")
    .eq("list_id", listId);
  if (error) throw error;
  return data;
}

const DAY_MS = 24 * 60 * 60 * 1000;

test.describe("invites", () => {
  test("an invite lasts seven days at most", async () => {
    const owner = await person();
    const plain = await createInvite(owner);
    const { data: far, error } = await owner.client
      .from("list_invites")
      .insert({ list_id: owner.listId, expires_at: "2099-01-01T00:00:00Z" })
      .select()
      .single();
    expect(error).toBeNull();
    const now = Date.now();
    for (const invite of [plain, far!]) {
      const left = Date.parse(invite.expires_at) - now;
      expect(left).toBeGreaterThan(7 * DAY_MS - 60_000);
      expect(left).toBeLessThanOrEqual(7 * DAY_MS + 60_000);
    }

    const { data: moved } = await owner.client
      .from("list_invites")
      .update({ expires_at: "2099-01-01T00:00:00Z" })
      .eq("id", plain.id)
      .select()
      .single();
    expect(Date.parse(moved!.expires_at) - Date.now()).toBeLessThanOrEqual(
      7 * DAY_MS + 60_000,
    );

    const { error: badPurpose } = await owner.client
      .from("list_invites")
      .insert({ list_id: owner.listId, purpose: "anything" });
    expect(badPurpose?.code).toBe("23514");
  });

  test("invite_preview tells the state without using the invite", async () => {
    const owner = await account("owner");
    const guest = await person();
    const late = await person();
    const invite = await createInvite(owner);

    const preview = async (who: Person, token: string) => {
      const { data, error } = await who.client
        .rpc("invite_preview", { invite_token: token })
        .single();
      expect(error).toBeNull();
      return data;
    };

    expect(await preview(guest, invite.token)).toEqual({
      status: "valid",
      list_id: null,
      inviter_email: owner.email,
    });
    expect(await preview(owner, invite.token)).toEqual({
      status: "member",
      list_id: owner.listId,
      inviter_email: owner.email,
    });
    // Looking does not use it.
    const { data: still } = await adminClient()
      .from("list_invites")
      .select("used_at")
      .eq("id", invite.id)
      .single();
    expect(still!.used_at).toBeNull();

    expect((await accept(guest, invite.token)).error).toBeNull();
    expect(await preview(guest, invite.token)).toMatchObject({
      status: "member",
      list_id: owner.listId,
    });
    expect(await preview(late, invite.token)).toEqual({
      status: "invite_already_used",
      list_id: null,
      inviter_email: null,
    });

    const expired = await createInvite(owner);
    await adminClient()
      .from("list_invites")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", expired.id);
    expect(await preview(late, expired.token)).toEqual({
      status: "invite_expired",
      list_id: null,
      inviter_email: null,
    });

    expect(await preview(late, "0".repeat(48))).toEqual({
      status: "invite_not_found",
      list_id: null,
      inviter_email: null,
    });
    // A carry-over token is not an invitation to join.
    const carry = await createInvite(owner, "carry_over");
    expect((await preview(late, carry.token))!.status).toBe("invite_not_found");

    // An anonymous inviter has no email to show.
    const anonymousOwner = await person();
    const anonymousInvite = await createInvite(anonymousOwner);
    expect(await preview(late, anonymousInvite.token)).toEqual({
      status: "valid",
      list_id: null,
      inviter_email: null,
    });
  });

  test("accept_invite: twice, used, expired, unknown and the owner's own link", async () => {
    const owner = await person();
    const guest = await person();
    const late = await person();
    const invite = await createInvite(owner);

    const first = await accept(guest, invite.token);
    expect(first).toMatchObject({ data: owner.listId, error: null });
    const twice = await accept(guest, invite.token);
    expect(twice).toMatchObject({ data: owner.listId, error: null });
    expect((await accept(late, invite.token)).error?.message).toBe(
      "invite_already_used",
    );

    const own = await createInvite(owner);
    expect(await accept(owner, own.token)).toMatchObject({
      data: owner.listId,
      error: null,
    });
    const { data: ownAfter } = await adminClient()
      .from("list_invites")
      .select("used_at")
      .eq("id", own.id)
      .single();
    expect(ownAfter!.used_at).toBeNull();

    const expired = await createInvite(owner);
    await adminClient()
      .from("list_invites")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", expired.id);
    expect((await accept(late, expired.token)).error?.message).toBe(
      "invite_expired",
    );
    expect((await accept(late, "f".repeat(48))).error?.message).toBe(
      "invite_not_found",
    );

    expect(
      (await membersOf(owner.listId)).map((m) => m.user_id).sort(),
    ).toEqual([owner.id, guest.id].sort());
  });

  test("only the owner creates invites", async () => {
    const owner = await person();
    const guest = await person();
    await accept(guest, (await createInvite(owner)).token);
    const { error } = await guest.client
      .from("list_invites")
      .insert({ list_id: owner.listId });
    expect(error?.code).toBe("42501");
  });

  test("an invite only gets shorter, is used once and keeps its creator", async () => {
    const owner = await account("owner");
    const victim = await account("victim");
    const guest = await person();
    const invite = await createInvite(owner);

    const soon = new Date(Date.now() + DAY_MS).toISOString();
    await owner.client
      .from("list_invites")
      .update({ expires_at: soon })
      .eq("id", invite.id);
    const { data: later } = await owner.client
      .from("list_invites")
      .update({ expires_at: new Date(Date.now() + 5 * DAY_MS).toISOString() })
      .eq("id", invite.id)
      .select()
      .single();
    expect(Date.parse(later!.expires_at)).toBe(Date.parse(soon));

    // Pointing it at someone else would make invite_preview show their email.
    const pointed = await owner.client
      .from("list_invites")
      .update({ created_by: victim.id })
      .eq("id", invite.id);
    expect(pointed.error?.code).toBe("42501");
    const { data: shown } = await guest.client
      .rpc("invite_preview", { invite_token: invite.token })
      .single();
    expect(shown!.inviter_email).toBe(owner.email);

    expect((await accept(guest, invite.token)).error).toBeNull();
    const reused = await owner.client
      .from("list_invites")
      .update({ used_at: null, used_by: null })
      .eq("id", invite.id);
    expect(reused.error?.code).toBe("42501");
  });

  test("a carry-over token does not join its list", async () => {
    const device = await person();
    const signedIn = await person();
    const carry = await createInvite(device, "carry_over");
    expect((await accept(signedIn, carry.token)).error?.message).toBe(
      "invite_not_found",
    );
    expect(await membersOf(device.listId)).toEqual([
      { user_id: device.id, role: "owner" },
    ]);
  });
});

test.describe("members", () => {
  test("only the owner soft-deletes or restores the list", async () => {
    const owner = await person();
    const member = await person();
    await accept(member, (await createInvite(owner)).token);

    const deletedAt = new Date().toISOString();
    const byMember = await member.client
      .from("lists")
      .update({ deleted_at: deletedAt })
      .eq("id", owner.listId);
    expect(byMember.error?.code).toBe("42501");
    // The rest of the list stays theirs to change.
    const renamed = await member.client
      .from("lists")
      .update({ name: "Casa" })
      .eq("id", owner.listId);
    expect(renamed.error).toBeNull();

    const byOwner = await owner.client
      .from("lists")
      .update({ deleted_at: deletedAt })
      .eq("id", owner.listId);
    expect(byOwner.error).toBeNull();
    const restored = await member.client
      .from("lists")
      .update({ deleted_at: null })
      .eq("id", owner.listId);
    expect(restored.error?.code).toBe("42501");
  });

  test("list_member_emails shows the members to members only", async () => {
    const owner = await account("owner");
    const guest = await person();
    const outsider = await person();
    await accept(guest, (await createInvite(owner)).token);

    const { data, error } = await guest.client.rpc("list_member_emails", {
      target_list_id: owner.listId,
    });
    expect(error).toBeNull();
    expect(data).toEqual([
      expect.objectContaining({
        user_id: owner.id,
        role: "owner",
        email: owner.email,
      }),
      expect.objectContaining({
        user_id: guest.id,
        role: "member",
        email: null,
      }),
    ]);

    const { data: none } = await outsider.client.rpc("list_member_emails", {
      target_list_id: owner.listId,
    });
    expect(none).toEqual([]);
  });

  test("members leave, the owner removes them, and the owner row stays", async () => {
    const owner = await person();
    const leaving = await person();
    const removed = await person();
    await accept(leaving, (await createInvite(owner)).token);
    await accept(removed, (await createInvite(owner)).token);

    // A member cannot take the owner out, nor can the owner leave: no rows.
    const noOwner = await leaving.client
      .from("list_members")
      .delete()
      .eq("list_id", owner.listId)
      .eq("user_id", owner.id)
      .select();
    expect(noOwner).toMatchObject({ data: [], error: null });
    const ownerStays = await owner.client
      .from("list_members")
      .delete()
      .eq("list_id", owner.listId)
      .eq("user_id", owner.id)
      .select();
    expect(ownerStays).toMatchObject({ data: [], error: null });
    // Nor remove another member.
    const notYours = await leaving.client
      .from("list_members")
      .delete()
      .eq("list_id", owner.listId)
      .eq("user_id", removed.id)
      .select();
    expect(notYours).toMatchObject({ data: [], error: null });

    const left = await leaving.client
      .from("list_members")
      .delete()
      .eq("list_id", owner.listId)
      .eq("user_id", leaving.id)
      .select();
    expect(left.data).toHaveLength(1);
    const out = await owner.client
      .from("list_members")
      .delete()
      .eq("list_id", owner.listId)
      .eq("user_id", removed.id)
      .select();
    expect(out.data).toHaveLength(1);

    expect(await membersOf(owner.listId)).toEqual([
      { user_id: owner.id, role: "owner" },
    ]);
    // Out of the list, out of its items.
    const { data: seen } = await removed.client
      .from("items")
      .select("id")
      .eq("list_id", owner.listId);
    expect(seen).toEqual([]);
  });

  test("a removed member hears its own removal, then nothing else", async () => {
    const owner = await person();
    const guest = await person();
    await accept(guest, (await createInvite(owner)).token);

    type Heard = { table: string; event: string; old: Record<string, unknown> };
    const heard: Heard[] = [];
    const ownerHeard: Heard[] = [];
    const subscribe = async (who: Person, into: Heard[]) => {
      await who.client.realtime.setAuth();
      const filter = `list_id=eq.${owner.listId}`;
      const channel = who.client.channel(`probe:${who.id}`, {
        config: { postgres_changes_options: { wait: true } },
      });
      for (const table of ["list_members", "items"] as const) {
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter },
          (payload) =>
            into.push({
              table,
              event: payload.eventType,
              old: payload.old as Record<string, unknown>,
            }),
        );
      }
      await new Promise<void>((resolve, reject) =>
        channel.subscribe((state, error) => {
          if (state === "SUBSCRIBED") resolve();
          else if (error) reject(error);
        }),
      );
      return channel;
    };
    const guestChannel = await subscribe(guest, heard);
    const ownerChannel = await subscribe(owner, ownerHeard);

    try {
      await owner.client
        .from("list_members")
        .delete()
        .eq("list_id", owner.listId)
        .eq("user_id", guest.id);
      await expect
        .poll(() => heard.filter((h) => h.table === "list_members"))
        .toEqual([
          {
            table: "list_members",
            event: "DELETE",
            old: { list_id: owner.listId, user_id: guest.id },
          },
        ]);

      // The owner's next changes reach the owner, never the one removed.
      const item = await addItem(owner, "Leche");
      await owner.client
        .from("items")
        .update({ checked: true })
        .eq("id", item.id);
      await expect
        .poll(() => ownerHeard.filter((h) => h.table === "items").length)
        .toBe(2);
      expect(heard.filter((h) => h.table === "items")).toEqual([]);
    } finally {
      await guest.client.removeChannel(guestChannel);
      await owner.client.removeChannel(ownerChannel);
    }
  });
});

test.describe("merging lists", () => {
  test("a guest's own list goes into the shared one", async () => {
    const owner = await person();
    const guest = await person();

    await addItem(owner, "Leche");
    await addItem(owner, "Pan", { position: 1 });

    const produce = await categoryId(guest, "Frutas y verduras");
    await addItem(guest, "leche ", { position: 0 });
    await addItem(guest, "Tomates", { position: 1, category_id: produce });
    const checkedAt = "2026-10-19T12:00:00.000Z";
    await addItem(guest, "Arroz", {
      position: 2,
      checked: true,
      checked_at: checkedAt,
    });
    await addItem(guest, "Café", {
      position: 3,
      quantity: 2,
      unit: "paquetes",
      note: "molido",
    });
    // Bought before and archived: only the catalog remembers it.
    const yerba = await addItem(guest, "Yerba", { position: 4 });
    await guest.client
      .from("items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", yerba.id);

    await accept(guest, (await createInvite(owner)).token);

    const ids = [newId(), newId(), newId(), newId()];
    const { data: copied, error } = await guest.client.rpc("merge_list", {
      source_list_id: guest.listId,
      target_list_id: owner.listId,
      new_ids: ids,
    });
    expect(error).toBeNull();
    // "leche " is the owner's "Leche": the target wins and its id goes unused.
    expect(copied!.map((row) => [row.id, row.name, row.position])).toEqual([
      [ids[1], "Tomates", 2],
      [ids[2], "Arroz", 3],
      [ids[3], "Café", 4],
    ]);
    const [tomates, arroz, cafe] = copied!;
    expect(tomates.category_id).toBe(
      await categoryId(owner, "Frutas y verduras"),
    );
    expect(arroz).toMatchObject({ checked: true });
    expect(Date.parse(arroz.checked_at!)).toBe(Date.parse(checkedAt));
    expect(cafe).toMatchObject({
      quantity: 2,
      unit: "paquetes",
      note: "molido",
    });
    for (const row of copied!) {
      expect(row).toMatchObject({
        list_id: owner.listId,
        created_by: guest.id,
      });
    }

    expect((await liveItems(owner.listId)).map((row) => row.name)).toEqual([
      "Leche",
      "Pan",
      "Tomates",
      "Arroz",
      "Café",
    ]);

    // The catalog learns what the guest's list knew.
    const { data: catalog } = await adminClient()
      .from("catalog")
      .select("name_normalized, times_added")
      .eq("list_id", owner.listId)
      .order("name_normalized");
    expect(catalog).toEqual([
      { name_normalized: "arroz", times_added: 2 },
      { name_normalized: "cafe", times_added: 2 },
      { name_normalized: "leche", times_added: 1 },
      { name_normalized: "pan", times_added: 1 },
      { name_normalized: "tomates", times_added: 2 },
      { name_normalized: "yerba", times_added: 1 },
    ]);

    // Retired: an owner alone in it soft-deletes it.
    const { data: source } = await adminClient()
      .from("lists")
      .select("deleted_at")
      .eq("id", guest.listId)
      .single();
    expect(source!.deleted_at).not.toBeNull();

    // A retry whose answer was lost gets the same rows and copies nothing.
    const again = await guest.client.rpc("merge_list", {
      source_list_id: guest.listId,
      target_list_id: owner.listId,
      new_ids: ids,
    });
    expect(again.error).toBeNull();
    expect(again.data!.map((row) => row.id)).toEqual([ids[1], ids[2], ids[3]]);
    expect(await liveItems(owner.listId)).toHaveLength(5);
  });

  test("items beyond the ids get a server id; an empty list only retires", async () => {
    const owner = await person();
    const guest = await person();
    const empty = await person();
    await addItem(guest, "Fideos");
    await addItem(guest, "Aceite", { position: 1 });
    await accept(guest, (await createInvite(owner)).token);
    await accept(empty, (await createInvite(owner)).token);

    const one = newId();
    const { data } = await guest.client.rpc("merge_list", {
      source_list_id: guest.listId,
      target_list_id: owner.listId,
      new_ids: [one],
    });
    expect(data!.map((row) => row.name)).toEqual(["Fideos", "Aceite"]);
    expect(data![0].id).toBe(one);
    expect(data![1].id).not.toBe(one);

    const { data: nothing, error } = await empty.client.rpc("merge_list", {
      source_list_id: empty.listId,
      target_list_id: owner.listId,
    });
    expect(error).toBeNull();
    expect(nothing).toEqual([]);
    const { data: retired } = await adminClient()
      .from("lists")
      .select("deleted_at")
      .eq("id", empty.listId)
      .single();
    expect(retired!.deleted_at).not.toBeNull();
  });

  test("a member leaves the source; a shared list of one's own stays", async () => {
    const owner = await person();
    const member = await person();
    const other = await person();
    await addItem(owner, "Harina");
    await accept(member, (await createInvite(owner)).token);

    // A member merging the list they are in leaves it; it stays for the rest.
    const { data, error } = await member.client.rpc("merge_list", {
      source_list_id: owner.listId,
      target_list_id: member.listId,
      new_ids: [newId()],
    });
    expect(error).toBeNull();
    expect(data!.map((row) => row.name)).toEqual(["Harina"]);
    expect(await membersOf(owner.listId)).toEqual([
      { user_id: owner.id, role: "owner" },
    ]);
    expect((await liveItems(owner.listId)).map((row) => row.name)).toEqual([
      "Harina",
    ]);

    // The owner of a list others use cannot merge it away.
    await accept(member, (await createInvite(owner)).token);
    await accept(owner, (await createInvite(other)).token);
    const shared = await owner.client.rpc("merge_list", {
      source_list_id: owner.listId,
      target_list_id: other.listId,
      new_ids: [newId()],
    });
    expect(shared.error?.message).toBe("list_shared");
    expect(await liveItems(other.listId)).toEqual([]);
  });

  test("only lists the caller is in", async () => {
    const owner = await person();
    const outsider = await person();
    await addItem(owner, "Sal");

    const steal = await outsider.client.rpc("merge_list", {
      source_list_id: owner.listId,
      target_list_id: outsider.listId,
    });
    expect(steal.error?.message).toBe("source_not_found");
    const push = await outsider.client.rpc("merge_list", {
      source_list_id: outsider.listId,
      target_list_id: owner.listId,
    });
    expect(push.error?.message).toBe("list_not_found");
    const itself = await owner.client.rpc("merge_list", {
      source_list_id: owner.listId,
      target_list_id: owner.listId,
    });
    expect(itself.error?.message).toBe("source_not_found");
    expect(await liveItems(outsider.listId)).toEqual([]);
  });

  test("ids already in the target are a collision, not a retry", async () => {
    const owner = await person();
    const guest = await person();
    const taken = await addItem(owner, "Vinagre");
    await addItem(guest, "Mostaza");
    await accept(guest, (await createInvite(owner)).token);

    const { data, error } = await guest.client.rpc("merge_list", {
      source_list_id: guest.listId,
      target_list_id: owner.listId,
      new_ids: [taken.id],
    });
    expect(data).toBeNull();
    expect(error?.code).toBe("23505");
    // Nothing happened: the source is still the guest's, with its item.
    expect((await liveItems(guest.listId)).map((row) => row.name)).toEqual([
      "Mostaza",
    ]);
    const { data: source } = await adminClient()
      .from("lists")
      .select("deleted_at")
      .eq("id", guest.listId)
      .single();
    expect(source!.deleted_at).toBeNull();
  });
});

test.describe("carrying a device's list over to an account", () => {
  test("the account copies the items without joining the list", async () => {
    const device = await person();
    const signedIn = await account("account");
    await addItem(device, "Galletitas");
    await addItem(device, "Queso", { position: 1, checked: true });
    await addItem(signedIn, "Queso");

    const carry = await createInvite(device, "carry_over");
    const ids = [newId(), newId()];
    const { data, error } = await signedIn.client.rpc("claim_carry_over", {
      invite_token: carry.token,
      target_list_id: signedIn.listId,
      new_ids: ids,
    });
    expect(error).toBeNull();
    expect(data!.map((row) => [row.id, row.name])).toEqual([
      [ids[0], "Galletitas"],
    ]);
    expect(await membersOf(device.listId)).toEqual([
      { user_id: device.id, role: "owner" },
    ]);
    const { data: used } = await adminClient()
      .from("list_invites")
      .select("used_by, used_at")
      .eq("id", carry.id)
      .single();
    expect(used!.used_by).toBe(signedIn.id);

    // The same caller retrying gets the same rows.
    const retry = await signedIn.client.rpc("claim_carry_over", {
      invite_token: carry.token,
      target_list_id: signedIn.listId,
      new_ids: ids,
    });
    expect(retry.data!.map((row) => row.id)).toEqual([ids[0]]);
    expect(await liveItems(signedIn.listId)).toHaveLength(2);

    // Anyone else finds it used.
    const someoneElse = await person();
    const late = await someoneElse.client.rpc("claim_carry_over", {
      invite_token: carry.token,
      target_list_id: someoneElse.listId,
    });
    expect(late.error?.message).toBe("invite_already_used");
  });

  test("a share link cannot copy a list, and the rest of the errors", async () => {
    const device = await person();
    const signedIn = await person();
    const outsider = await person();
    await addItem(device, "Manteca");

    const share = await createInvite(device);
    const viaShare = await signedIn.client.rpc("claim_carry_over", {
      invite_token: share.token,
      target_list_id: signedIn.listId,
    });
    expect(viaShare.error?.message).toBe("invite_not_found");

    const carry = await createInvite(device, "carry_over");
    const notYours = await signedIn.client.rpc("claim_carry_over", {
      invite_token: carry.token,
      target_list_id: outsider.listId,
    });
    expect(notYours.error?.message).toBe("list_not_found");
    const itself = await device.client.rpc("claim_carry_over", {
      invite_token: carry.token,
      target_list_id: device.listId,
    });
    expect(itself.error?.message).toBe("source_not_found");

    await adminClient()
      .from("list_invites")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", carry.id);
    const expired = await signedIn.client.rpc("claim_carry_over", {
      invite_token: carry.token,
      target_list_id: signedIn.listId,
    });
    expect(expired.error?.message).toBe("invite_expired");
    expect(await liveItems(signedIn.listId)).toEqual([]);
  });
});
