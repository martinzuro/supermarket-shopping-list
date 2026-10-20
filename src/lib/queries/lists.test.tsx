import { act, renderHook, waitFor } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestError, shouldRetryMutation } from "./errors";
import { queryKeys } from "./keys";
import { useLeaveList } from "./members";
import {
  currentListOf,
  isSharedOwnList,
  leftoversOf,
  membershipMutationKeys,
  requestNoticeFocus,
  setMembershipNotice,
  readListsAfterRejection,
  useCurrentList,
  useMembershipNotice,
  type List,
} from "./lists";
import { makeTable, makeTestQueryClient, makeWrapper } from "./test-utils";

const USER = "00000000-0000-7000-8000-000000000001";
const OTHER_USER = "00000000-0000-7000-8000-000000000009";

type Answer = { data: unknown; error: unknown; status?: number };
const read = vi.fn<(filters: [string, unknown][]) => Promise<Answer>>();
const write = vi.fn<(row: unknown) => Promise<Answer>>();
const remove = vi.fn<(filters: [string, unknown][]) => Promise<Answer>>();
// One fake table for every request: the tests tell them apart by filters.
const lists = makeTable({ read, write, remove });

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => lists.builder() }),
}));

type ListRow = {
  id: string;
  name?: string;
  created_by?: string;
  created_at?: string;
};

/**
 * A row as the lists query reads it: the user's membership with its list
 * embedded, and the count of members.
 */
function membership(
  list: ListRow,
  {
    role = "owner",
    joined_at = "2026-10-17T00:00:00.000Z",
    members = 1,
  }: { role?: string; joined_at?: string; members?: number } = {},
) {
  return {
    role,
    joined_at,
    list: {
      name: "Mi lista",
      created_by: USER,
      created_at: joined_at,
      updated_at: joined_at,
      deleted_at: null,
      ...list,
      members: [{ count: members }],
    },
  };
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

beforeEach(() => {
  read.mockReset();
  write.mockReset();
  remove.mockReset();
  lists.insert.mockClear();
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("currentListOf", () => {
  it("is the list the user joined last", () => {
    const own = list({ id: "own", joined_at: "2026-10-17T00:00:00.000Z" });
    const shared = list({
      id: "shared",
      role: "member",
      member_count: 2,
      joined_at: "2026-10-19T00:00:00.000Z",
    });
    expect(currentListOf([own, shared])).toBe(shared);
    expect(currentListOf([shared, own])).toBe(shared);
    expect(currentListOf([])).toBeNull();
    expect(currentListOf(undefined)).toBeNull();
  });

  it("breaks a tie by id, which grows with time (UUID v7)", () => {
    const at = "2026-10-19T00:00:00.000Z";
    const a = list({ id: "0190-a", joined_at: at });
    const b = list({ id: "0190-b", joined_at: at });
    expect(currentListOf([b, a])).toBe(b);
  });
});

describe("leftoversOf", () => {
  const current = list({
    id: "shared",
    role: "member",
    member_count: 2,
    joined_at: "2026-10-19T00:00:00.000Z",
  });

  it("offers the user's own list nobody else is in, and lists of others", () => {
    const own = list({ id: "own" });
    const other = list({ id: "other", role: "member", member_count: 3 });
    expect(leftoversOf([own, other, current], current)).toEqual([own, other]);
  });

  it("never a list of their own that others still use", () => {
    const sharedOwn = list({ id: "mine", member_count: 2 });
    expect(leftoversOf([sharedOwn, current], current)).toEqual([]);
  });

  it("nothing without a current list", () => {
    expect(leftoversOf([current], null)).toEqual([]);
  });
});

describe("isSharedOwnList", () => {
  it("is a list of their own that others are in", () => {
    expect(isSharedOwnList(list({ id: "mine", member_count: 2 }))).toBe(true);
  });

  it("not a list of their own nobody else is in", () => {
    expect(isSharedOwnList(list({ id: "mine" }))).toBe(false);
  });

  it("not a list of others, however many are in it", () => {
    expect(
      isSharedOwnList(list({ id: "theirs", role: "member", member_count: 4 })),
    ).toBe(false);
  });

  it("not when there is no list", () => {
    expect(isSharedOwnList(null)).toBe(false);
  });
});

describe("useCurrentList", () => {
  it("creates exactly one list for a user without lists", async () => {
    // The fake table remembers what was inserted, like the real one.
    const rows: ReturnType<typeof membership>[] = [];
    read.mockImplementation(async () => ({ data: [...rows], error: null }));
    write.mockImplementation(async (row) => {
      const created = {
        ...(row as { id: string; name: string }),
        created_by: USER,
        created_at: "2026-10-17T00:00:00.000Z",
        updated_at: "2026-10-17T00:00:00.000Z",
        deleted_at: null,
      };
      rows.push(membership(created));
      return { data: created, error: null };
    });

    const { result, rerender } = renderHook(() => useCurrentList(USER), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });

    await waitFor(() => expect(result.current.list).not.toBeNull());
    expect(result.current.list?.name).toBe("Mi lista");
    expect(result.current.list).toMatchObject({
      role: "owner",
      member_count: 1,
    });
    expect(lists.insert).toHaveBeenCalledTimes(1);
    expect(lists.insert.mock.calls[0][0]).toMatchObject({ name: "Mi lista" });

    rerender();
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(lists.insert).toHaveBeenCalledTimes(1);
  });

  it("returns the existing list without creating one", async () => {
    read.mockResolvedValue({
      data: [membership({ id: "l1", name: "Casa" })],
      error: null,
    });
    const { result } = renderHook(() => useCurrentList(USER), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });
    await waitFor(() => expect(result.current.list?.id).toBe("l1"));
    expect(result.current.list).toMatchObject({
      name: "Casa",
      role: "owner",
      joined_at: "2026-10-17T00:00:00.000Z",
      member_count: 1,
    });
    expect(lists.insert).not.toHaveBeenCalled();
  });

  it("shows the shared list the user joined last", async () => {
    read.mockResolvedValue({
      data: [
        membership({ id: "own" }),
        membership(
          { id: "shared", created_by: OTHER_USER },
          { role: "member", joined_at: "2026-10-19T00:00:00.000Z", members: 2 },
        ),
      ],
      error: null,
    });
    const { result } = renderHook(() => useCurrentList(USER), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });
    await waitFor(() => expect(result.current.list?.id).toBe("shared"));
    expect(result.current.list).toMatchObject({
      role: "member",
      member_count: 2,
    });
  });

  it("does nothing without a user", () => {
    const { result } = renderHook(() => useCurrentList(null), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });
    expect(result.current.list).toBeNull();
    expect(lists.insert).not.toHaveBeenCalled();
  });

  it("starts the new list's queries over once the server has it", async () => {
    // Before the insert commits, the list's categories come back empty (RLS:
    // not a member yet). They must not stay cached as the real answer.
    read.mockResolvedValue({ data: [], error: null });
    let commit!: () => void;
    write.mockImplementation(
      (row) =>
        new Promise((resolve) => {
          commit = () =>
            resolve({
              data: { ...(row as object), created_by: USER, deleted_at: null },
              error: null,
            });
        }),
    );
    const queryClient = makeTestQueryClient();
    renderHook(() => useCurrentList(USER), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(lists.insert).toHaveBeenCalledTimes(1));
    const { id } = lists.insert.mock.calls[0][0] as { id: string };
    queryClient.setQueryData(queryKeys.categories(USER, id), []);

    await act(async () => commit());
    await waitFor(() =>
      expect(
        queryClient.getQueryData(queryKeys.categories(USER, id)),
      ).toBeUndefined(),
    );
  });

  it("retries a failed first creation on demand", async () => {
    read.mockResolvedValue({ data: [], error: null });
    write
      .mockResolvedValueOnce({
        data: null,
        error: { message: "bad gateway", code: "" },
        status: 502,
      } as never)
      .mockImplementationOnce(async (row) => ({
        data: { ...(row as object), created_by: USER, deleted_at: null },
        error: null,
      }));
    const queryClient = makeTestQueryClient();
    const { result } = renderHook(
      () => ({ current: useCurrentList(USER), notice: useMembershipNotice() }),
      { wrapper: makeWrapper(queryClient) },
    );
    await waitFor(() => expect(result.current.current.error).not.toBeNull());
    expect(result.current.current.list).toBeNull();
    // The optimistic list came and went: it was never lost.
    expect(result.current.notice.notice).toBeNull();
    expect(lists.insert).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.current.retry();
    });
    await waitFor(() => expect(lists.insert).toHaveBeenCalledTimes(2));
  });

  it("retries the first creation when the answer is lost", async () => {
    read.mockResolvedValue({ data: [], error: null });
    write
      .mockResolvedValueOnce({
        data: null,
        error: { message: "TypeError: Failed to fetch", code: "" },
        status: 0,
      } as never)
      .mockImplementationOnce(async (row) => ({
        data: { ...(row as object), created_by: USER, deleted_at: null },
        error: null,
      }));
    const queryClient = makeTestQueryClient();
    queryClient.setDefaultOptions({
      ...queryClient.getDefaultOptions(),
      mutations: { retry: shouldRetryMutation, retryDelay: 0 },
    });
    const { result } = renderHook(() => useCurrentList(USER), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(lists.insert).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it("recovers a creation whose retry finds it already saved", async () => {
    let saved: { id: string } | null = null;
    let answerRetry!: () => void;
    // The fake table cannot tell `.single()` apart: right after the
    // duplicate key comes the read by id (one row), then list queries.
    let readById = false;
    read.mockImplementation(async () => {
      if (readById) {
        readById = false;
        return { data: saved, error: null };
      }
      return { data: saved ? [membership(saved)] : [], error: null };
    });
    write
      .mockImplementationOnce(async (row) => {
        // Saved on the server, but the answer is lost.
        saved = {
          ...(row as { id: string }),
          created_by: USER,
          deleted_at: null,
        } as { id: string };
        return {
          data: null,
          error: { message: "TypeError: Failed to fetch", code: "" },
          status: 0,
        } as never;
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answerRetry = () => {
              readById = true;
              resolve({
                data: null,
                error: { message: "duplicate key value", code: "23505" },
                status: 409,
              } as never);
            };
          }),
      );
    const queryClient = makeTestQueryClient();
    queryClient.setDefaultOptions({
      ...queryClient.getDefaultOptions(),
      mutations: { retry: shouldRetryMutation, retryDelay: 0 },
    });
    const { result } = renderHook(() => useCurrentList(USER), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(lists.insert).toHaveBeenCalledTimes(2));
    const { id } = lists.insert.mock.calls[0][0] as { id: string };
    // Cached while the insert was in flight; the recovered creation resets it.
    queryClient.setQueryData(queryKeys.categories(USER, id), []);
    await act(async () => answerRetry());

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.list?.id).toBe(id);
    await waitFor(() =>
      expect(
        queryClient.getQueryData(queryKeys.categories(USER, id)),
      ).toBeUndefined(),
    );
  });
});

describe("losing the list on screen", () => {
  function useScreen() {
    return {
      current: useCurrentList(USER),
      notice: useMembershipNotice(),
      queryClient: useQueryClient(),
    };
  }

  /** The user is in a shared list only (their own was merged away). */
  async function renderShared() {
    let rows: unknown[] = [
      membership(
        { id: "shared", created_by: OTHER_USER },
        { role: "member", members: 2 },
      ),
    ];
    read.mockImplementation(async () => ({ data: rows, error: null }));
    // The server remembers a list created meanwhile.
    write.mockImplementation(async (row) => {
      const created = {
        ...(row as { id: string }),
        created_by: USER,
        deleted_at: null,
      };
      rows = [
        ...rows,
        membership(created, { joined_at: "2026-10-20T00:00:00.000Z" }),
      ];
      return { data: created, error: null };
    });
    const queryClient = makeTestQueryClient();
    const hook = renderHook(useScreen, { wrapper: makeWrapper(queryClient) });
    await waitFor(() =>
      expect(hook.result.current.current.list?.id).toBe("shared"),
    );
    queryClient.setQueryData(queryKeys.items(USER, "shared"), []);
    return {
      ...hook,
      queryClient,
      setServer: (next: unknown[]) => {
        rows = next;
      },
    };
  }

  it("tells the user, forgets the list, and gives them a list of their own", async () => {
    const { result, queryClient, setServer } = await renderShared();
    setServer([]);
    await act(() =>
      queryClient.invalidateQueries({ queryKey: queryKeys.lists(USER) }),
    );

    await waitFor(() =>
      expect(result.current.notice.notice).toMatchObject({
        kind: "removed",
        listId: "shared",
      }),
    );
    expect(
      queryClient.getQueryData(queryKeys.items(USER, "shared")),
    ).toBeUndefined();
    await waitFor(() => expect(lists.insert).toHaveBeenCalledTimes(1));
    const { id } = lists.insert.mock.calls[0][0] as { id: string };
    await waitFor(() => expect(result.current.current.list?.id).toBe(id));
    // A list of their own, not the one they lost: nothing more to tell.
    await waitFor(() => expect(result.current.current.isPending).toBe(false));
    expect(lists.insert).toHaveBeenCalledTimes(1);

    act(() => result.current.notice.dismiss());
    expect(result.current.notice.notice).toBeNull();
  });

  it("says the user left when it was them, and waits to create a list", async () => {
    const { result, queryClient } = await renderShared();
    // A leave in flight, as useLeaveList leaves it: the list out of the
    // cache and the mutation pending.
    let finish!: () => void;
    act(() => {
      void queryClient
        .getMutationCache()
        .build(queryClient, {
          mutationKey: membershipMutationKeys.leave(USER, "shared"),
          mutationFn: () =>
            new Promise<void>((resolve) => {
              finish = resolve;
            }),
        })
        .execute(undefined);
      queryClient.setQueryData<List[]>(queryKeys.lists(USER), []);
    });

    await waitFor(() =>
      expect(result.current.notice.notice).toMatchObject({ kind: "left" }),
    );
    // While leaving, no new list: a rollback would bring the old one back.
    expect(lists.insert).not.toHaveBeenCalled();

    await act(async () => finish());
    await waitFor(() => expect(lists.insert).toHaveBeenCalledTimes(1));
  });

  it("tells a list lost while the app was closed", async () => {
    window.localStorage.setItem(`lista:last-list:${USER}`, "gone");
    read.mockResolvedValue({ data: [membership({ id: "own" })], error: null });
    const { result } = renderHook(useScreen, {
      wrapper: makeWrapper(makeTestQueryClient()),
    });
    await waitFor(() =>
      expect(result.current.notice.notice).toMatchObject({
        kind: "removed",
        listId: "gone",
      }),
    );
    expect(window.localStorage.getItem(`lista:last-list:${USER}`)).toBe("own");
  });

  it("does not take the lists of another user for a loss", async () => {
    window.localStorage.setItem(`lista:last-list:${OTHER_USER}`, "theirs");
    read.mockResolvedValue({ data: [membership({ id: "own" })], error: null });
    const { result } = renderHook(useScreen, {
      wrapper: makeWrapper(makeTestQueryClient()),
    });
    await waitFor(() => expect(result.current.current.list?.id).toBe("own"));
    expect(result.current.notice.notice).toBeNull();
  });

  it("stays quiet when a list that was not on screen goes", async () => {
    const own = membership({ id: "own" });
    const shared = membership(
      { id: "shared", created_by: OTHER_USER },
      { role: "member", joined_at: "2026-10-19T00:00:00.000Z", members: 2 },
    );
    let rows: unknown[] = [own, shared];
    read.mockImplementation(async () => ({ data: rows, error: null }));
    const queryClient = makeTestQueryClient();
    const { result } = renderHook(useScreen, {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.current.list?.id).toBe("shared"));
    rows = [shared];
    await act(() =>
      queryClient.invalidateQueries({ queryKey: queryKeys.lists(USER) }),
    );
    expect(result.current.notice.notice).toBeNull();
    expect(result.current.current.list?.id).toBe("shared");
  });
});

describe("a first creation that does not go through", () => {
  const later = <T,>(value: T, ms: number) =>
    new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

  it("is never told as a lost list, now or on the next open", async () => {
    // Real timing: React renders the optimistic list before the refusal and
    // the refetch of onSettled come back.
    read.mockImplementation(() => later({ data: [], error: null }, 20));
    write.mockImplementation(() =>
      later(
        {
          data: null,
          error: { message: "row-level security", code: "42501" },
          status: 403,
        },
        30,
      ),
    );
    const stored: string[] = [];
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (this: Storage, key, value) {
        if (key.startsWith("lista:last-list:")) stored.push(value);
      });
    const notices: unknown[] = [];
    const { result } = renderHook(
      () => {
        const current = useCurrentList(USER);
        const { notice } = useMembershipNotice();
        if (notice) notices.push(notice);
        return current;
      },
      { wrapper: makeWrapper(makeTestQueryClient()) },
    );
    await waitFor(() => expect(lists.insert).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.list).not.toBeNull());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));

    expect(result.current.list).toBeNull();
    expect(notices).toEqual([]);
    expect(stored).toEqual([]);
    expect(lists.insert).toHaveBeenCalledTimes(1);
    setItem.mockRestore();
  });
});

describe("leaving with the list screen on", () => {
  const isListsRead = (filters: [string, unknown][]) =>
    filters.some(([column]) => column === "list.deleted_at");

  it("tells it left, then that it failed, and creates no list in between", async () => {
    const sharedRow = membership(
      { id: "shared", created_by: OTHER_USER },
      { role: "member", members: 2 },
    );
    read.mockImplementation(async (filters) =>
      isListsRead(filters)
        ? { data: [sharedRow], error: null }
        : // The check after a delete that matched nothing: still in it.
          { data: [{ role: "owner" }], error: null },
    );
    let refuse!: () => void;
    remove.mockImplementation(
      () =>
        new Promise((resolve) => {
          refuse = () => resolve({ data: [], error: null });
        }),
    );
    const notices: string[] = [];
    const { result } = renderHook(
      () => {
        const current = useCurrentList(USER);
        const { notice } = useMembershipNotice();
        if (notice && notices.at(-1) !== notice.kind) notices.push(notice.kind);
        return { current, leave: useLeaveList(USER, "shared") };
      },
      { wrapper: makeWrapper(makeTestQueryClient()) },
    );
    await waitFor(() => expect(result.current.current.list?.id).toBe("shared"));

    act(() => result.current.leave.mutate());
    await waitFor(() => expect(result.current.current.list).toBeNull());
    await waitFor(() => expect(remove).toHaveBeenCalled());
    expect(notices).toEqual(["left"]);
    expect(lists.insert).not.toHaveBeenCalled();

    await act(async () => refuse());
    await waitFor(() => expect(result.current.leave.isError).toBe(true));
    await waitFor(() => expect(result.current.current.list?.id).toBe("shared"));
    expect(notices).toEqual(["left", "leave_failed"]);
    expect(lists.insert).not.toHaveBeenCalled();
  });
});

describe("asking the focus to go to the notice", () => {
  function setup() {
    const queryClient = makeTestQueryClient();
    const hook = renderHook(() => useMembershipNotice(), {
      wrapper: makeWrapper(queryClient),
    });
    return { queryClient, hook };
  }

  it("is told once, and only to a request that was made", () => {
    const { queryClient, hook } = setup();
    expect(hook.result.current.focusRequested).toBe(false);
    expect(hook.result.current.takeFocusRequest()).toBe(false);

    act(() => requestNoticeFocus(queryClient));
    expect(hook.result.current.focusRequested).toBe(true);
    let first = false;
    act(() => {
      first = hook.result.current.takeFocusRequest();
    });
    expect(first).toBe(true);
    expect(hook.result.current.focusRequested).toBe(false);
    expect(hook.result.current.takeFocusRequest()).toBe(false);
  });

  it("holds for a notice that comes a moment later", () => {
    const { queryClient, hook } = setup();
    act(() => requestNoticeFocus(queryClient));
    act(() => setMembershipNotice(queryClient, { kind: "left", listId: "l1" }));
    expect(hook.result.current.notice?.kind).toBe("left");
    expect(hook.result.current.focusRequested).toBe(true);
  });

  it("lapses when no notice comes for a long time", () => {
    vi.useFakeTimers();
    try {
      const { queryClient, hook } = setup();
      act(() => requestNoticeFocus(queryClient));
      vi.advanceTimersByTime(16_000);
      let taken = true;
      act(() => {
        taken = hook.result.current.takeFocusRequest();
      });
      expect(taken).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("readListsAfterRejection", () => {
  it("reads the user's lists again after a refusal that may mean lost access", () => {
    const queryClient = makeTestQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const key = [...queryKeys.items(USER, "l1"), "add"];

    readListsAfterRejection(
      queryClient,
      key,
      new RequestError({ message: "row-level security", code: "42501" }, 403),
    );
    readListsAfterRejection(
      queryClient,
      key,
      new RequestError({ message: "no rows", code: "PGRST116" }, 406),
    );
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.lists(USER),
    });

    invalidate.mockClear();
    readListsAfterRejection(
      queryClient,
      key,
      new RequestError({ message: "bad gateway" }, 502),
    );
    readListsAfterRejection(
      queryClient,
      key,
      new RequestError({ message: "check", code: "23514" }, 400),
    );
    readListsAfterRejection(
      queryClient,
      ["other"],
      new RequestError({ message: "x", code: "42501" }, 403),
    );
    expect(invalidate).not.toHaveBeenCalled();
  });
});
