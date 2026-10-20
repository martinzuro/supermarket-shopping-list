"use client";

import { CircleAlert, LogOut, UserMinus, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Collapse } from "@/components/motion";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { useMembershipNotice, type MembershipNotice } from "@/lib/queries";
import { texts } from "@/lib/texts";

const t = texts.membershipNotice;

const copy = {
  left: { ...t.left, tone: "info", icon: LogOut },
  // Neutral on purpose: it also covers leaving from another device.
  removed: { ...t.removed, tone: "attention", icon: UserMinus },
  leave_failed: { ...t.leaveFailed, tone: "error", icon: CircleAlert },
} as const satisfies Record<MembershipNotice["kind"], unknown>;

/**
 * What happened to the list the user was seeing: they left it, they are no
 * longer in it, or leaving failed and they are still in. At the top of the
 * list screen, above what it moved on to, until it is dismissed (it is the
 * only explanation of why the list changed, so it does not leave by itself).
 * The sentence is also read out through a region that is always mounted;
 * the banner's own role would not be, as it appears with its text.
 *
 * When the place the user was in is gone with the list (the sheet they left
 * it from: requestNoticeFocus), the focus goes to the notice's close button,
 * the way the cart-emptied moment takes it to its action: a keyboard user
 * continues from what changed, and the region above says what it was (the
 * button's name alone would not).
 */
export function MembershipNotices() {
  const { notice, dismiss, focusRequested, takeFocusRequest } =
    useMembershipNotice();
  const shown = notice ? copy[notice.kind] : null;
  const dismissButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!notice || !focusRequested) return;
    if (takeFocusRequest()) dismissButton.current?.focus();
  }, [notice, focusRequested, takeFocusRequest]);

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-slot="membership-announcement"
      >
        {/* Keyed by the notice, so the same one told twice is read twice.
            Not the failure: its banner is an alert, read out on its own. */}
        <span key={notice?.seq ?? 0}>
          {shown && notice?.kind !== "leave_failed"
            ? `${shown.title}. ${shown.body}`
            : ""}
        </span>
      </div>
      <Collapse show={shown !== null} className="pt-2">
        {shown ? (
          <Banner
            // The failure is an alert by itself; the others are in the region.
            liveRegion={false}
            tone={shown.tone}
            icon={shown.icon}
            title={shown.title}
            body={shown.body}
            data-testid="membership-notice"
            data-kind={notice?.kind}
            action={
              <Button
                ref={dismissButton}
                type="button"
                variant="ghost"
                size="icon-touch"
                aria-label={t.dismiss}
                onClick={dismiss}
              >
                <XIcon aria-hidden strokeWidth={1.5} />
              </Button>
            }
          />
        ) : null}
      </Collapse>
    </>
  );
}
