import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newItem, useAddItem } from "./items";
import { queryKeys } from "./keys";
import { useMembershipNotice, type List } from "./lists";
import {
  noteMemberGone,
  useDiscardList,
  useLeaveList,
  useMembers,
  useRemoveMember,
  type Member,
} from "./members";
import { makeTable, makeTestQueryClient, makeWrapper } from "./test-utils";

const USER = "00000000-0000-7000-8000-000000000001";
const LIST = "00000000-0000-7000-8000-000000000002";
const MEMBER = "00000000-0000-7000-8000-000000000003";
const OWN = "00000000-0000-7000-8000-000000000004";

type Result = { data: unknown; error: unknown; status?: number };

const readMemberships =
  vi.fn<(filters: [string, unknown][]) => Promise<Result>>();
const removeMemberships =
  vi.fn<(filters: [string, unknown][]) => Promise<Result>>();
const updateLists =
  vi.fn<(changes: unknown, filters: [string, unknown][]) => Promise<Result>>();
const writeItems = vi.fn<(row: unknown) => Promise<Result>>();
const rpc = vi.fn<(name: string, args: unknown) => Promise<Result>>();
const never = () => new Promise<Result>(() => {});
const tables = {
  list_members: makeTable({
    read: readMemberships,
    write: never,
    remove: removeMemberships,
  }),
  lists: makeTable({ read: never, write: never, update: updateLists }),
  items: makeTable({ read: never, write: writeItems }),
  catalog: makeTable({ read: never, write: never }),
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: keyof typeof tables) => tables[table].builder(),
    rpc: (name: string, args: unknown) => {
      const call = rpc(name, args);
      return {
        then: (resolve: (value: Result) => unknown, reject: () => unknown) =>
          call
            .then((value) => ({ status: 200, ...value }))
            .then(resolve, reject),
      };
    },
  }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const owner: Member = {
  user_id: USER,
  role: "owner",
  joined_at: "2026-10-17T00:00:00.000Z",
  email: "yo@example.com",
};
const member: Member = {
  user_id: MEMBER,
  role: "member",
  joined_at: "2026-10-18T00:00:00.000Z",
  email: null,
};

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

const rejected = (code = "42501") => ({
  data: null,
  error: { message: "refused", code },
  status: 403,
});

beforeEach(() => {
  for (const mock of [
    readMemberships,
    removeMemberships,
    updateLists,
    writeItems,
    rpc,
  ]) {
    mock.mockReset();
  }
  for (const table of Object.values(tables)) {
    table.remove.mockClear();
    table.update.mockClear();
  }
});

describe("useMembers", () => {
  it("reads the members with their email, null for an anonymous one", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          user_id: USER,
          role: "owner",
          joined_at: owner.joined_at,
          email: "yo@example.com",
        },
        {
          user_id: MEMBER,
          role: "member",
          joined_at: member.joined_at,
          email: null,
        },
      ],
      error: null,
    });
    const { result } = renderHook(() => useMembers(USER, LIST), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });
    await waitFor(() => expect(result.current.data).toEqual([owner, member]));
    expect(rpc).toHaveBeenCalledWith("list_member_emails", {
      target_list_id: LIST,
    });
  });
});

describe("useRemoveMember", () => {
  function setup() {
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(queryKeys.members(USER, LIST), [owner, member]);
    const hook = renderHook(() => useRemoveMember(USER, LIST), {
      wrapper: makeWrapper(queryClient),
    });
    const members = () =>
      queryClient
        .getQueryData<Member[]>(queryKeys.members(USER, LIST))
        ?.map((each) => each.user_id);
    return { ...hook, queryClient, members };
  }

  it("takes the member out at once and deletes only a plain member's row", async () => {
    const answer = deferred<Result>();
    removeMemberships.mockReturnValue(answer.promise);
    const { result, members, queryClient } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    act(() => result.current.mutate({ memberId: MEMBER }));
    await waitFor(() => expect(members()).toEqual([USER]));
    await waitFor(() => expect(removeMemberships).toHaveBeenCalled());
    expect(removeMemberships.mock.calls[0][0]).toEqual([
      ["list_id", LIST],
      ["user_id", MEMBER],
      ["role", "member"],
    ]);

    await act(async () =>
      answer.resolve({ data: [{ user_id: MEMBER }], error: null }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.members(USER, LIST),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.lists(USER),
    });
  });

  it("is done when no row matched: the member was already out", async () => {
    removeMemberships.mockResolvedValue({ data: [], error: null });
    const { result, members } = setup();
    act(() => result.current.mutate({ memberId: MEMBER }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(members()).toEqual([USER]);
  });

  it("puts the member back in their place when the server refuses", async () => {
    removeMemberships.mockResolvedValue(rejected());
    const { result, members } = setup();
    act(() => result.current.mutate({ memberId: MEMBER }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(members()).toEqual([USER, MEMBER]);
  });

  it("does not put back a member an event said is gone meanwhile", async () => {
    const answer = deferred<Result>();
    removeMemberships.mockReturnValue(answer.promise);
    const { result, members, queryClient } = setup();
    act(() => result.current.mutate({ memberId: MEMBER }));
    await waitFor(() => expect(removeMemberships).toHaveBeenCalled());
    // The answer is lost, but Realtime says the row went (they left, or the
    // removal went through).
    noteMemberGone(queryClient, LIST, MEMBER);
    await act(async () =>
      answer.resolve({
        data: null,
        error: { message: "TypeError: Failed to fetch" },
        status: 0,
      }),
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(members()).toEqual([USER]);
  });
});

describe("useLeaveList", () => {
  const shared = list({ id: LIST, role: "member", member_count: 2 });
  const own = list({ id: OWN });

  function setup(lists: List[] = [shared]) {
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(queryKeys.lists(USER), lists);
    const hook = renderHook(
      () => ({
        leave: useLeaveList(USER, LIST),
        add: useAddItem(USER, LIST),
        notice: useMembershipNotice(),
      }),
      { wrapper: makeWrapper(queryClient) },
    );
    const listIds = () =>
      queryClient
        .getQueryData<List[]>(queryKeys.lists(USER))
        ?.map((each) => each.id);
    return { ...hook, queryClient, listIds };
  }

  it("takes the list out of the user's lists at once and deletes their row", async () => {
    const answer = deferred<Result>();
    removeMemberships.mockReturnValue(answer.promise);
    const { result, listIds } = setup([own, shared]);

    act(() => result.current.leave.mutate());
    await waitFor(() => expect(listIds()).toEqual([OWN]));
    await waitFor(() => expect(removeMemberships).toHaveBeenCalled());
    expect(removeMemberships.mock.calls[0][0]).toEqual([
      ["list_id", LIST],
      ["user_id", USER],
      ["role", "member"],
    ]);
    await act(async () =>
      answer.resolve({ data: [{ user_id: USER }], error: null }),
    );
    await waitFor(() => expect(result.current.leave.isSuccess).toBe(true));
    expect(listIds()).toEqual([OWN]);
    expect(readMemberships).not.toHaveBeenCalled();
  });

  it("is done when the user was taken out meanwhile", async () => {
    removeMemberships.mockResolvedValue({ data: [], error: null });
    readMemberships.mockResolvedValue({ data: [], error: null });
    const { result } = setup();
    act(() => result.current.leave.mutate());
    await waitFor(() => expect(result.current.leave.isSuccess).toBe(true));
    expect(result.current.notice.notice).toBeNull();
  });

  it("refuses an owner, and brings the list back with a notice", async () => {
    removeMemberships.mockResolvedValue({ data: [], error: null });
    readMemberships.mockResolvedValue({
      data: [{ role: "owner" }],
      error: null,
    });
    const { result, listIds } = setup();
    act(() => result.current.leave.mutate());
    await waitFor(() => expect(result.current.leave.isError).toBe(true));
    expect(listIds()).toEqual([LIST]);
    expect(result.current.notice.notice).toMatchObject({
      kind: "leave_failed",
      listId: LIST,
    });
  });

  it("brings the list back in its place when the request fails", async () => {
    removeMemberships.mockResolvedValue({
      data: null,
      error: { message: "bad gateway" },
      status: 502,
    });
    const { result, listIds } = setup([own, shared]);
    act(() => result.current.leave.mutate());
    await waitFor(() => expect(result.current.leave.isError).toBe(true));
    expect(listIds()).toEqual([OWN, LIST]);
  });

  it("waits for the item writes still pending, so they reach the others first", async () => {
    const insert = deferred<Result>();
    writeItems.mockReturnValue(insert.promise);
    removeMemberships.mockResolvedValue({
      data: [{ user_id: USER }],
      error: null,
    });
    const { result, queryClient } = setup();
    queryClient.setQueryData(queryKeys.items(USER, LIST), []);
    const input = newItem("Leche");

    act(() => {
      result.current.add.mutate(input);
      result.current.leave.mutate();
    });
    await waitFor(() => expect(writeItems).toHaveBeenCalledTimes(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(removeMemberships).not.toHaveBeenCalled();

    await act(async () =>
      insert.resolve({
        data: { id: input.id, name: "Leche", list_id: LIST },
        error: null,
      }),
    );
    await waitFor(() => expect(removeMemberships).toHaveBeenCalledTimes(1));
  });
});

describe("useDiscardList", () => {
  const shared = list({
    id: LIST,
    role: "member",
    member_count: 2,
    joined_at: "2026-10-19T00:00:00.000Z",
  });

  function setup(leftover: List) {
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(queryKeys.lists(USER), [leftover, shared]);
    queryClient.setQueryData(queryKeys.items(USER, leftover.id), []);
    const hook = renderHook(() => useDiscardList(USER, leftover), {
      wrapper: makeWrapper(queryClient),
    });
    const listIds = () =>
      queryClient
        .getQueryData<List[]>(queryKeys.lists(USER))
        ?.map((each) => each.id);
    return { ...hook, queryClient, listIds };
  }

  it("soft-deletes the user's own list, gone from the lists at once", async () => {
    updateLists.mockResolvedValue({ data: [{ id: OWN }], error: null });
    const { result, listIds, queryClient } = setup(list({ id: OWN }));
    act(() => result.current.mutate());
    await waitFor(() => expect(listIds()).toEqual([LIST]));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [changes, filters] = updateLists.mock.calls[0];
    expect(changes).toEqual({ deleted_at: expect.any(String) });
    expect(filters).toEqual([
      ["id", OWN],
      ["deleted_at", null],
    ]);
    expect(
      queryClient.getQueryData(queryKeys.items(USER, OWN)),
    ).toBeUndefined();
  });

  it("leaves a list of someone else's the user was in", async () => {
    removeMemberships.mockResolvedValue({
      data: [{ user_id: USER }],
      error: null,
    });
    const other = list({ id: OWN, role: "member", member_count: 3 });
    const { result } = setup(other);
    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(updateLists).not.toHaveBeenCalled();
    expect(removeMemberships.mock.calls[0][0]).toContainEqual([
      "user_id",
      USER,
    ]);
  });

  it("never a list of the user's own that others use", async () => {
    const { result, listIds } = setup(list({ id: OWN, member_count: 2 }));
    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(updateLists).not.toHaveBeenCalled();
    expect(listIds()).toEqual([OWN, LIST]);
  });

  it("brings the list back if the server refuses", async () => {
    updateLists.mockResolvedValue(rejected());
    const { result, listIds } = setup(list({ id: OWN }));
    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(listIds()).toEqual([OWN, LIST]);
  });
});
