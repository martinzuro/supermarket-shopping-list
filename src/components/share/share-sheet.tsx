"use client";

import type { User } from "@supabase/supabase-js";
import {
  Check,
  CircleAlert,
  Copy,
  Share2,
  UserPlus,
  Users,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Enter } from "@/components/motion";
import {
  GuestAccount,
  type PendingSignIn,
} from "@/components/menu/account-section";
import { MembersSection } from "@/components/share/members-section";
import {
  selectText,
  shareOrCopy,
  useCanShare,
  type ShareOutcome,
} from "@/components/share/web-share";
import { useSession } from "@/components/session-provider";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { InvitationCard } from "@/components/ui/invitation-card";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  currentListOf,
  requestNoticeFocus,
  sharingErrorOf,
  useCreateInvite,
  useLists,
  type Invite,
  type List,
} from "@/lib/queries";
import { texts } from "@/lib/texts";

const t = texts.share;

/** How long "Enlace copiado" stays on the button. */
const COPIED_MS = 2500;

type ShareSheetProps = {
  pendingSignIn: PendingSignIn | null;
  onPendingSignInChange: (pending: PendingSignIn | null) => void;
};

/**
 * Header action and the sheet it opens, for every member of the list. It
 * shows who shares the list (MembersSection); the owner also invites from
 * it, a plain member also leaves from it. Only the owner can invite (RLS on
 * list_invites): an anonymous owner converts first, with the same email and
 * code step as the menu; an account gets the invitation.
 *
 * The sheet and its trigger stay mounted while the lists are not known
 * (a calm loading text inside), because that happens with the sheet open:
 * signing in to an account that exists changes the user, whose lists are not
 * read yet, and the "signed in" feedback must survive until their list
 * shows. A different list for the same person (they left it, or were taken
 * out of it) starts the sheet over, closed, and the focus goes to the
 * membership notice (the sheet they were in is gone).
 */
export function ShareSheet({
  pendingSignIn,
  onPendingSignInChange,
}: ShareSheetProps) {
  const queryClient = useQueryClient();
  const { status, user } = useSession();
  const lists = useLists(user?.id ?? null);
  // Not useCurrentList: that one also creates a list when there is none.
  const list = currentListOf(lists.data);
  const [open, setOpen] = useState(false);
  const [converted, setConverted] = useState(false);
  // The sheet closed because the list under it went away: the focus is not
  // to return to the trigger (Radix does), but to the notice that says why.
  const [handOff, setHandOff] = useState(false);
  // What the sheet's close handler reads: the sheet fades out as an exiting
  // child that keeps the props of its last render (AnimatePresence), so a
  // closure over the state would still see "false".
  const handingOff = useRef(false);
  useEffect(() => {
    handingOff.current = handOff;
  }, [handOff]);
  // The last list shown and whose it was, to tell a new person (their lists
  // are loading) from the same person with another list. Adjusted while
  // rendering, so the sheet never shows a frame with the old list's sheet.
  const [shown, setShown] = useState<{ userId: string; list: List } | null>(
    null,
  );
  if (user && list && (shown?.list !== list || shown.userId !== user.id)) {
    const changed = shown?.userId === user.id && shown.list.id !== list.id;
    setShown({ userId: user.id, list });
    if (changed) {
      if (open) {
        setOpen(false);
        setHandOff(true);
      }
      setConverted(false);
    }
  }

  // While the sheet fades out after leaving, the list may already be gone
  // from the cache: it keeps what it was showing instead of swapping its
  // content for the loading text mid-fade.
  const fading =
    !open && shown !== null && shown.userId === user?.id ? shown.list : null;
  const current = list ?? fading;
  // The trigger needs what the list was while the new one loads.
  const known = current ?? shown?.list ?? null;
  if (!known) return null;

  const isOwner = known.role === "owner";
  // Someone else is in the list: it is worth showing who.
  const shared = current !== null && current.member_count > 1;
  const Icon =
    (current ?? known).member_count > 1 || !isOwner ? Users : UserPlus;

  function leave() {
    setOpen(false);
    setHandOff(true);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setConverted(false);
      }}
    >
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          aria-label={isOwner ? t.open : texts.members.open}
        >
          <Icon aria-hidden strokeWidth={1.5} />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="pt-safe overflow-y-auto"
        onOpenAutoFocus={(event) => {
          // Keep the keyboard closed on phones: focus the panel, not the
          // email field.
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (!handingOff.current) return;
          event.preventDefault();
          handingOff.current = false;
          setHandOff(false);
          requestNoticeFocus(queryClient);
        }}
      >
        <SheetHeader>
          <SheetTitle>{isOwner ? t.title : texts.members.title}</SheetTitle>
          <SheetDescription>
            {!isOwner
              ? texts.members.description
              : user?.is_anonymous
                ? t.guest.why
                : shared
                  ? t.descriptionShared
                  : t.description}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="pb-safe pb-6">
          {!user || !current ? (
            <p role="status" className="text-ink-2 text-pretty">
              {status === "offline" ? t.offline : t.loading}
            </p>
          ) : !isOwner ? (
            <MembersSection
              key={current.id}
              userId={user.id}
              list={current}
              onLeave={leave}
            />
          ) : user.is_anonymous ? (
            <GuestShare
              key={user.id}
              user={user}
              pendingSignIn={
                pendingSignIn?.userId === user.id ? pendingSignIn : null
              }
              onPendingSignInChange={onPendingSignInChange}
              onConverted={() => setConverted(true)}
            />
          ) : (
            <>
              {converted ? (
                <Banner tone="info" icon={Check} title={t.converted} />
              ) : null}
              {shared ? (
                <Enter>
                  <MembersSection
                    key={current.id}
                    userId={user.id}
                    list={current}
                    onLeave={leave}
                  />
                </Enter>
              ) : null}
              {/* One place for the invitation whether or not the list is
                  shared yet: someone joining must not remake the step. */}
              <div className="flex flex-col gap-4">
                {shared ? (
                  <h2 className="text-heading pt-2">{t.inviteHeading}</h2>
                ) : null}
                {/* One invitation per list and person. */}
                <InviteStep
                  key={`${user.id}:${current.id}`}
                  list={current}
                  userId={user.id}
                />
              </div>
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function GuestShare({
  user,
  pendingSignIn,
  onPendingSignInChange,
  onConverted,
}: {
  user: User;
  pendingSignIn: PendingSignIn | null;
  onPendingSignInChange: (pending: PendingSignIn | null) => void;
  onConverted: () => void;
}) {
  return (
    <div data-testid="share-guest" className="flex flex-col gap-4">
      <GuestAccount
        user={user}
        intro={t.guest.intro}
        onNotice={(notice) => {
          if (notice === "confirmed" || notice === "signed_in") onConverted();
        }}
        pendingSignIn={pendingSignIn}
        onPendingSignInChange={onPendingSignInChange}
      />
    </div>
  );
}

function errorText(error: unknown) {
  const kind = sharingErrorOf(error);
  if (kind === "network") return t.errors.network;
  if (kind === "not_authenticated") return t.errors.notAuthenticated;
  return t.errors.unknown;
}

/**
 * The invitation of an account: created as soon as the step shows, so the
 * link is ready when the user taps; one more per "another link". Shared with
 * the Web Share API where the browser has it, copied otherwise.
 */
function InviteStep({ list, userId }: { list: List; userId: string }) {
  const create = useCreateInvite(userId, list.id);
  const { mutate } = create;
  const asked = useRef(false);
  const linkRef = useRef<HTMLParagraphElement>(null);
  const canShare = useCanShare();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // StrictMode runs effects twice: one invite per step, not two.
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    mutate();
  }, [mutate]);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const invite: Invite | undefined = create.data;

  function anotherLink() {
    setCopied(false);
    setCopyFailed(false);
    mutate({ fresh: true });
  }

  function showCopy(outcome: ShareOutcome) {
    if (outcome === "copied") {
      setCopyFailed(false);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } else if (outcome === "failed") {
      setCopied(false);
      setCopyFailed(true);
      selectText(linkRef.current);
    }
  }

  async function copy(link: string) {
    setCopyFailed(false);
    showCopy(await shareOrCopy(null, link));
  }

  // A failure to share (not the person closing the sheet) copies the link.
  async function share(link: string) {
    showCopy(
      await shareOrCopy(
        { title: t.message.title, text: t.message.text, url: link },
        link,
      ),
    );
  }

  if (create.isError) {
    return (
      <Banner
        tone="error"
        icon={CircleAlert}
        title={errorText(create.error)}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => mutate()}
          >
            {t.errors.retry}
          </Button>
        }
      />
    );
  }

  const link = invite?.url ?? null;
  const copyButton = (
    <CopyButton
      primary={!canShare}
      copied={copied}
      disabled={link === null}
      onClick={() => link && void copy(link)}
    />
  );

  return (
    <div data-testid="share-invite" className="flex flex-col gap-6">
      <Enter>
        <InvitationCard
          eyebrow={t.card.eyebrow}
          title={list.name}
          linkLabel={t.card.linkLabel}
          link={link}
          pending={t.card.preparing}
          note={t.card.note}
          linkRef={linkRef}
        />
      </Enter>

      {/* Always mounted, so the copy confirmation is announced. */}
      <div role="status" aria-live="polite" className="sr-only">
        {copied ? t.actions.copied : copyFailed ? t.copyFailed : ""}
      </div>
      {copyFailed ? (
        <Banner
          tone="attention"
          icon={CircleAlert}
          liveRegion={false}
          title={t.copyFailed}
        />
      ) : null}

      <Enter delay={0.08} className="flex flex-col gap-2">
        {canShare ? (
          <Button
            type="button"
            size="touch-lg"
            disabled={link === null}
            onClick={() => link && void share(link)}
          >
            <Share2 aria-hidden strokeWidth={1.5} />
            {t.actions.share}
          </Button>
        ) : null}
        {copyButton}
        <div className="mt-4 flex flex-col items-start gap-1">
          <p className="text-label text-ink-2">{t.actions.anotherHint}</p>
          <Button
            type="button"
            variant="link"
            // A 44px touch area around a link-sized label.
            className="min-h-touch"
            disabled={create.isPending}
            onClick={anotherLink}
          >
            {t.actions.another}
          </Button>
        </div>
      </Enter>
    </div>
  );
}

function CopyButton({
  primary,
  copied,
  disabled,
  onClick,
}: {
  primary: boolean;
  copied: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size={primary ? "touch-lg" : "touch"}
      variant={primary ? "default" : "secondary"}
      disabled={disabled}
      onClick={onClick}
    >
      {copied ? (
        <Check aria-hidden strokeWidth={2} />
      ) : (
        <Copy aria-hidden strokeWidth={1.5} />
      )}
      {copied ? t.actions.copied : t.actions.copy}
    </Button>
  );
}
