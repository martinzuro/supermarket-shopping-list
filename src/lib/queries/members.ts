"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { RequestError, unwrap, writeSignal } from "./errors";
import { listScope } from "./items";
import { queryKeys } from "./keys";
import {
  membershipMutationKeys,
  putListBack,
  setMembershipNotice,
  takeListOut,
  type List,
} from "./lists";

/**
 * Someone in the list. There are no profiles: the email is what tells
 * members apart, and it is null while a member is anonymous.
 */
export type Member = {
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
  email: string | null;
};

async function fetchMembers(listId: string): Promise<Member[]> {
  const rows = unwrap(
    await createClient().rpc("list_member_emails", {
      target_list_id: listId,
    }),
  );
  return rows.map((row) => ({
    user_id: row.user_id,
    role: row.role === "owner" ? "owner" : "member",
    joined_at: row.joined_at,
    // Typed as text by the generator; null for an anonymous member.
    email: (row.email as string | null) ?? null,
  }));
}

/** The members of the list, in the order they joined (the owner first). */
export function useMembers(userId: string | null, listId: string | null) {
  return useQuery({
    queryKey: queryKeys.members(userId ?? "", listId ?? ""),
    queryFn: () => fetchMembers(listId!),
    enabled: userId !== null && listId !== null,
  });
}

/**
 * When a Realtime event said a member left the list, per list and member:
 * a removal that failed must not put back someone who is gone anyway (they
 * left, or the removal went through and only its answer was lost).
 */
const departures = new WeakMap<QueryClient, Map<string, number>>();
/** Far longer than a removal takes, retries included. */
const DEPARTURE_MS = 60_000;

export function noteMemberGone(
  queryClient: QueryClient,
  listId: string,
  memberId: string,
) {
  let gone = departures.get(queryClient);
  if (!gone) {
    gone = new Map();
    departures.set(queryClient, gone);
  }
  const now = Date.now();
  for (const [key, at] of gone) {
    if (now - at > DEPARTURE_MS) gone.delete(key);
  }
  gone.set(`${listId}:${memberId}`, now);
}

function goneSince(
  queryClient: QueryClient,
  listId: string,
  memberId: string,
  since: number,
) {
  const at = departures.get(queryClient)?.get(`${listId}:${memberId}`);
  return at !== undefined && at >= since;
}

/**
 * Deletes a plain member's row (the owner's never: a list keeps its owner).
 * RLS lets the owner remove anyone and a member remove themselves; any other
 * delete matches no row, and so does one whose row is already gone.
 */
async function deleteMembership(listId: string, memberId: string) {
  return unwrap(
    await createClient()
      .from("list_members")
      .delete()
      .eq("list_id", listId)
      .eq("user_id", memberId)
      .eq("role", "member")
      .select()
      .abortSignal(writeSignal()),
  );
}

export type RemoveMember = { memberId: string };

/**
 * The owner takes a member out of the list, with the optimistic pattern of
 * plan 2.3: the member leaves the members list at once; a rejection puts
 * them back, unless an event said meanwhile that they are gone anyway. A
 * delete that matches no row is not an error: the member was already out.
 * The member's own app hears it and closes the list (realtime.ts).
 */
export function useRemoveMember(userId: string, listId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.members(userId, listId);
  return useMutation({
    mutationKey: [...key, "remove"],
    scope: { id: `members:${listId}` },
    mutationFn: async ({ memberId }: RemoveMember) => {
      await deleteMembership(listId, memberId);
    },
    onMutate: async ({ memberId }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const members = queryClient.getQueryData<Member[]>(key);
      const removed = members?.find((member) => member.user_id === memberId);
      if (removed) {
        queryClient.setQueryData<Member[]>(key, (current) =>
          current?.filter((member) => member.user_id !== memberId),
        );
      }
      return { removed, startedAt: Date.now() };
    },
    onError: (_error, { memberId }, context) => {
      const removed = context?.removed;
      if (
        !removed ||
        goneSince(queryClient, listId, memberId, context.startedAt)
      )
        return;
      queryClient.setQueryData<Member[]>(key, (members) => {
        if (!members || members.some((member) => member.user_id === memberId))
          return members;
        const next = [...members, removed];
        return next.sort((a, b) => a.joined_at.localeCompare(b.joined_at));
      });
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: queryKeys.lists(userId) }),
      ]),
  });
}

/** Postgres insufficient_privilege, as RLS reports it. */
const REFUSED = "42501";

/**
 * Leaves the list, or finds the user out of it already. A delete that
 * matched nothing either means someone removed the user meanwhile (done) or
 * that they own the list, which they cannot leave (refused).
 */
async function leave(listId: string, userId: string) {
  const deleted = await deleteMembership(listId, userId);
  if (deleted.length > 0) return;
  const still = unwrap(
    await createClient()
      .from("list_members")
      .select("role")
      .eq("list_id", listId)
      .eq("user_id", userId)
      .abortSignal(writeSignal()),
  );
  if (still.length > 0) {
    throw new RequestError(
      { message: "owner_cannot_leave", code: REFUSED },
      403,
    );
  }
}

/**
 * A member leaves the list they are in (the owner cannot). Optimistic: the
 * list leaves the cache at once, so the screen moves on to the user's other
 * list, or to a new one, and the channel closes (useListRealtime follows the
 * current list). useCurrentList tells "left". A rejection brings the list
 * back, if it is not back already, and tells that leaving failed.
 *
 * It runs in the list's queue of item writes, after the ones still pending:
 * what the user did before leaving reaches the other members first.
 */
export function useLeaveList(userId: string, listId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: membershipMutationKeys.leave(userId, listId),
    scope: listScope(listId),
    mutationFn: () => leave(listId, userId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.lists(userId) });
      return { taken: takeListOut(queryClient, userId, listId) };
    },
    onError: (_error, _variables, context) => {
      putListBack(queryClient, userId, context?.taken);
      setMembershipNotice(queryClient, { kind: "leave_failed", listId });
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.lists(userId) }),
  });
}

/**
 * Discards a list left behind (leftoversOf) instead of merging it: an owner
 * alone in it soft-deletes it, a member leaves it. Optimistic, like
 * useLeaveList, and silent: the list was not on screen. A list of the user's
 * own that others use is refused here and by the database (list_shared),
 * which also catches someone joining after the lists were read.
 */
export function useDiscardList(userId: string, list: List) {
  const queryClient = useQueryClient();
  const listId = list.id;
  return useMutation({
    mutationKey: membershipMutationKeys.discard(userId, listId),
    scope: listScope(listId),
    mutationFn: async () => {
      if (list.role === "member") return leave(listId, userId);
      if (list.member_count > 1) {
        throw new RequestError({ message: "list_shared", code: "P0001" }, 400);
      }
      // Already soft-deleted (a retry whose answer was lost) matches no row.
      unwrap(
        await createClient()
          .from("lists")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", listId)
          .is("deleted_at", null)
          .select("id")
          .abortSignal(writeSignal()),
      );
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.lists(userId) });
      return { taken: takeListOut(queryClient, userId, listId) };
    },
    onError: (_error, _variables, context) => {
      putListBack(queryClient, userId, context?.taken);
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.list(userId, listId) });
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.lists(userId) }),
  });
}
