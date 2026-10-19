"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { unwrap, writeSignal } from "./errors";
import { queryKeys } from "./keys";

/** Route that opens an invite link (plan 3.4). */
export const INVITE_PATH = "/invite";

export function inviteUrl(token: string, origin = window.location.origin) {
  return `${origin}${INVITE_PATH}/${encodeURIComponent(token)}`;
}

export type Invite = { token: string; url: string; expiresAt: string };

/**
 * The owner creates a link to share the list: single use, valid seven days
 * (migration sharing caps it). Not optimistic: the token comes from the
 * server. A retry after a lost answer may leave an unused invite behind,
 * which is harmless. The screen can create it as soon as it opens, so the
 * link is ready for the share sheet when the user taps.
 */
export function useCreateInvite(userId: string, listId: string) {
  return useMutation({
    mutationKey: [...queryKeys.list(userId, listId), "invite"],
    mutationFn: async (): Promise<Invite> => {
      const row = unwrap<{ token: string; expires_at: string }>(
        await createClient()
          .from("list_invites")
          .insert({ list_id: listId })
          .select("token, expires_at")
          .abortSignal(writeSignal())
          .single(),
      );
      return {
        token: row.token,
        url: inviteUrl(row.token),
        expiresAt: row.expires_at,
      };
    },
  });
}

/**
 * What a link says before the user joins (invite_preview): whether it can be
 * used, who sent it, and the list, if the user is in it already (the owner
 * opening their own link included).
 */
export type InvitePreview = {
  status:
    | "valid"
    | "member"
    | "invite_not_found"
    | "invite_already_used"
    | "invite_expired";
  /** Set when status is "member". */
  listId: string | null;
  /** Null while the inviter is anonymous, and unless status is valid or member. */
  inviterEmail: string | null;
};

const PREVIEW_STATUSES: readonly InvitePreview["status"][] = [
  "valid",
  "member",
  "invite_not_found",
  "invite_already_used",
  "invite_expired",
];

type PreviewRow = {
  status: string;
  list_id: string | null;
  inviter_email: string | null;
};

async function fetchPreview(token: string): Promise<InvitePreview> {
  const row = unwrap<PreviewRow>(
    await createClient()
      .rpc("invite_preview", { invite_token: token })
      .single(),
  );
  const status = PREVIEW_STATUSES.find((known) => known === row.status);
  return {
    status: status ?? "invite_not_found",
    listId: row.list_id ?? null,
    inviterEmail: row.inviter_email ?? null,
  };
}

export function useInvitePreview(userId: string | null, token: string) {
  return useQuery({
    queryKey: queryKeys.invite(userId ?? "", token),
    queryFn: () => fetchPreview(token),
    enabled: userId !== null,
  });
}

/**
 * Joins the list of an invite (accept_invite). Not optimistic: the list
 * cannot be shown before the server lets the user read it. It settles once
 * the lists are read again, so the joined list is already the current one
 * (currentListOf) when the screen moves on to it. Accepting again, or the
 * owner accepting their own link, answers the same list id.
 *
 * Errors come back as RequestError; sharingErrorOf gives the key for the
 * text (invite_not_found, invite_already_used, invite_expired, network...).
 */
export function useAcceptInvite(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["user", userId, "accept-invite"],
    mutationFn: async (token: string): Promise<string> =>
      unwrap(
        await createClient()
          .rpc("accept_invite", { invite_token: token })
          .abortSignal(writeSignal()),
      ),
    onSuccess: (_listId, token) =>
      Promise.all([
        // Also when no screen observes the lists (the invite screen does
        // not): the list screen must not open on the old answer.
        queryClient.invalidateQueries({
          queryKey: queryKeys.lists(userId),
          refetchType: "all",
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.invite(userId, token),
        }),
      ]),
  });
}
