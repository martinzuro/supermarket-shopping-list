"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { newId } from "@/lib/domain";
import { createClient } from "@/lib/supabase/client";
import { sharingErrorOf, unwrap, writeSignal } from "./errors";
import {
  itemMutationKeys,
  listScope,
  receiveOwnRows,
  settle,
  useItems,
  type Item,
} from "./items";
import { queryKeys } from "./keys";
import {
  currentListOf,
  leftoversOf,
  putListBack,
  takeListOut,
  useLists,
  type List,
} from "./lists";
import { useDiscardList } from "./members";

/**
 * Bringing another list's items into the current one (migration sharing):
 *
 * - merge_list, for a list left behind when the user joined a shared one
 *   (leftoversOf): copied, then retired for the user.
 * - claim_carry_over, for the anonymous list a device had before the user
 *   signed in there to an existing account: copied with the token the
 *   anonymous owner left, without joining it.
 *
 * Both run in the target list's queue of item writes and pass ids generated
 * on the client, one per source item (ADR 0003): while the write is pending
 * those ids count as written by us, so the Realtime echo of each copy is
 * ignored (applyRemoteItem), and once the answer is in they are our own
 * versions. They are not optimistic: what comes over depends on rows the
 * client may not see (the anonymous list) and on the server's dedupe. The
 * copies enter when the answer does, in the server's order.
 */

/**
 * Spare ids beyond the items the client counted: the source may have grown
 * since (another device of an owner, a carry-over counted before the
 * sign-in). A copy with a server id is not covered while the write is
 * pending, and its echo would pulse. Unused ids cost nothing.
 */
const SPARE_IDS = 20;

/** Ids for the copies of `count` source items, and some to spare. */
export function idsFor(count: number): string[] {
  return Array.from({ length: Math.max(0, count) + SPARE_IDS }, () => newId());
}

export type MergeList = {
  sourceListId: string;
  /** From idsFor, generated once so a retry sends the same ones. */
  ids: readonly string[];
};

/**
 * Merges a list left behind into the current one. The leftover leaves the
 * user's lists at once, and comes back if the server refuses. A source
 * already gone (a retry whose first answer was lost, with nothing to copy,
 * or a discard from elsewhere) is the end state wanted: not an error.
 */
export function useMergeList(userId: string, targetListId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.items(userId, targetListId);
  return useMutation({
    mutationKey: itemMutationKeys.merge(userId, targetListId),
    scope: listScope(targetListId),
    mutationFn: async ({ sourceListId, ids }: MergeList): Promise<Item[]> => {
      try {
        return unwrap(
          await createClient()
            .rpc("merge_list", {
              source_list_id: sourceListId,
              target_list_id: targetListId,
              new_ids: [...ids],
            })
            .abortSignal(writeSignal()),
        );
      } catch (error) {
        if (sharingErrorOf(error) === "source_not_found") return [];
        throw error;
      }
    },
    onMutate: async ({ sourceListId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.lists(userId) });
      return { taken: takeListOut(queryClient, userId, sourceListId) };
    },
    onError: (_error, _variables, context) => {
      putListBack(queryClient, userId, context?.taken);
    },
    onSuccess: (rows, { sourceListId }) => {
      receiveOwnRows(queryClient, userId, targetListId, rows);
      queryClient.removeQueries({
        queryKey: queryKeys.list(userId, sourceListId),
      });
    },
    onSettled: () =>
      Promise.all([
        settle(queryClient, key),
        queryClient.invalidateQueries({ queryKey: queryKeys.lists(userId) }),
      ]),
  });
}

/**
 * What the device keeps between the anonymous user and the account they
 * sign in to: the carry-over token, how many items the list had and which
 * account it is for. Never the items (ADR 0003: no local copy of the data).
 */
export type CarryOver = {
  token: string;
  listId: string;
  /** The anonymous user who left it: never offered to them. */
  fromUserId: string;
  /**
   * The email of the account it was left for (trimmed, lowercase): only
   * that account is offered it, not someone else signing in on a shared
   * device meanwhile.
   */
  forEmail: string;
  count: number;
  expiresAt: string;
};

const CARRY_OVER_KEY = "lista:carry-over";
/** The code or link of the sign-in lasts an hour; this leaves room. */
const CARRY_OVER_MS = 24 * 60 * 60 * 1000;

const carryOverListeners = new Set<() => void>();
let carryOverSnapshot: { raw: string | null; note: CarryOver | null } = {
  raw: null,
  note: null,
};

function isCarryOver(value: unknown): value is CarryOver {
  const note = value as Partial<CarryOver> | null;
  return (
    typeof note === "object" &&
    note !== null &&
    typeof note.token === "string" &&
    typeof note.listId === "string" &&
    typeof note.fromUserId === "string" &&
    typeof note.forEmail === "string" &&
    typeof note.count === "number" &&
    typeof note.expiresAt === "string"
  );
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(CARRY_OVER_KEY);
  } catch {
    return null;
  }
}

/** The note on this device, if any and still valid. */
export function readCarryOver(now = Date.now()): CarryOver | null {
  const raw = readRaw();
  if (raw === carryOverSnapshot.raw) {
    const note = carryOverSnapshot.note;
    return note && Date.parse(note.expiresAt) > now ? note : null;
  }
  let note: CarryOver | null = null;
  try {
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    note = isCarryOver(parsed) ? parsed : null;
  } catch {
    note = null;
  }
  carryOverSnapshot = { raw, note };
  return note && Date.parse(note.expiresAt) > now ? note : null;
}

function notifyCarryOver() {
  carryOverListeners.forEach((listener) => listener());
}

export function clearCarryOver() {
  try {
    window.localStorage.removeItem(CARRY_OVER_KEY);
  } catch {
    // Nothing kept, nothing to clear.
  }
  notifyCarryOver();
}

function saveCarryOver(note: CarryOver) {
  try {
    window.localStorage.setItem(CARRY_OVER_KEY, JSON.stringify(note));
  } catch {
    // Without storage the items stay behind, as if discarded.
  }
  notifyCarryOver();
}

/**
 * Before an anonymous user signs in to an existing account (the session is
 * about to become another user's): if their list is theirs alone and has
 * items, leave a carry-over token for the account of `forEmail`. Best
 * effort: a failure leaves the items behind and never blocks the sign-in.
 * Call it while the session is still the anonymous one.
 */
export async function prepareCarryOver(
  userId: string,
  list: Pick<List, "id" | "role" | "member_count">,
  itemCount: number,
  forEmail: string,
): Promise<CarryOver | null> {
  if (list.role !== "owner" || list.member_count > 1 || itemCount === 0) {
    clearCarryOver();
    return null;
  }
  try {
    const invite = unwrap<{ token: string; expires_at: string }>(
      await createClient()
        .from("list_invites")
        .insert({
          list_id: list.id,
          purpose: "carry_over",
          expires_at: new Date(Date.now() + CARRY_OVER_MS).toISOString(),
        })
        .select("token, expires_at")
        .abortSignal(writeSignal())
        .single(),
    );
    const note: CarryOver = {
      token: invite.token,
      listId: list.id,
      fromUserId: userId,
      forEmail: normalizeEmail(forEmail),
      count: itemCount,
      expiresAt: invite.expires_at,
    };
    saveCarryOver(note);
    return note;
  } catch {
    return null;
  }
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** The parts of the session user a carry-over is matched against. */
type SessionUser = {
  id: string;
  is_anonymous?: boolean;
  email?: string | null;
};

/**
 * Whether the note is for this session: the account it was left for, which
 * is not its anonymous author.
 */
export function carryOverFor(
  note: CarryOver | null,
  user: SessionUser | null,
): CarryOver | null {
  if (!note || !user || user.is_anonymous || user.id === note.fromUserId) {
    return null;
  }
  if (!user.email || normalizeEmail(user.email) !== note.forEmail) return null;
  return note;
}

function subscribeToCarryOver(listener: () => void) {
  carryOverListeners.add(listener);
  // Another tab of the same device may write or clear it.
  window.addEventListener("storage", listener);
  return () => {
    carryOverListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * The carry-over waiting for this session, if any: offer to bring those
 * items or to leave them (clearCarryOver).
 */
export function useCarryOver(user: SessionUser | null): CarryOver | null {
  const note = useSyncExternalStore(
    subscribeToCarryOver,
    useCallback(() => readCarryOver(), []),
    () => null,
  );
  return carryOverFor(note, user);
}

export type ClaimCarryOver = {
  token: string;
  ids: readonly string[];
};

/**
 * Brings the items of the device's anonymous list into the current one.
 * Whatever the answer, a token that can no longer be used (used by someone
 * else, expired, gone) is forgotten: there is nothing more to bring.
 */
export function useClaimCarryOver(userId: string, targetListId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.items(userId, targetListId);
  return useMutation({
    mutationKey: itemMutationKeys.carryOver(userId, targetListId),
    scope: listScope(targetListId),
    mutationFn: async ({ token, ids }: ClaimCarryOver): Promise<Item[]> =>
      unwrap(
        await createClient()
          .rpc("claim_carry_over", {
            invite_token: token,
            target_list_id: targetListId,
            new_ids: [...ids],
          })
          .abortSignal(writeSignal()),
      ),
    onSuccess: (rows) => {
      receiveOwnRows(queryClient, userId, targetListId, rows);
      clearCarryOver();
    },
    onError: (error) => {
      const kind = sharingErrorOf(error);
      if (
        kind === "invite_not_found" ||
        kind === "invite_already_used" ||
        kind === "invite_expired" ||
        kind === "source_not_found"
      ) {
        clearCarryOver();
      }
    },
    onSettled: () => settle(queryClient, key),
  });
}

/**
 * The list left behind when the user joined another one (leftoversOf), if
 * any, with how many items it has, and the two ways out: bring them into the
 * current list (merge) or leave them (discard). One at a time: v1 shows one
 * list, so there is normally one leftover at most.
 *
 * A leftover of the user's own with nothing in it is merged at once, with no
 * question: nothing would be lost, and its catalog (what the user used to
 * buy) comes along. One of someone else's, even empty, is always asked
 * about: retiring it means leaving it.
 */
export function useLeftover(userId: string | null) {
  const lists = useLists(userId);
  const current = currentListOf(lists.data);
  const leftover = leftoversOf(lists.data, current)[0] ?? null;
  const items = useItems(userId, leftover?.id ?? null);
  const count =
    items.data?.filter((item) => item.deleted_at === null).length ?? null;
  const merge = useMergeList(userId ?? "", current?.id ?? "");
  const discard = useDiscardList(userId ?? "", leftover);
  const silent = useRef<string | null>(null);
  const { mutate: mergeNow } = merge;

  const ownAndEmpty =
    leftover !== null &&
    leftover.role === "owner" &&
    leftover.member_count <= 1 &&
    count === 0;
  useEffect(() => {
    if (!ownAndEmpty || !leftover || silent.current === leftover.id) return;
    silent.current = leftover.id;
    mergeNow({ sourceListId: leftover.id, ids: idsFor(0) });
  }, [ownAndEmpty, leftover, mergeNow]);

  return {
    /** The list to ask about, once its items are known; null otherwise. */
    leftover: leftover && count !== null && !ownAndEmpty ? leftover : null,
    count: count ?? 0,
    bring: () => {
      if (!leftover) return;
      merge.mutate({ sourceListId: leftover.id, ids: idsFor(count ?? 0) });
    },
    drop: () => discard.mutate(),
    isPending: merge.isPending || discard.isPending,
    error: merge.error ?? discard.error,
  };
}

/**
 * The carry-over waiting for this account on this device (useCarryOver),
 * and the two ways out: bring its items into the current list, or leave
 * them (the anonymous list stays behind, as anyone's abandoned one).
 */
export function useCarryOverOffer(
  user: SessionUser | null,
  targetListId: string | null,
) {
  const note = useCarryOver(user);
  const claim = useClaimCarryOver(user?.id ?? "", targetListId ?? "");
  return {
    note: targetListId ? note : null,
    bring: () => {
      if (!note || !targetListId) return;
      claim.mutate({ token: note.token, ids: idsFor(note.count) });
    },
    leave: clearCarryOver,
    isPending: claim.isPending,
    error: claim.error,
  };
}

/**
 * For the sign-in to an existing account (account section): leaves the
 * carry-over of the list on screen, with the items the cache shows, for the
 * account of `email`, while the session is still the anonymous one. Await
 * it before asking for the email; it never fails.
 */
export function useCarryOverPreparation(userId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    async (email: string) => {
      const list = currentListOf(
        queryClient.getQueryData<List[]>(queryKeys.lists(userId)),
      );
      if (!list) return null;
      const items =
        queryClient.getQueryData<Item[]>(queryKeys.items(userId, list.id)) ??
        [];
      const count = items.filter((item) => item.deleted_at === null).length;
      return prepareCarryOver(userId, list, count, email);
    },
    [queryClient, userId],
  );
}
