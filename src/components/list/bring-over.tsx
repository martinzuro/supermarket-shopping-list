"use client";

import type { User } from "@supabase/supabase-js";
import { ArrowDownToLine, CircleAlert } from "lucide-react";
import { useState } from "react";
import { Collapse } from "@/components/motion";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {
  sharingErrorOf,
  useCarryOverOffer,
  useLeftover,
  type SharingError,
} from "@/lib/queries";
import { texts } from "@/lib/texts";

const t = texts.bringOver;

function errorText(error: unknown) {
  const kind: SharingError = sharingErrorOf(error);
  if (kind === "network") return t.errors.network;
  if (kind === "list_shared") return t.errors.list_shared;
  if (
    kind === "source_not_found" ||
    kind === "invite_not_found" ||
    kind === "invite_already_used" ||
    kind === "invite_expired"
  ) {
    return t.errors.gone;
  }
  return t.errors.unknown;
}

type Choice = "bring" | "drop";

/**
 * Two questions with the same shape: "these items are somewhere else, do you
 * want them here?". Whichever applies shows at the top of the list screen,
 * once, and goes away when answered (the data layer retires what it asked
 * about).
 *
 * - The list left behind after joining a shared one (useLeftover): bring its
 *   items into this list, or discard it. For a list of someone else's,
 *   discarding it is leaving it.
 * - What the device's anonymous list had when the user signed in to an
 *   existing account (useCarryOverOffer): bring it into the account's list,
 *   or leave it out.
 *
 * It is a block of the screen, not a sheet: the person just arrived at a
 * list and wants to see it, and the answer can wait.
 */
export function BringOver({
  user,
  listId,
}: {
  user: User;
  listId: string | null;
}) {
  const leftover = useLeftover(user.id);
  const carryOver = useCarryOverOffer(user, listId);
  // Which button was pressed, to say what is being done while it runs.
  const [choice, setChoice] = useState<Choice | null>(null);

  const left = leftover.leftover;
  const note = left ? null : carryOver.note;
  const pending = left ? leftover.isPending : carryOver.isPending;
  const error = left ? leftover.error : carryOver.error;
  const busy = (which: Choice) => pending && choice === which;

  function answer(which: Choice, action: () => void) {
    setChoice(which);
    action();
  }

  let block: {
    title: string;
    body: string;
    bring: { label: string; busy: string; run: () => void } | null;
    drop: { label: string; busy: string; run: () => void };
    hint?: string;
  } | null = null;

  if (left) {
    const text = t.count(leftover.count);
    if (left.role === "member") {
      block =
        leftover.count === 0
          ? {
              title: t.leftover.empty.title,
              body: t.leftover.empty.body,
              bring: null,
              drop: {
                label: t.leftover.shared.drop,
                busy: t.leftover.shared.dropping,
                run: leftover.drop,
              },
            }
          : {
              title: t.leftover.shared.title(text),
              body: t.leftover.shared.body,
              bring: {
                label: t.leftover.shared.bring,
                busy: t.leftover.bringing,
                run: leftover.bring,
              },
              drop: {
                label: t.leftover.shared.drop,
                busy: t.leftover.shared.dropping,
                run: leftover.drop,
              },
            };
    } else {
      block = {
        title: t.leftover.title(text),
        body: t.leftover.body,
        bring: {
          label: t.leftover.bring,
          busy: t.leftover.bringing,
          run: leftover.bring,
        },
        drop: {
          label: t.leftover.drop,
          busy: t.leftover.dropping,
          run: leftover.drop,
        },
      };
    }
  } else if (note) {
    block = {
      title: t.carryOver.title(t.count(note.count)),
      body: t.carryOver.body,
      hint: t.carryOver.hint,
      bring: {
        label: t.carryOver.bring,
        busy: t.carryOver.bringing,
        run: carryOver.bring,
      },
      drop: {
        label: t.carryOver.leave,
        busy: t.carryOver.leave,
        run: carryOver.leave,
      },
    };
  }

  return (
    <>
      {/* Always mounted, like the other live regions of the screen. */}
      <div role="status" aria-live="polite" className="sr-only">
        {block ? `${block.title}. ${block.body}` : ""}
      </div>
      <Collapse show={block !== null} className="pt-2">
        {block ? (
          <div
            data-testid="bring-over"
            data-kind={left ? "leftover" : "carry-over"}
            aria-busy={pending}
            className="flex flex-col gap-2"
          >
            <Banner
              tone="info"
              icon={ArrowDownToLine}
              liveRegion={false}
              title={block.title}
              body={block.hint ? `${block.body} ${block.hint}` : block.body}
              footer={
                <>
                  {block.bring ? (
                    <Button
                      type="button"
                      disabled={pending}
                      onClick={() => answer("bring", block.bring!.run)}
                    >
                      {busy("bring") ? block.bring.busy : block.bring.label}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => answer("drop", block.drop.run)}
                  >
                    {busy("drop") ? block.drop.busy : block.drop.label}
                  </Button>
                </>
              }
            />
            {error && !pending ? (
              <Banner
                tone="error"
                icon={CircleAlert}
                title={errorText(error)}
              />
            ) : null}
          </div>
        ) : null}
      </Collapse>
    </>
  );
}
