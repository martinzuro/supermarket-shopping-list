"use client";

import { CircleAlert } from "lucide-react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { useConfirm } from "@/components/use-confirm";
import {
  useLeaveList,
  useMembers,
  useRemoveMember,
  type List,
  type Member,
} from "@/lib/queries";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";

const t = texts.members;

function spokenName(member: Member) {
  return member.email ?? t.noAccountSpoken;
}

/**
 * Who shares the list, live as people join or leave. Everyone sees the
 * members. The owner takes a member out with the light confirmation (the
 * member leaves the screen at once); a plain member leaves the list the same
 * way, and the owner never gets that (a list keeps its owner). No profiles:
 * a person is their email, or "Sin cuenta" while they are anonymous.
 */
export function MembersSection({
  userId,
  list,
  onLeave,
}: {
  userId: string;
  list: List;
  /** The list is about to go away from under the sheet: close it. */
  onLeave: () => void;
}) {
  const members = useMembers(userId, list.id);
  const remove = useRemoveMember(userId, list.id);
  const leave = useLeaveList(userId, list.id);
  const removal = useConfirm();
  const leaving = useConfirm();
  const isOwner = list.role === "owner";

  function handleRemove(member: Member) {
    if (!removal.press(member.user_id)) return;
    remove.mutate({ memberId: member.user_id });
  }

  function handleLeave() {
    if (!leaving.press("leave")) return;
    // Optimistic: the list is gone from the cache at once, so the sheet
    // closes first and the screen moves on to the user's other list.
    onLeave();
    leave.mutate();
  }

  const asked = removal.target;
  const askedMember = members.data?.find((member) => member.user_id === asked);

  return (
    <div data-testid="members" className="flex flex-col gap-2">
      <Section
        id="members"
        title={t.heading}
        count={members.data?.length}
        className="py-2"
      >
        {members.data ? (
          <ul className="border-rule border-t">
            {members.data.map((member) => (
              <MemberRow
                key={member.user_id}
                member={member}
                you={member.user_id === userId}
                canRemove={isOwner && member.role !== "owner"}
                confirming={asked === member.user_id}
                armed={asked === member.user_id && removal.armed}
                onRemove={() => handleRemove(member)}
              />
            ))}
          </ul>
        ) : members.isError ? (
          <Banner
            tone="error"
            icon={CircleAlert}
            title={t.errors.load}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void members.refetch()}
              >
                {t.errors.retry}
              </Button>
            }
          />
        ) : (
          <p className="text-ink-2 py-3">{t.loading}</p>
        )}
      </Section>

      {remove.isError ? (
        <Banner tone="error" icon={CircleAlert} title={t.errors.remove} />
      ) : null}

      {/* Always mounted, so the question is read out when it is asked. */}
      <p role="status" aria-live="polite" className="sr-only">
        {askedMember
          ? t.remove.confirmLabel(spokenName(askedMember))
          : leaving.target !== null
            ? t.leave.confirm
            : ""}
      </p>

      {isOwner ? null : (
        <div className="flex flex-col gap-3 pt-2">
          <p className="text-label text-ink-2 text-pretty">{t.leave.hint}</p>
          <Button
            type="button"
            variant="danger"
            data-armed={leaving.armed}
            // Texto en tinta sobre el fondo de peligro, como en Banner.
            className={cn(
              "w-full",
              leaving.target !== null && "bg-danger-bg text-ink",
            )}
            onClick={handleLeave}
          >
            {leaving.target !== null ? t.leave.confirm : t.leave.action}
          </Button>
        </div>
      )}
    </div>
  );
}

function MemberRow({
  member,
  you,
  canRemove,
  confirming,
  armed,
  onRemove,
}: {
  member: Member;
  you: boolean;
  canRemove: boolean;
  confirming: boolean;
  armed: boolean;
  onRemove: () => void;
}) {
  const who = member.email ?? t.noAccount;
  // You are "Vos"; the email (or the lack of one) goes under it.
  const primary = you ? t.you : who;
  const secondary = confirming
    ? t.remove.consequence
    : [member.role === "owner" ? t.owner : null, you ? who : null]
        .filter(Boolean)
        .join(" · ");

  return (
    <li
      data-slot="member-row"
      data-member-id={member.user_id}
      className="border-rule min-h-row flex items-center gap-3 border-b py-2"
    >
      <div className="min-w-0 flex-1">
        <p className="text-row break-words">{primary}</p>
        {secondary ? (
          <p className="text-label text-ink-2 break-words">{secondary}</p>
        ) : null}
      </div>
      {canRemove ? (
        <Button
          type="button"
          variant="danger"
          data-armed={armed}
          aria-label={
            confirming
              ? t.remove.confirmLabel(spokenName(member))
              : t.remove.label(spokenName(member))
          }
          className={cn("shrink-0", confirming && "bg-danger-bg text-ink")}
          onClick={onRemove}
        >
          {confirming ? t.remove.confirm : t.remove.action}
        </Button>
      ) : null}
    </li>
  );
}
