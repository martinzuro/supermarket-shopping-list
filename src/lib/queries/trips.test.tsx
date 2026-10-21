import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "./items";
import { makeTable, makeTestQueryClient, makeWrapper } from "./test-utils";
import { TRIP_LIMIT, useTrips, type Trip } from "./trips";

const USER = "00000000-0000-7000-8000-000000000001";
const LIST = "00000000-0000-7000-8000-000000000002";

type Result = { data: unknown; error: unknown; status?: number };

const read = vi.fn<(filters: [string, unknown][]) => Promise<Result>>();
const write = vi.fn<(row: unknown) => Promise<Result>>();
const trips = makeTable({ read, write });
/** The builders handed out, to see how each read was made. */
let built: Record<string, ReturnType<typeof vi.fn>>[] = [];
const from = vi.fn((table: string) => {
  void table;
  const builder = trips.builder() as unknown as Record<
    string,
    ReturnType<typeof vi.fn>
  >;
  built.push(builder);
  return builder;
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from }),
}));

function trip(n: number, items: Partial<Item>[] = []): Trip {
  return {
    id: `trip-${n}`,
    emptied_at: `2026-10-${String(21 - n).padStart(2, "0")}T18:00:00+00:00`,
    items: items as Item[],
  };
}

/** Answers like the network: on a timer, slower than waitFor polls. */
function later(result: Result, ms = 100) {
  return new Promise<Result>((resolve) =>
    setTimeout(() => resolve(result), ms),
  );
}

beforeEach(() => {
  read.mockReset();
  from.mockClear();
  built = [];
});

describe("useTrips", () => {
  it("reads the list's live trips, newest first, with the rows they took", async () => {
    const rows = [trip(0, [{ id: "milk", name: "Leche" }]), trip(1)];
    read.mockImplementation(() => later({ data: rows, error: null }));

    const { result } = renderHook(() => useTrips(USER, LIST), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ trips: rows, more: false });
    expect(from).toHaveBeenCalledWith("trips");
    expect(read).toHaveBeenCalledWith([
      ["list_id", LIST],
      // Undone emptyings are not trips.
      ["deleted_at", null],
    ]);
    // The rows by the trip's key, and only trips that still have some.
    expect(built[0].select).toHaveBeenCalledWith(
      "id, emptied_at, items!items_trip_id_fkey!inner(*)",
    );
    expect(built[0].order).toHaveBeenCalledWith("emptied_at", {
      ascending: false,
    });
  });

  it(`shows the last ${TRIP_LIMIT}, and says when there are older ones`, async () => {
    const rows = Array.from({ length: TRIP_LIMIT + 1 }, (_, n) => trip(n));
    read.mockImplementation(() => later({ data: rows, error: null }));

    const { result } = renderHook(() => useTrips(USER, LIST), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // One more than shown: that one says there are older ones.
    expect(built[0].limit).toHaveBeenCalledWith(TRIP_LIMIT + 1);
    expect(result.current.data?.trips).toEqual(rows.slice(0, TRIP_LIMIT));
    expect(result.current.data?.more).toBe(true);
  });

  it("reads again each time the history is shown", async () => {
    read.mockImplementation(() => later({ data: [trip(0)], error: null }));
    const queryClient = makeTestQueryClient();
    const wrapper = makeWrapper(queryClient);

    const first = renderHook(() => useTrips(USER, LIST), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();
    expect(read).toHaveBeenCalledTimes(1);

    // Another member emptied the cart meanwhile: trips are not in Realtime.
    read.mockImplementation(() =>
      later({ data: [trip(0), trip(1)], error: null }),
    );
    const second = renderHook(() => useTrips(USER, LIST), { wrapper });
    // What was read before shows at once, while it is read again.
    expect(second.result.current.data?.trips).toHaveLength(1);
    await waitFor(() =>
      expect(second.result.current.data?.trips).toHaveLength(2),
    );
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("waits for a user and a list", async () => {
    read.mockImplementation(() => later({ data: [], error: null }));
    const { result } = renderHook(() => useTrips(USER, null), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current.fetchStatus).toBe("idle");
    expect(from).not.toHaveBeenCalled();
  });
});
