"use client";

import type { User } from "@supabase/supabase-js";
import { Check, CircleAlert, Copy, Share2, UserPlus } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Enter } from "@/components/motion";
import {
  GuestAccount,
  type PendingSignIn,
} from "@/components/menu/account-section";
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
 * Header action and the sheet it opens: the owner of the list shares it.
 * Only the owner can invite (RLS on list_invites), so a plain member of a
 * shared list does not get the button. An anonymous owner converts first,
 * with the same email and code step as the menu; an account gets the
 * invitation.
 */
export function ShareSheet({
  pendingSignIn,
  onPendingSignInChange,
}: ShareSheetProps) {
  const { status, user } = useSession();
  const lists = useLists(user?.id ?? null);
  // Not useCurrentList: that one also creates a list when there is none.
  const list = currentListOf(lists.data);
  const [converted, setConverted] = useState(false);

  if (list?.role !== "owner") return null;

  return (
    <Sheet onOpenChange={(open) => open && setConverted(false)}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          aria-label={t.open}
        >
          <UserPlus aria-hidden strokeWidth={1.5} />
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
      >
        <SheetHeader>
          <SheetTitle>{t.title}</SheetTitle>
          <SheetDescription>
            {user?.is_anonymous ? t.guest.why : t.description}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="pb-safe pb-6">
          {!user ? (
            <p className="text-ink-2 text-pretty">
              {status === "offline" ? t.offline : t.loading}
            </p>
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
              <InviteStep key={list.id} list={list} userId={user.id} />
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

const noopSubscribe = () => () => {};
const getCanShare = () => typeof navigator.share === "function";
const getServerCanShare = () => false;

function errorText(error: unknown) {
  const kind = sharingErrorOf(error);
  if (kind === "network") return t.errors.network;
  if (kind === "not_authenticated") return t.errors.notAuthenticated;
  return t.errors.unknown;
}

/** Puts the text of an element in the selection, to copy it by hand. */
function selectText(element: HTMLElement | null) {
  if (!element) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
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
  const canShare = useSyncExternalStore(
    noopSubscribe,
    getCanShare,
    getServerCanShare,
  );
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
    mutate();
  }

  async function copy(link: string) {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setCopied(false);
      setCopyFailed(true);
      selectText(linkRef.current);
    }
  }

  async function share(link: string) {
    try {
      await navigator.share({
        title: t.message.title,
        text: t.message.text,
        url: link,
      });
    } catch (error) {
      // The person closed the share sheet: nothing to say.
      if (error instanceof DOMException && error.name === "AbortError") return;
      await copy(link);
    }
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
