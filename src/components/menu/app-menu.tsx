"use client";

import { Menu } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AccountSection,
  type MenuNotice,
  type PendingSignIn,
} from "@/components/menu/account-section";
import { ProductsSection } from "@/components/menu/products-section";
import { TripReview } from "@/components/menu/trip-review";
import { TripsSection, type NamedTrip } from "@/components/menu/trips-section";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { takeAccountNotice } from "@/lib/auth";
import { texts } from "@/lib/texts";

// Notice shown at the top of the account section. It lives outside React
// state because it is first read from the URL (the auth callback redirect),
// which only exists in the browser.
let notice: MenuNotice | null = null;
const noticeListeners = new Set<() => void>();

function setNotice(next: MenuNotice | null) {
  if (next === notice) return;
  notice = next;
  for (const listener of noticeListeners) listener();
}

function subscribeToNotice(listener: () => void) {
  noticeListeners.add(listener);
  return () => {
    noticeListeners.delete(listener);
  };
}

const getNotice = () => notice;
const getServerNotice = () => null;

function takeNoticeFromUrl() {
  const { notice: fromUrl, cleanHref } = takeAccountNotice(
    window.location.href,
  );
  if (cleanHref !== window.location.href) {
    window.history.replaceState(window.history.state, "", cleanHref);
  }
  if (fromUrl) setNotice(fromUrl);
}

type AppMenuProps = {
  pendingSignIn: PendingSignIn | null;
  onPendingSignInChange: (pending: PendingSignIn | null) => void;
};

/**
 * Header menu button and the sheet it opens: the account, the past trips and
 * the products the list remembers. A past trip's review (F-4) is a sheet of
 * its own, opened once this one is gone: never two modal sheets at once.
 */
export function AppMenu({
  pendingSignIn,
  onPendingSignInChange,
}: AppMenuProps) {
  const [open, setOpen] = useState(false);
  const currentNotice = useSyncExternalStore(
    subscribeToNotice,
    getNotice,
    getServerNotice,
  );
  const trigger = useRef<HTMLButtonElement>(null);
  // The trip picked in the history: its review opens when the menu is gone.
  const picked = useRef<NamedTrip | null>(null);
  const [reviewed, setReviewed] = useState<NamedTrip | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  // One review per opening (its key), so each starts unanswered.
  const [reviews, setReviews] = useState(0);
  // Back from a review closed without adding: the menu opens again with the
  // focus on that trip, where the user was.
  const backTo = useRef<string | null>(null);

  // Coming back from the email link: show how it went.
  useEffect(takeNoticeFromUrl, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setNotice(null);
  }

  function openTrip(named: NamedTrip) {
    picked.current = named;
    handleOpenChange(false);
  }

  return (
    <>
      <Sheet
        open={open || currentNotice !== null}
        onOpenChange={handleOpenChange}
      >
        <SheetTrigger asChild>
          <Button
            ref={trigger}
            type="button"
            variant="ghost"
            size="icon-touch"
            aria-label={texts.header.menu}
            className="-mr-2.5"
          >
            <Menu aria-hidden strokeWidth={1.5} />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="right"
          aria-describedby={undefined}
          className="pt-safe overflow-y-auto"
          onOpenAutoFocus={(event) => {
            // Keep the keyboard closed on phones: focus the panel, not the
            // email field. Back from a trip's review, its row.
            event.preventDefault();
            const panel = event.currentTarget as HTMLElement | null;
            const row = backTo.current
              ? panel?.querySelector<HTMLElement>(
                  `[data-trip-id="${backTo.current}"]`,
                )
              : null;
            backTo.current = null;
            (row ?? panel)?.focus();
          }}
          onCloseAutoFocus={(event) => {
            // Gone because a trip was picked: its review opens now, and the
            // focus goes to it, not back to the menu button.
            const named = picked.current;
            if (!named) return;
            picked.current = null;
            event.preventDefault();
            setReviewed(named);
            setReviews((count) => count + 1);
            setReviewOpen(true);
          }}
        >
          <SheetHeader>
            <SheetTitle>{texts.menu.title}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <AccountSection
              notice={currentNotice}
              onNotice={setNotice}
              pendingSignIn={pendingSignIn}
              onPendingSignInChange={onPendingSignInChange}
            />
            <TripsSection onOpen={openTrip} />
            <ProductsSection />
          </SheetBody>
        </SheetContent>
      </Sheet>
      <TripReview
        key={reviews}
        named={reviewed}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onClosed={(answered) => {
          if (answered) {
            // Added: the list is where it shows, and the menu button is
            // where the user went from.
            trigger.current?.focus({ preventScroll: true });
          } else {
            backTo.current = reviewed?.trip.id ?? null;
            setOpen(true);
          }
        }}
      />
    </>
  );
}
