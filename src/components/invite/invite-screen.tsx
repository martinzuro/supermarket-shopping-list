"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { InvitationIllustration } from "@/components/illustrations";
import { Enter, Stagger, StaggerItem } from "@/components/motion";
import { retrySession, useSession } from "@/components/session-provider";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { markWelcomeSeen } from "@/components/welcome/welcome-flag";
import {
  sharingErrorOf,
  useAcceptInvite,
  useInvitePreview,
  type SharingError,
} from "@/lib/queries";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";

const t = texts.invite;

/** What the screen says, from what is known about the link and the person. */
type View =
  | "loading"
  | "offline"
  | "error"
  | "valid"
  | "member"
  | "own"
  | "used"
  | "expired"
  | "not_found";

type Copy = {
  eyebrow: string;
  lead: string;
  em: string;
  tail: string;
  body: string;
};

const copies: Record<View, Copy> = {
  loading: { eyebrow: t.eyebrow, ...t.loading },
  offline: t.offline,
  error: t.loadError,
  valid: { eyebrow: t.eyebrow, ...t.valid },
  member: t.member,
  own: t.own,
  used: t.used,
  expired: t.expired,
  not_found: t.notFound,
};

/** Accept errors that say the link itself is no good: joining again is no use. */
const FINAL_ERRORS: readonly SharingError[] = [
  "invite_not_found",
  "invite_already_used",
  "invite_expired",
];

function acceptErrorText(error: SharingError) {
  switch (error) {
    case "invite_not_found":
    case "invite_already_used":
    case "invite_expired":
    case "not_authenticated":
    case "network":
      return t.errors[error];
    default:
      return t.errors.unknown;
  }
}

const sameEmail = (a: string | null | undefined, b: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * An email that may not fit the line breaks before its "@", not in the
 * middle of the domain; a part longer than the line still breaks anywhere.
 */
function BreakableEmail({ email }: { email: string }) {
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;
  return (
    <>
      {email.slice(0, at)}
      <wbr />
      {email.slice(at)}
    </>
  );
}

/** Lime on the ink surface, like the welcome's button. */
const primaryOnInk =
  "bg-lime text-on-lime hover:bg-lime/90 dark:hover:bg-lime/90 disabled:bg-lime/60 disabled:text-on-lime w-full sm:w-auto";
const quietOnInk =
  "text-inverse-fg hover:bg-inverse-fg/10 disabled:text-inverse-fg-2 w-full sm:w-auto";

/**
 * The invitation, from the side of the person who receives it
 * (DESIGN_DIRECTION.md, section 8): the editorial moment of the product.
 * An ink surface like the welcome, a display headline with its italic word,
 * the illustration, everything entering staggered. At 375px the text sits at
 * the bottom, where the thumb is; from `md` it opens like a magazine spread,
 * headline on the left and the drawing large on the right.
 */
export function InviteScreen({ token }: { token: string }) {
  const router = useRouter();
  const { status, user } = useSession();
  const userId = user?.id ?? null;
  const preview = useInvitePreview(userId, token);
  const accept = useAcceptInvite(userId ?? "");
  const headingRef = useRef<HTMLHeadingElement>(null);

  const inviterEmail = preview.data?.inviterEmail ?? null;
  // After accepting, the answer refetches and says "member": keep the screen
  // on the joining step until it moves on to the list.
  const joining = accept.isPending || accept.isSuccess;

  let view: View;
  if (joining) view = "valid";
  else if (status === "offline" && !preview.data) view = "offline";
  else if (preview.isError && !preview.data) view = "error";
  else if (!user || !preview.data) view = "loading";
  else if (preview.data.status === "valid") view = "valid";
  else if (preview.data.status === "member") {
    view = sameEmail(user.email, inviterEmail) ? "own" : "member";
  } else if (preview.data.status === "invite_already_used") view = "used";
  else if (preview.data.status === "invite_expired") view = "expired";
  else view = "not_found";

  // The heading takes the focus when a state appears (not while loading), so
  // a screen reader says what the invitation is before anything else.
  useEffect(() => {
    if (view !== "loading") headingRef.current?.focus({ preventScroll: true });
  }, [view]);

  function join() {
    accept.mutate(token, {
      onSuccess: () => {
        markWelcomeSeen();
        router.replace("/");
      },
    });
  }

  const copy = copies[view];
  const acceptError = accept.isError ? sharingErrorOf(accept.error) : null;
  const canJoinAgain =
    acceptError === null || !FINAL_ERRORS.includes(acceptError);

  return (
    <main
      data-testid="invite-screen"
      data-state={view}
      className="surface-inverse px-safe pt-safe pb-safe flex flex-1 flex-col"
    >
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col md:max-w-6xl">
        <Enter as="header" className="py-5 md:py-8">
          <p className="text-title font-serif">{texts.app.name}</p>
        </Enter>

        <div className="flex flex-1 flex-col justify-end gap-8 pb-6 md:grid md:grid-cols-12 md:items-end md:gap-x-12 md:pb-16">
          <Enter
            delay={0.1}
            className="text-inverse-fg size-40 md:order-2 md:col-span-5 md:size-auto md:w-full md:max-w-md md:self-center md:justify-self-end [&_svg]:size-full"
          >
            <InvitationIllustration />
          </Enter>

          <Stagger
            as="div"
            key={view === "valid" ? "valid" : view}
            delayChildren={0.15}
            className="md:order-1 md:col-span-7"
          >
            <StaggerItem as="p" className="eyebrow text-inverse-fg-2 mb-3">
              {copy.eyebrow}
            </StaggerItem>

            <StaggerItem as="div">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-display font-serif text-balance outline-none"
              >
                {copy.lead} <em>{copy.em}</em>
                {copy.tail}
              </h1>
            </StaggerItem>

            {view === "valid" ? (
              <StaggerItem
                as="div"
                className="border-inverse-fg-2/40 mt-8 border-t pt-4"
              >
                <p className="eyebrow text-inverse-fg-2">{t.from}</p>
                <p
                  data-testid="invite-inviter"
                  className="text-heading mt-1 [overflow-wrap:anywhere]"
                >
                  {inviterEmail ? (
                    <BreakableEmail email={inviterEmail} />
                  ) : (
                    t.unknownInviter
                  )}
                </p>
              </StaggerItem>
            ) : null}

            <StaggerItem
              as="p"
              className="text-inverse-fg-2 mt-4 max-w-prose text-pretty"
            >
              {copy.body}
            </StaggerItem>

            {acceptError ? (
              <StaggerItem as="div" className="mt-6 max-w-prose">
                <Banner
                  tone="error"
                  icon={CircleAlert}
                  title={acceptErrorText(acceptError)}
                />
              </StaggerItem>
            ) : null}

            <StaggerItem
              as="div"
              className="min-h-touch-lg mt-8 flex flex-col gap-2 sm:flex-row"
            >
              <Actions
                view={view}
                joining={joining}
                failed={acceptError !== null}
                canJoinAgain={canJoinAgain}
                onJoin={join}
                onRetry={() => {
                  if (view === "offline") retrySession();
                  void preview.refetch();
                }}
              />
            </StaggerItem>
          </Stagger>
        </div>
      </div>

      {/* Always mounted, so the joining step is announced when it starts. */}
      <div role="status" aria-live="polite" className="sr-only">
        {joining ? t.joining : ""}
      </div>
    </main>
  );
}

function Actions({
  view,
  joining,
  failed,
  canJoinAgain,
  onJoin,
  onRetry,
}: {
  view: View;
  joining: boolean;
  /** The last try to join failed in a way that may pass (not the link's fault). */
  failed: boolean;
  canJoinAgain: boolean;
  onJoin: () => void;
  onRetry: () => void;
}) {
  const toList = (label: string, primary: boolean) => (
    <Button
      asChild
      size={primary ? "touch-lg" : "touch"}
      variant={primary ? "default" : "ghost"}
      className={primary ? primaryOnInk : quietOnInk}
    >
      <Link href="/">{label}</Link>
    </Button>
  );

  switch (view) {
    case "loading":
      return null;
    case "offline":
    case "error":
      return (
        <Button
          type="button"
          size="touch-lg"
          className={primaryOnInk}
          onClick={onRetry}
        >
          {t.actions.retry}
        </Button>
      );
    case "valid":
      return (
        <>
          {canJoinAgain ? (
            <Button
              type="button"
              size="touch-lg"
              className={primaryOnInk}
              disabled={joining}
              aria-busy={joining}
              onClick={onJoin}
            >
              {joining
                ? t.actions.joining
                : failed
                  ? t.actions.retryJoin
                  : t.actions.join}
            </Button>
          ) : null}
          <Button
            asChild
            variant="ghost"
            className={cn(
              quietOnInk,
              joining && "pointer-events-none opacity-60",
            )}
          >
            <Link href="/" aria-disabled={joining || undefined}>
              {canJoinAgain ? t.actions.later : t.actions.goToMyList}
            </Link>
          </Button>
        </>
      );
    case "member":
      return toList(t.actions.goToList, true);
    default:
      return toList(t.actions.goToMyList, true);
  }
}
