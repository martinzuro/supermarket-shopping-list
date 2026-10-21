import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "./items";
import { queryKeys } from "./keys";
import type { List } from "./lists";
import {
  readCarryOver,
  useCarryOverOffer,
  useCarryOverPreparation,
  useLeftover,
  type CarryOver,
} from "./merge";
import {
  makeRpc,
  makeTable,
  makeTestQueryClient,
  makeWrapper,
} from "./test-utils";

const USER = "00000000-0000-7000-8000-000000000001";
const SHARED = "00000000-0000-7000-8000-000000000002";
const OWN = "00000000-0000-7000-8000-000000000004";
const ANONYMOUS = "00000000-0000-7000-8000-000000000008";
const TOKEN = "d".repeat(48);
const NOTE_KEY = "lista:carry-over";

type Result = { data: unknown; error: unknown; status?: number };
type Filters = [string, unknown][];

const readMemberships = vi.fn<(filters: Filters) => Promise<Result>>();
const removeMemberships = vi.fn<(filters: Filters) => Promise<Result>>();
const readItems = vi.fn<(filters: Filters) => Promise<Result>>();
const writeInvites = vi.fn<(row: unknown) => Promise<Result>>();
const callRpc = vi.fn<(name: string, args: unknown) => Promise<Result>>();
const never = () => new Promise<Result>(() => {});
const tables = {
  list_members: makeTable({
    read: readMemberships,
    write: never,
    remove: removeMemberships,
  }),
  items: makeTable({ read: readItems, write: never }),
  catalog: makeTable({ read: never, write: never }),
  lists: makeTable({ read: never, write: never }),
  list_invites: makeTable({ read: never, write: writeInvites }),
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: keyof typeof tables) => tables[table].builder(),
    rpc: makeRpc((name, args) => callRpc(name, args)),
  }),
}));

/** A membership as the lists query reads it. */
function membership(
  id: string,
  role: "owner" | "member",
  joinedAt: string,
  members: number,
) {
  return {
    role,
    joined_at: joinedAt,
    list: {
      id,
      name: "Mi lista",
      created_by: role === "owner" ? USER : ANONYMOUS,
      created_at: joinedAt,
      updated_at: joinedAt,
      deleted_at: null,
      members: [{ count: members }],
    },
  };
}

function item(id: string, listId: string, deleted = false): Item {
  return {
    id,
    list_id: listId,
    name: id,
    name_normalized: id,
    quantity: null,
    unit: null,
    note: null,
    category_id: null,
    estimated_price: null,
    currency: "UYU",
    checked: false,
    checked_at: null,
    position: 0,
    created_by: USER,
    created_at: "2026-10-19T00:00:00.000Z",
    updated_at: "2026-10-19T00:00:00.000Z",
    deleted_at: deleted ? "2026-10-19T01:00:00.000Z" : null,
    trip_id: null,
  };
}

const listIdOf = (filters: Filters) =>
  filters.find(([column]) => column === "list_id")?.[1];

/** The user joined SHARED after having OWN (or a list of someone else's). */
function serve(leftover: ReturnType<typeof membership>, items: Item[]) {
  readMemberships.mockResolvedValue({
    data: [
      leftover,
      membership(SHARED, "member", "2026-10-19T00:00:00.000Z", 2),
    ],
    error: null,
  });
  readItems.mockImplementation(async (filters) => ({
    data: listIdOf(filters) === leftover.list.id ? items : [],
    error: null,
  }));
}

beforeEach(() => {
  for (const mock of [
    readMemberships,
    removeMemberships,
    readItems,
    writeInvites,
    callRpc,
  ]) {
    mock.mockReset();
  }
  tables.list_invites.insert.mockClear();
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("useLeftover", () => {
  it("merges an empty list of the user's own at once, asking nothing", async () => {
    serve(membership(OWN, "owner", "2026-10-17T00:00:00.000Z", 1), [
      item("old", OWN, true),
    ]);
    callRpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useLeftover(USER), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });
    await waitFor(() => expect(callRpc).toHaveBeenCalledTimes(1));
    const [name, args] = callRpc.mock.calls[0];
    expect(name).toBe("merge_list");
    expect(args).toMatchObject({
      source_list_id: OWN,
      target_list_id: SHARED,
    });
    expect(result.current.leftover).toBeNull();
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(callRpc).toHaveBeenCalledTimes(1);
  });

  it("asks about a list of the user's own with items, and brings them all", async () => {
    serve(membership(OWN, "owner", "2026-10-17T00:00:00.000Z", 1), [
      item("leche", OWN),
      item("pan", OWN),
      item("archivado", OWN, true),
    ]);
    const { result } = renderHook(() => useLeftover(USER), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });
    await waitFor(() => expect(result.current.leftover?.id).toBe(OWN));
    expect(result.current.count).toBe(2);
    expect(callRpc).not.toHaveBeenCalled();

    callRpc.mockResolvedValue({ data: [], error: null });
    act(() => result.current.bring());
    await waitFor(() => expect(callRpc).toHaveBeenCalledTimes(1));
    const args = callRpc.mock.calls[0][1] as { new_ids: string[] };
    // One id per item it counted, and some to spare.
    expect(args.new_ids).toHaveLength(22);
  });

  it("always asks about a list of someone else's, even empty, and leaving it is the way to drop it", async () => {
    serve(membership(OWN, "member", "2026-10-17T00:00:00.000Z", 3), []);
    removeMemberships.mockResolvedValue({
      data: [{ user_id: USER }],
      error: null,
    });
    const { result } = renderHook(() => useLeftover(USER), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });
    await waitFor(() => expect(result.current.leftover?.id).toBe(OWN));
    expect(result.current.count).toBe(0);
    expect(callRpc).not.toHaveBeenCalled();

    act(() => result.current.drop());
    await waitFor(() => expect(removeMemberships).toHaveBeenCalledTimes(1));
    expect(removeMemberships.mock.calls[0][0]).toEqual([
      ["list_id", OWN],
      ["user_id", USER],
      ["role", "member"],
    ]);
  });

  it("has nothing to ask with one list", async () => {
    readMemberships.mockResolvedValue({
      data: [membership(SHARED, "member", "2026-10-19T00:00:00.000Z", 2)],
      error: null,
    });
    readItems.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useLeftover(USER), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(result.current.leftover).toBeNull();
    expect(callRpc).not.toHaveBeenCalled();
  });
});

describe("useCarryOverOffer", () => {
  const note: CarryOver = {
    token: TOKEN,
    listId: OWN,
    fromUserId: ANONYMOUS,
    forEmail: "cuenta@example.com",
    count: 3,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const account = {
    id: USER,
    is_anonymous: false,
    email: "cuenta@example.com",
  };

  it("brings the device's items into the current list", async () => {
    window.localStorage.setItem(NOTE_KEY, JSON.stringify(note));
    callRpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useCarryOverOffer(account, SHARED), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });
    expect(result.current.note).toEqual(note);
    act(() => result.current.bring());
    await waitFor(() => expect(callRpc).toHaveBeenCalledTimes(1));
    const [name, args] = callRpc.mock.calls[0];
    expect(name).toBe("claim_carry_over");
    expect(args).toMatchObject({
      invite_token: TOKEN,
      target_list_id: SHARED,
    });
    expect((args as { new_ids: string[] }).new_ids).toHaveLength(23);
    await waitFor(() => expect(result.current.note).toBeNull());
  });

  it("leaves them by forgetting the note", () => {
    window.localStorage.setItem(NOTE_KEY, JSON.stringify(note));
    const { result } = renderHook(() => useCarryOverOffer(account, SHARED), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });
    act(() => result.current.leave());
    expect(result.current.note).toBeNull();
    expect(readCarryOver()).toBeNull();
    expect(callRpc).not.toHaveBeenCalled();
  });

  it("waits for a list to bring them into", () => {
    window.localStorage.setItem(NOTE_KEY, JSON.stringify(note));
    const { result } = renderHook(() => useCarryOverOffer(account, null), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });
    expect(result.current.note).toBeNull();
  });
});

describe("useCarryOverPreparation", () => {
  const own: List = {
    id: OWN,
    name: "Mi lista",
    created_by: USER,
    created_at: "2026-10-17T00:00:00.000Z",
    updated_at: "2026-10-17T00:00:00.000Z",
    deleted_at: null,
    role: "owner",
    joined_at: "2026-10-17T00:00:00.000Z",
    member_count: 1,
  };

  it("leaves a carry-over for the list on screen, counting what it shows", async () => {
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(queryKeys.lists(USER), [own]);
    queryClient.setQueryData(queryKeys.items(USER, OWN), [
      item("leche", OWN),
      item("pan", OWN),
      item("archivado", OWN, true),
    ]);
    writeInvites.mockImplementation(async (row) => ({
      data: {
        token: TOKEN,
        expires_at: (row as { expires_at: string }).expires_at,
      },
      error: null,
    }));
    const { result } = renderHook(() => useCarryOverPreparation(USER), {
      wrapper: makeWrapper(queryClient),
    });
    let note: CarryOver | null = null;
    await act(async () => {
      note = await result.current("cuenta@example.com");
    });
    expect(tables.list_invites.insert).toHaveBeenCalledWith(
      expect.objectContaining({ list_id: OWN, purpose: "carry_over" }),
    );
    expect(note).toMatchObject({
      token: TOKEN,
      listId: OWN,
      count: 2,
      forEmail: "cuenta@example.com",
    });
  });

  it("leaves nothing without a list", async () => {
    const { result } = renderHook(() => useCarryOverPreparation(USER), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });
    await act(async () => {
      expect(await result.current("cuenta@example.com")).toBeNull();
    });
    expect(tables.list_invites.insert).not.toHaveBeenCalled();
  });
});
