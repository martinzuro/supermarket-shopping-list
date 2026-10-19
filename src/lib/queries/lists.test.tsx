import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "./keys";
import { useCurrentList } from "./lists";
import { makeTable, makeTestQueryClient, makeWrapper } from "./test-utils";

const USER = "00000000-0000-7000-8000-000000000001";

const read = vi.fn<() => Promise<{ data: unknown; error: unknown }>>();
const write =
  vi.fn<(row: unknown) => Promise<{ data: unknown; error: unknown }>>();
const lists = makeTable({ read, write });

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => lists.builder() }),
}));

describe("useCurrentList", () => {
  beforeEach(() => {
    read.mockReset();
    write.mockReset();
    lists.insert.mockClear();
  });

  it("creates exactly one list for a user without lists", async () => {
    // The fake table remembers what was inserted, like the real one.
    const rows: unknown[] = [];
    read.mockImplementation(async () => ({ data: [...rows], error: null }));
    write.mockImplementation(async (row) => {
      const created = {
        ...(row as object),
        created_by: USER,
        created_at: "2026-10-17T00:00:00.000Z",
        updated_at: "2026-10-17T00:00:00.000Z",
        deleted_at: null,
      };
      rows.push(created);
      return { data: created, error: null };
    });

    const { result, rerender } = renderHook(() => useCurrentList(USER), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });

    await waitFor(() => expect(result.current.list).not.toBeNull());
    expect(result.current.list?.name).toBe("Mi lista");
    expect(lists.insert).toHaveBeenCalledTimes(1);
    expect(lists.insert.mock.calls[0][0]).toMatchObject({ name: "Mi lista" });

    rerender();
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(lists.insert).toHaveBeenCalledTimes(1);
  });

  it("returns the existing list without creating one", async () => {
    read.mockResolvedValue({
      data: [{ id: "l1", name: "Casa", created_by: USER }],
      error: null,
    });
    const { result } = renderHook(() => useCurrentList(USER), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });
    await waitFor(() => expect(result.current.list?.id).toBe("l1"));
    expect(lists.insert).not.toHaveBeenCalled();
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
});
