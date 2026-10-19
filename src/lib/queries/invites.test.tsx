import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sharingErrorOf } from "./errors";
import {
  inviteUrl,
  useAcceptInvite,
  useCreateInvite,
  useInvitePreview,
} from "./invites";
import { useLists } from "./lists";
import {
  makeRpc,
  makeTable,
  makeTestQueryClient,
  makeWrapper,
} from "./test-utils";

const USER = "00000000-0000-7000-8000-000000000001";
const LIST = "00000000-0000-7000-8000-000000000002";
const TOKEN = "a".repeat(48);

type Result = { data: unknown; error: unknown; status?: number };

const writeInvites = vi.fn<(row: unknown) => Promise<Result>>();
const readMemberships = vi.fn<() => Promise<Result>>();
const callRpc = vi.fn<(name: string, args: unknown) => Promise<Result>>();
const never = () => new Promise<Result>(() => {});
const tables = {
  list_invites: makeTable({ read: never, write: writeInvites }),
  list_members: makeTable({ read: readMemberships, write: never }),
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: keyof typeof tables) => tables[table].builder(),
    rpc: makeRpc((name, args) => callRpc(name, args)),
  }),
}));

beforeEach(() => {
  writeInvites.mockReset();
  readMemberships.mockReset();
  callRpc.mockReset();
  tables.list_invites.insert.mockClear();
});

describe("useCreateInvite", () => {
  it("creates a share invite for the list and hands back its link", async () => {
    writeInvites.mockResolvedValue({
      data: { token: TOKEN, expires_at: "2026-10-26T00:00:00.000Z" },
      error: null,
    });
    const { result } = renderHook(() => useCreateInvite(USER, LIST), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });
    let invite: unknown;
    await act(async () => {
      invite = await result.current.mutateAsync();
    });
    expect(tables.list_invites.insert).toHaveBeenCalledWith({ list_id: LIST });
    expect(invite).toEqual({
      token: TOKEN,
      url: `${window.location.origin}/invite/${TOKEN}`,
      expiresAt: "2026-10-26T00:00:00.000Z",
    });
  });

  it("builds links on the given origin", () => {
    expect(inviteUrl("abc", "https://lista.example")).toBe(
      "https://lista.example/invite/abc",
    );
  });
});

describe("useInvitePreview", () => {
  async function preview(row: unknown) {
    callRpc.mockResolvedValue({ data: row, error: null });
    const { result } = renderHook(() => useInvitePreview(USER, TOKEN), {
      wrapper: makeWrapper(makeTestQueryClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(callRpc).toHaveBeenCalledWith("invite_preview", {
      invite_token: TOKEN,
    });
    return result.current.data;
  }

  it("says who invites to a link that works", async () => {
    expect(
      await preview({
        status: "valid",
        list_id: null,
        inviter_email: "ana@example.com",
      }),
    ).toEqual({
      status: "valid",
      listId: null,
      inviterEmail: "ana@example.com",
    });
  });

  it("gives the list when the user is in it already, the owner's own link included", async () => {
    expect(
      await preview({ status: "member", list_id: LIST, inviter_email: null }),
    ).toEqual({ status: "member", listId: LIST, inviterEmail: null });
  });

  it.each(["invite_not_found", "invite_already_used", "invite_expired"])(
    "passes on %s",
    async (status) => {
      expect(
        await preview({ status, list_id: null, inviter_email: null }),
      ).toMatchObject({ status, listId: null, inviterEmail: null });
    },
  );

  it("takes a state it does not know for a link that does not work", async () => {
    expect(
      await preview({ status: "whatever", list_id: null, inviter_email: null }),
    ).toMatchObject({ status: "invite_not_found" });
  });
});

describe("useAcceptInvite", () => {
  /**
   * The lists as the list screen left them: read once, no longer observed
   * (the invite screen is on instead).
   */
  async function setup() {
    const queryClient = makeTestQueryClient();
    readMemberships.mockResolvedValue({ data: [], error: null });
    const screen = renderHook(() => useLists(USER), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(screen.result.current.isSuccess).toBe(true));
    screen.unmount();
    readMemberships.mockClear();
    const hook = renderHook(() => useAcceptInvite(USER), {
      wrapper: makeWrapper(queryClient),
    });
    return { ...hook, queryClient };
  }

  it("joins and settles once the lists are read again", async () => {
    callRpc.mockResolvedValue({ data: LIST, error: null });
    const { result } = await setup();
    let joined: unknown;
    await act(async () => {
      joined = await result.current.mutateAsync(TOKEN);
    });
    expect(joined).toBe(LIST);
    expect(callRpc).toHaveBeenCalledWith("accept_invite", {
      invite_token: TOKEN,
    });
    // Read again even with no screen observing them.
    expect(readMemberships).toHaveBeenCalledTimes(1);
  });

  it("answers the same list when accepting twice or opening one's own link", async () => {
    callRpc.mockResolvedValue({ data: LIST, error: null });
    const { result } = await setup();
    await act(async () => {
      expect(await result.current.mutateAsync(TOKEN)).toBe(LIST);
      expect(await result.current.mutateAsync(TOKEN)).toBe(LIST);
    });
  });

  it.each([
    ["invite_not_found", 400, "P0001", "invite_not_found"],
    ["invite_already_used", 400, "P0001", "invite_already_used"],
    ["invite_expired", 400, "P0001", "invite_expired"],
    ["not_authenticated", 401, "42501", "not_authenticated"],
    [
      "permission denied for function accept_invite",
      401,
      "42501",
      "not_authenticated",
    ],
    ["TypeError: Failed to fetch", 0, "", "network"],
    ["something else", 400, "XX000", "unknown"],
  ])("tells %s apart (%s)", async (message, status, code, kind) => {
    callRpc.mockResolvedValue({ data: null, error: { message, code }, status });
    const { result } = await setup();
    act(() => result.current.mutate(TOKEN));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(sharingErrorOf(result.current.error)).toBe(kind);
    expect(readMemberships).not.toHaveBeenCalled();
  });
});
