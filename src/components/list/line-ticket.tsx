"use client";

import { motion, useReducedMotion } from "motion/react";
import { stationName, type Station } from "@/components/list/use-line";
import { Stagger, StaggerItem, transitions } from "@/components/motion";
import { motionTokens } from "@/lib/design/motion";
import { estimateOf, formatMoney } from "@/lib/domain";
import { texts } from "@/lib/texts";

const t = texts.line.ticket;

type LineTicketProps = {
  /** The stations of this trip, in route order. */
  stations: readonly Station[];
  /** False on a first render (a reload at the checkout): nothing prints. */
  animate: boolean;
};

/**
 * The checkout of the supermarket line (docs/improvements.md, F-9; ADR
 * 0010): the trip as a ticket, the only card-object of the screen, which can
 * be picked up (it drags sideways and springs back). A line per station,
 * the cart's count, what it was estimated to cost per currency (only when
 * something had a price, never "$ 0") and, below the cut, the stub "No
 * conseguido": what is still pending, per station. It is what "Buena compra"
 * used to tell after "Terminé" (M-3), told before.
 */
export function LineTicket({ stations, animate }: LineTicketProps) {
  const reduced = useReducedMotion();
  const lines = stations.map((station) => ({
    id: station.id,
    name: stationName(station),
    total: station.items.length,
    done: station.items.length - station.pending,
  }));
  const total = lines.reduce((sum, one) => sum + one.total, 0);
  const done = lines.reduce((sum, one) => sum + one.done, 0);
  const missing = lines.filter((one) => one.done < one.total);
  const estimate = estimateOf(
    stations.flatMap((station) => station.items.filter((item) => item.checked)),
  );
  const partial =
    estimate.totals.length > 0 && estimate.priced < estimate.count;
  const row =
    "border-rule flex items-baseline justify-between gap-3 border-b py-2";

  return (
    <motion.section
      aria-label={t.eyebrow}
      data-slot="line-ticket"
      // Sideways only: up and down is the page's scroll.
      drag={reduced ? false : "x"}
      // Held at its place: it gives a little, like paper, and springs back.
      // Unconstrained it would follow the finger off the screen and widen
      // the page.
      dragConstraints={{ left: 0, right: 0 }}
      dragDirectionLock
      dragSnapToOrigin
      dragElastic={0.2}
      className="bg-paper-2 rounded-sheet mt-3 cursor-grab touch-pan-y px-5 py-5 active:cursor-grabbing"
      initial={
        animate
          ? { opacity: 0, y: reduced ? 0 : -motionTokens.shift * 3 }
          : false
      }
      animate={{ opacity: 1, y: 0 }}
      transition={transitions.cinematic}
    >
      <p className="eyebrow" aria-hidden>
        {t.eyebrow}
      </p>
      <Stagger
        as="div"
        initial={animate ? "hidden" : false}
        delayChildren={motionTokens.duration.base}
        className="mt-2"
      >
        {/* Only the stations are a list: the totals are not two more. */}
        <ul>
          {lines.map((one) => (
            <StaggerItem key={one.id} className={row} data-station={one.id}>
              <span className="min-w-0 truncate">{one.name}</span>
              <span data-numeric className="text-label text-ink-2 font-mono">
                {t.count(one.done, one.total)}
              </span>
            </StaggerItem>
          ))}
        </ul>
        <StaggerItem
          as="div"
          className="flex items-baseline justify-between gap-3 pt-3"
          data-slot="line-ticket-total"
        >
          <span className="eyebrow">{t.total}</span>
          <span data-numeric className="text-heading font-mono">
            {t.count(done, total)}
          </span>
        </StaggerItem>
        {estimate.totals.length > 0 ? (
          <StaggerItem
            as="div"
            className="flex items-baseline justify-between gap-3 pt-2"
            data-slot="line-ticket-estimate"
          >
            <span className="eyebrow shrink-0">{t.estimate}</span>
            <span className="flex min-w-0 flex-col items-end gap-0.5 text-right">
              <span data-numeric className="font-mono">
                {estimate.totals.map((one, index) => (
                  <span key={one.currency}>
                    {index > 0 ? (
                      <>
                        <span aria-hidden> · </span>
                        <span className="sr-only">, </span>
                      </>
                    ) : null}
                    <span
                      data-currency={one.currency}
                      className="whitespace-nowrap"
                    >
                      {formatMoney(one.total, one.currency)}
                    </span>
                  </span>
                ))}
              </span>
              {partial ? (
                <span className="text-label text-ink-2">
                  {texts.list.estimate.covered(estimate.priced, estimate.count)}
                </span>
              ) : null}
            </span>
          </StaggerItem>
        ) : null}
      </Stagger>

      <div
        data-slot="line-stub"
        className="border-rule-strong mt-4 border-t border-dashed pt-4"
      >
        <p className="eyebrow">{t.missing}</p>
        {missing.length === 0 ? (
          <p className="text-ink-2 mt-1">{t.allIn}</p>
        ) : (
          <>
            <ul className="mt-1">
              {missing.map((one) => (
                <li
                  key={one.id}
                  data-station={one.id}
                  className="flex items-baseline justify-between gap-3 py-1"
                >
                  <span className="min-w-0 truncate">{one.name}</span>
                  <span
                    data-numeric
                    className="text-label text-citrus-text font-mono"
                  >
                    {t.missingCount(one.total - one.done)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-label text-ink-2 mt-2 text-pretty">{t.hint}</p>
          </>
        )}
      </div>
    </motion.section>
  );
}
