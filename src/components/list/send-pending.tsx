"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Copy, Send } from "lucide-react";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import {
  selectText,
  shareOrCopy,
  useCanShare,
} from "@/components/share/web-share";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { pendingText } from "@/lib/domain";
import type { Category, Item } from "@/lib/queries";
import { texts } from "@/lib/texts";

const t = texts.sendPending;

/** The pending list was copied: the add bar says so (F-3). */
export type PendingCopy = { key: string; at: number };

type CopyStore = {
  last: PendingCopy | null;
  seq: number;
  listeners: Set<() => void>;
};

// Per query client, as the membership notices: every test starts clean.
const copyStores = new WeakMap<QueryClient, CopyStore>();

function copyStoreOf(queryClient: QueryClient) {
  let store = copyStores.get(queryClient);
  if (!store) {
    store = { last: null, seq: 0, listeners: new Set() };
    copyStores.set(queryClient, store);
  }
  return store;
}

function announceCopy(queryClient: QueryClient) {
  const store = copyStoreOf(queryClient);
  store.seq += 1;
  store.last = { key: `copy:${store.seq}`, at: Date.now() };
  store.listeners.forEach((listener) => listener());
}

/** The last copy of the pending list, for the add bar's notice. */
export function useLastCopy(): PendingCopy | null {
  const store = copyStoreOf(useQueryClient());
  const subscribe = useCallback(
    (listener: () => void) => {
      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    },
    [store],
  );
  return useSyncExternalStore(
    subscribe,
    () => store.last,
    () => null,
  );
}

/**
 * When the pending list was last copied: a bar that mounts after it (back
 * from another page) finds old news.
 */
export function lastCopyAt(queryClient: QueryClient): number {
  return copyStoreOf(queryClient).last?.at ?? 0;
}

type SendPendingProps = {
  /** All the items of the list: what is pending is picked here. */
  items: readonly Item[];
  categories: readonly Category[];
};

/**
 * "Mandar lo que falta" (docs/improvements.md, F-3), in the header of
 * Pendientes: what is still to buy as a message (pendingText), handed to the
 * share sheet of the system, or copied where the browser cannot share (the
 * add bar says so). When not even the copy works, a sheet offers the text,
 * selected, to copy by hand. The button is there only while something is
 * pending (as the data says: a row just checked, still on its way to the
 * cart, is not sent); the component stays mounted, so that sheet is not torn
 * down under the person reading it.
 */
export function SendPending({ items, categories }: SendPendingProps) {
  const queryClient = useQueryClient();
  const canShare = useCanShare();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  // One at a time: a second tap while the share sheet of the system is up
  // would fail, and fall back to a copy nobody asked for.
  const sending = useRef(false);
  // Kept apart from `open`, so the text stays while the sheet slides away.
  const [manualText, setManualText] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const visible = items.some(
    (item) => !item.checked && item.deleted_at == null,
  );

  async function send() {
    if (sending.current) return;
    const text = pendingText(items, categories, {
      heading: t.heading,
      uncategorized: texts.list.pending.uncategorized,
    });
    if (text === "") return;
    sending.current = true;
    try {
      const outcome = await shareOrCopy(canShare ? { text } : null, text);
      if (outcome === "copied") {
        announceCopy(queryClient);
      } else if (outcome === "failed") {
        setManualText(text);
        setManualOpen(true);
      }
    } finally {
      sending.current = false;
    }
  }

  return (
    <>
      {visible ? (
        <Button
          ref={buttonRef}
          type="button"
          variant="ghost"
          size="icon-touch"
          aria-label={canShare ? t.share : t.copy}
          onClick={() => void send()}
        >
          {canShare ? (
            <Send aria-hidden strokeWidth={1.5} />
          ) : (
            <Copy aria-hidden strokeWidth={1.5} />
          )}
        </Button>
      ) : null}
      <Sheet open={manualOpen} onOpenChange={setManualOpen}>
        <SheetContent
          side="bottom"
          className="pb-safe"
          onOpenAutoFocus={(event) => {
            // The panel, not its close button: the text is what matters, and
            // it is already selected.
            event.preventDefault();
            (event.currentTarget as HTMLElement | null)?.focus();
            selectText(textRef.current);
          }}
          onCloseAutoFocus={(event) => {
            // No trigger for Radix to go back to: the button that sent it,
            // while it is there (something is still pending).
            if (!buttonRef.current) return;
            event.preventDefault();
            buttonRef.current.focus({ preventScroll: true });
          }}
        >
          <SheetHeader>
            <SheetTitle>{t.manual.title}</SheetTitle>
            <SheetDescription>{t.manual.description}</SheetDescription>
          </SheetHeader>
          <SheetBody className="pb-6">
            {/* A quoted message: a rule at its side, as it reads in a chat. */}
            <p
              ref={textRef}
              data-slot="pending-text"
              className="border-rule-strong border-l-2 pl-4 break-words whitespace-pre-wrap select-all"
            >
              {manualText}
            </p>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
