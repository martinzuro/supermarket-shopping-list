"use client";

import { Menu } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  AccountSection,
  type MenuNotice,
  type PendingSignIn,
} from "@/components/menu/account-section";
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

/** Header menu button and the sheet it opens (account and, later, more). */
export function AppMenu() {
  const [open, setOpen] = useState(false);
  const [pendingSignIn, setPendingSignIn] = useState<PendingSignIn | null>(
    null,
  );
  const currentNotice = useSyncExternalStore(
    subscribeToNotice,
    getNotice,
    getServerNotice,
  );

  // Coming back from the email link: show how it went.
  useEffect(takeNoticeFromUrl, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setNotice(null);
  }

  return (
    <Sheet
      open={open || currentNotice !== null}
      onOpenChange={handleOpenChange}
    >
      <SheetTrigger asChild>
        <Button
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
          // email field.
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
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
            onPendingSignInChange={setPendingSignIn}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
