import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "./items";
import { queryKeys } from "./keys";
import type { List } from "./lists";
import {
  carryOverFor,
  clearCarryOver,
  idsFor,
  prepareCarryOver,
  readCarryOver,
  useCarryOver,
  useClaimCarryOver,
  useMergeList,
  type CarryOver,
} from "./merge";
import {
  makeRpc,
  makeTable,
  makeTestQueryClient,
  makeWrapper,
} from "./test-utils";

const USER = "00000000-0000-7000-8000-000000000001";
const LIST = "00000000-0000-7000-8000-000000000002";
const OWN = "00000000-0000-7000-8000-000000000004";
const ANONYMOUS = "00000000-0000-7000-8000-000000000008";
const TOKEN = "c".repeat(48);

type Result = { data: unknown; error: unknown; status?: number };

const writeInvites = vi.fn<(row: unknown) => Promise<Result>>();
const callRpc = vi.fn<(name: string, args: unknown) => Promise<Result>>();
const never = () => new Promise<Result>(() => {});
const tables = {
  list_invites: makeTable({ read: never, write: writeInvites }),
  items: makeTable({ read: never, write: never }),
  catalog: makeTable({ read: never, write: never }),
  list_members: makeTable({ read: never, write: never }),
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: keyof typeof tables) => tables[table].builder(),
    rpc: makeRpc((name, args) => callRpc(name, args)),
  }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function list(partial: Partial<List> & Pick<List, "id">): List {
  return {
    name: "Mi lista",
    created_by: USER,
    created_at: "2026-10-17T00:00:00.000Z",
    updated_at: "2026-10-17T00:00:00.000Z",
    deleted_at: null,
    role: "owner",
    joined_at: "2026-10-17T00:00:00.000Z",
    member_count: 1,
    ...partial,
  };
}

function row(
  partial: Partial<Item> & Pick<Item, "id" | "name" | "position">,
): Item {
  return {
    list_id: LIST,
    name_normalized: partial.name.toLowerCase(),
    quantity: null,
    unit: null,
    note: null,
    category_id: null,
    estimated_price: null,
    currency: "UYU",
    checked: false,
    checked_at: null,
    created_by: USER,
    created_at: "2026-10-19T00:00:00.000Z",
    updated_at: "2026-10-19T00:00:00.000Z",
    deleted_at: null,
    ...partial,
  };
}

const NOTE_KEY = "lista:carry-over";
const EMAIL = "cuenta@example.com";
const ACCOUNT = { id: USER, is_anonymous: false, email: EMAIL };

beforeEach(() => {
  writeInvites.mockReset();
  callRpc.mockReset();
  tables.list_invites.insert.mockClear();
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("idsFor", () => {
  it("gives a new id per source item and some to spare, all different", () => {
    const ids = idsFor(3);
    expect(ids).toHaveLength(23);
    expect(new Set(ids).size).toBe(23);
    expect(idsFor(0)).toHaveLength(20);
    expect(idsFor(-1)).toHaveLength(20);
  });
});

describe("useMergeList", () => {
  const shared = list({
    id: LIST,
    role: "member",
    member_count: 2,
    joined_at: "2026-10-19T00:00:00.000Z",
  });
  const own = list({ id: OWN });
  const pan = row({ id: "pan", name: "Pan", position: 0 });
  const cafe = row({ id: "cafe", name: "Café", position: 2 });

  function setup() {
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(queryKeys.lists(USER), [own, shared]);
    queryClient.setQueryData(queryKeys.items(USER, LIST), [pan, cafe]);
    queryClient.setQueryData(queryKeys.items(USER, OWN), []);
    const hook = renderHook(() => useMergeList(USER, LIST), {
      wrapper: makeWrapper(queryClient),
    });
    const listIds = () =>
      queryClient.getQueryData<List[]>(queryKeys.lists(USER))?.map((l) => l.id);
    const names = () =>
      queryClient
        .getQueryData<Item[]>(queryKeys.items(USER, LIST))
        ?.map((item) => item.name);
    return { ...hook, queryClient, listIds, names };
  }

  it("retires the leftover at once and lays the copies in the server's order", async () => {
    const answer = deferred<Result>();
    callRpc.mockReturnValue(answer.promise);
    const { result, queryClient, listIds, names } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const ids = ["n1", "n2"];

    act(() => result.current.mutate({ sourceListId: OWN, ids }));
    await waitFor(() => expect(listIds()).toEqual([LIST]));
    expect(callRpc).toHaveBeenCalledWith("merge_list", {
      source_list_id: OWN,
      target_list_id: LIST,
      new_ids: ids,
    });
    // Not optimistic: nothing comes over before the server says what.
    expect(names()).toEqual(["Pan", "Café"]);

    await act(async () =>
      answer.resolve({
        data: [
          row({ id: "n1", name: "Leche", position: 1 }),
          row({ id: "n2", name: "Yerba", position: 3 }),
        ],
        error: null,
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(names()).toEqual(["Pan", "Leche", "Café", "Yerba"]);
    expect(
      queryClient.getQueryData(queryKeys.items(USER, OWN)),
    ).toBeUndefined();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.items(USER, LIST),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.lists(USER),
    });
  });

  it("takes a source already gone for the end it wanted", async () => {
    callRpc.mockResolvedValue({
      data: null,
      error: { message: "source_not_found", code: "P0001" },
    });
    const { result, listIds, names } = setup();
    act(() => result.current.mutate({ sourceListId: OWN, ids: [] }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listIds()).toEqual([LIST]);
    expect(names()).toEqual(["Pan", "Café"]);
  });

  it("brings the leftover back when the server refuses", async () => {
    callRpc.mockResolvedValue({
      data: null,
      error: { message: "list_shared", code: "P0001" },
    });
    const { result, listIds } = setup();
    act(() => result.current.mutate({ sourceListId: OWN, ids: [] }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(listIds()).toEqual([OWN, LIST]);
  });
});

describe("the carry-over note", () => {
  const device = list({ id: OWN, created_by: ANONYMOUS });
  const note: CarryOver = {
    token: TOKEN,
    listId: OWN,
    fromUserId: ANONYMOUS,
    forEmail: EMAIL,
    count: 2,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };

  it("leaves a carry-over invite, valid a day, and keeps only token and count", async () => {
    writeInvites.mockImplementation(async (invite) => ({
      data: {
        token: TOKEN,
        expires_at: (invite as { expires_at: string }).expires_at,
      },
      error: null,
    }));
    // As typed: the note keeps it trimmed and in lowercase.
    const saved = await prepareCarryOver(
      ANONYMOUS,
      device,
      2,
      " Cuenta@Example.com",
    );
    const inserted = tables.list_invites.insert.mock.calls[0][0] as {
      list_id: string;
      purpose: string;
      expires_at: string;
    };
    expect(inserted).toMatchObject({ list_id: OWN, purpose: "carry_over" });
    const left = Date.parse(inserted.expires_at) - Date.now();
    expect(left).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(left).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    expect(saved).toEqual({
      token: TOKEN,
      listId: OWN,
      fromUserId: ANONYMOUS,
      forEmail: EMAIL,
      count: 2,
      expiresAt: inserted.expires_at,
    });
    expect(JSON.parse(window.localStorage.getItem(NOTE_KEY)!)).toEqual(saved);
    expect(readCarryOver()).toEqual(saved);
  });

  it.each([
    ["an empty list", device, 0],
    [
      "a list of someone else's",
      list({ id: OWN, role: "member", member_count: 2 }),
      3,
    ],
    ["a list others use", list({ id: OWN, member_count: 2 }), 3],
  ])("leaves nothing for %s", async (_label, from, count) => {
    window.localStorage.setItem(NOTE_KEY, JSON.stringify(note));
    expect(await prepareCarryOver(ANONYMOUS, from, count, EMAIL)).toBeNull();
    expect(tables.list_invites.insert).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(NOTE_KEY)).toBeNull();
  });

  it("never stands in the way of the sign-in", async () => {
    writeInvites.mockResolvedValue({
      data: null,
      error: { message: "TypeError: Failed to fetch" },
      status: 0,
    });
    await expect(
      prepareCarryOver(ANONYMOUS, device, 2, EMAIL),
    ).resolves.toBeNull();
    expect(readCarryOver()).toBeNull();
  });

  it("ignores a note that is broken or past its time", () => {
    window.localStorage.setItem(NOTE_KEY, "{not json");
    expect(readCarryOver()).toBeNull();
    window.localStorage.setItem(NOTE_KEY, JSON.stringify({ token: 1 }));
    expect(readCarryOver()).toBeNull();
    window.localStorage.setItem(
      NOTE_KEY,
      JSON.stringify({
        ...note,
        expiresAt: new Date(Date.now() - 1).toISOString(),
      }),
    );
    expect(readCarryOver()).toBeNull();
  });

  it("is for the account it was left for, never its anonymous author", () => {
    expect(carryOverFor(note, ACCOUNT)).toBe(note);
    expect(
      carryOverFor(note, { ...ACCOUNT, email: "CUENTA@example.com" }),
    ).toBe(note);
    expect(
      carryOverFor(note, { id: ANONYMOUS, is_anonymous: true }),
    ).toBeNull();
    // Signed out meanwhile: a new anonymous user is not the account.
    expect(carryOverFor(note, { ...ACCOUNT, is_anonymous: true })).toBeNull();
    expect(carryOverFor(note, { ...ACCOUNT, id: ANONYMOUS })).toBeNull();
    // Someone else signing in on a shared device meanwhile.
    expect(
      carryOverFor(note, { ...ACCOUNT, email: "otra@example.com" }),
    ).toBeNull();
    expect(carryOverFor(note, { id: USER, is_anonymous: false })).toBeNull();
    expect(carryOverFor(null, ACCOUNT)).toBeNull();
    expect(carryOverFor(note, null)).toBeNull();
  });

  it("follows the note as it is left and cleared", async () => {
    const { result } = renderHook(() => useCarryOver(ACCOUNT));
    expect(result.current).toBeNull();
    writeInvites.mockResolvedValue({
      data: { token: TOKEN, expires_at: note.expiresAt },
      error: null,
    });
    await act(() => prepareCarryOver(ANONYMOUS, device, 2, EMAIL));
    expect(result.current).toMatchObject({ token: TOKEN, count: 2 });
    act(() => clearCarryOver());
    expect(result.current).toBeNull();
  });
});

describe("useClaimCarryOver", () => {
  const note: CarryOver = {
    token: TOKEN,
    listId: OWN,
    fromUserId: ANONYMOUS,
    forEmail: EMAIL,
    count: 1,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };

  function setup() {
    window.localStorage.setItem(NOTE_KEY, JSON.stringify(note));
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(queryKeys.items(USER, LIST), []);
    const hook = renderHook(() => useClaimCarryOver(USER, LIST), {
      wrapper: makeWrapper(queryClient),
    });
    return { ...hook, queryClient };
  }

  it("brings the items in and forgets the note", async () => {
    callRpc.mockResolvedValue({
      data: [row({ id: "n1", name: "Galletitas", position: 0 })],
      error: null,
    });
    const { result, queryClient } = setup();
    act(() => result.current.mutate({ token: TOKEN, ids: ["n1"] }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(callRpc).toHaveBeenCalledWith("claim_carry_over", {
      invite_token: TOKEN,
      target_list_id: LIST,
      new_ids: ["n1"],
    });
    expect(
      queryClient
        .getQueryData<Item[]>(queryKeys.items(USER, LIST))
        ?.map((item) => item.id),
    ).toEqual(["n1"]);
    expect(readCarryOver()).toBeNull();
  });

  it.each(["invite_not_found", "invite_already_used", "invite_expired"])(
    "forgets a note that can no longer be used (%s)",
    async (message) => {
      callRpc.mockResolvedValue({
        data: null,
        error: { message, code: "P0001" },
      });
      const { result } = setup();
      act(() => result.current.mutate({ token: TOKEN, ids: ["n1"] }));
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(readCarryOver()).toBeNull();
    },
  );

  it("keeps the note when the request did not get through", async () => {
    callRpc.mockResolvedValue({
      data: null,
      error: { message: "TypeError: Failed to fetch" },
      status: 0,
    });
    const { result } = setup();
    act(() => result.current.mutate({ token: TOKEN, ids: ["n1"] }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(readCarryOver()).toEqual(note);
  });
});
