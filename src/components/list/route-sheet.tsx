"use client";

import { useMutationState } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, XIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { CategoryIcon } from "@/components/icons/category-icons";
import { Collapse, Enter, transitions } from "@/components/motion";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { categoryKind, compareRouteOrder, type Direction } from "@/lib/domain";
import {
  categoryMutationKeys,
  categoryStep,
  useMoveCategory,
  type Category,
  type MoveCategory,
} from "@/lib/queries";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";

type RouteSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  listId: string;
  /** The list's categories; the sheet shows the live ones in route order. */
  categories: readonly Category[];
  /** Pending items in each category by id (empty ones count 0). */
  counts: ReadonlyMap<string, number>;
  /** Where the focus goes when the sheet closes (the button that opened it). */
  onCloseAutoFocus?: (event: Event) => void;
};

/**
 * The route ("Recorrido"): every live category in route order, empty ones
 * too (Pendientes hides them, so this is the only place to place them), each
 * with a step up and a step down. A tap moves the category one place, at
 * once; the order is the one Pendientes follows. Rows slide to their new
 * place (transform only; nothing slides with reduced motion), and the focus
 * stays on the button that was pressed, which follows its category.
 */
export function RouteSheet({
  open,
  onOpenChange,
  onCloseAutoFocus,
  ...props
}: RouteSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        onOpenAutoFocus={(event) => {
          // The focus goes to the sheet, not to the first arrow.
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <SheetHeader>
          <SheetTitle>{texts.route.title}</SheetTitle>
          <SheetDescription>{texts.route.description}</SheetDescription>
        </SheetHeader>
        {/* Mounted with the content, so each opening starts clean. */}
        <RouteBody {...props} />
      </SheetContent>
    </Sheet>
  );
}

/** What the user last pressed, and the route as it was then. */
type Moved = { id: string; direction: Direction; name: string; before: string };

function RouteBody({
  userId,
  listId,
  categories,
  counts,
}: Omit<RouteSheetProps, "open" | "onOpenChange" | "onCloseAutoFocus">) {
  const move = useMoveCategory(userId, listId);
  const route = categories
    .filter((category) => category.deleted_at == null)
    .sort(compareRouteOrder);
  const signature = route.map((category) => category.id).join();

  // Only the moves rejected since this opening, and not yet dismissed.
  const [openedAt] = useState(() => Date.now());
  const [dismissedAt, setDismissedAt] = useState(0);
  const failures = useMutationState({
    filters: {
      mutationKey: categoryMutationKeys.all(userId, listId),
      status: "error",
    },
    select: (mutation) => ({
      at: mutation.state.submittedAt,
      name: (mutation.state.variables as MoveCategory | undefined)?.name ?? "",
    }),
  });
  const failure = failures
    .filter((one) => one.at >= openedAt && one.at > dismissedAt)
    .reduce<(typeof failures)[number] | null>(
      (latest, one) => (!latest || one.at >= latest.at ? one : latest),
      null,
    );
  // Kept while the notice leaves, so it fades with its text.
  const [lastFailure, setLastFailure] = useState(failure);
  if (failure && failure.at !== lastFailure?.at) setLastFailure(failure);
  const notice = failure ?? lastFailure;

  const [moved, setMoved] = useState<Moved | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  // The order changed under the user's finger. React may have moved the node
  // that had the focus, which drops it to <body> (or, as Radix's focus trap
  // catches that, to the sheet itself): it goes back to the same button on
  // the same category, now in its new place. Never stolen from somewhere
  // else the focus has moved to.
  const previous = useRef(signature);
  useLayoutEffect(() => {
    if (signature === previous.current) return;
    previous.current = signature;
    if (!moved) return;
    const active = document.activeElement;
    const lost =
      !active || active === document.body || active.matches('[role="dialog"]');
    if (!lost) return;
    buttons.current.get(`${moved.id}:${moved.direction}`)?.focus({
      preventScroll: true,
    });
  });

  function handlePress(category: Category, direction: Direction) {
    const step = categoryStep(route, category, direction);
    // At that end of the route there is nowhere to go.
    if (!step) return;
    setMoved({
      id: category.id,
      direction,
      name: category.name,
      before: signature,
    });
    move.mutate(step);
  }

  // Where the category landed, said once the route shows it. Empty while the
  // route is as it was at the tap (the optimistic update lands a moment
  // after it), and when a rejected move brought it back: the alert says that.
  const place = moved ? route.findIndex((c) => c.id === moved.id) : -1;
  const said =
    moved && place !== -1 && signature !== moved.before
      ? texts.route.position(moved.name, place + 1, route.length)
      : "";

  return (
    <div className="pb-safe flex flex-col">
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-slot="route-announcement"
      >
        {said}
      </div>
      <Collapse show={failure !== null} className="px-6 pb-4">
        {notice ? (
          <Banner
            tone="error"
            title={texts.route.error.title(notice.name)}
            body={texts.route.error.body}
            action={
              <Button
                type="button"
                variant="ghost"
                size="icon-touch"
                aria-label={texts.itemErrors.dismiss}
                onClick={() => setDismissedAt(notice.at)}
              >
                <XIcon aria-hidden strokeWidth={1.5} />
              </Button>
            }
          />
        ) : null}
      </Collapse>
      <ul
        aria-label={texts.route.listLabel}
        data-slot="route-list"
        className="border-rule mx-6 border-t"
      >
        {route.map((category, index) => {
          const kind = categoryKind(category);
          const count = counts.get(category.id) ?? 0;
          return (
            <Enter
              key={category.id}
              as="li"
              // The row slides to its new place by transform alone. It has
              // been there since the sheet opened: no entrance of its own.
              layout="position"
              transition={{ layout: transitions.base }}
              initial={false}
              data-category-id={category.id}
              data-slot="route-row"
              style={{ borderLeftColor: `var(--cat-${kind}-thread)` }}
              className="border-rule min-h-row flex items-center gap-3 border-b border-l-2 pl-4"
            >
              <span className="text-ink-2 flex shrink-0">
                <CategoryIcon category={kind} className="size-5" />
              </span>
              <span className="text-row min-w-0 flex-1 truncate">
                {category.name}
              </span>
              <span data-numeric className="text-ink-2 text-label font-mono">
                <span aria-hidden>{count}</span>
                <span className="sr-only">
                  {texts.route.pendingCount(count)}
                </span>
              </span>
              <div className="-mr-2.5 flex shrink-0">
                {(["up", "down"] as const).map((direction) => {
                  const end =
                    direction === "up"
                      ? index === 0
                      : index === route.length - 1;
                  const Arrow = direction === "up" ? ArrowUp : ArrowDown;
                  return (
                    <Button
                      key={direction}
                      ref={(node) => {
                        const key = `${category.id}:${direction}`;
                        if (node) buttons.current.set(key, node);
                        else buttons.current.delete(key);
                      }}
                      type="button"
                      variant="ghost"
                      size="icon-touch"
                      data-direction={direction}
                      aria-label={
                        direction === "up"
                          ? texts.route.up(category.name)
                          : texts.route.down(category.name)
                      }
                      // Not `disabled`: the focus must stay where it is when
                      // the category reaches an end.
                      aria-disabled={end || undefined}
                      className={cn(
                        end &&
                          "text-ink-3 cursor-default hover:bg-transparent active:scale-100",
                      )}
                      onClick={() => handlePress(category, direction)}
                    >
                      <Arrow aria-hidden strokeWidth={1.5} />
                    </Button>
                  );
                })}
              </div>
            </Enter>
          );
        })}
      </ul>
    </div>
  );
}
