"use client";

import { ChevronRight, CircleAlert } from "lucide-react";
import { Fragment, useMemo } from "react";
import { useSession } from "@/components/session-provider";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {
  formatMoney,
  formatTripDate,
  formatTripTime,
  sameDay,
  tripEstimate,
} from "@/lib/domain";
import {
  TRIP_LIMIT,
  currentListOf,
  useLists,
  useTrips,
  type Trip,
} from "@/lib/queries";
import { texts } from "@/lib/texts";

const t = texts.trips;

/** A past trip as the history names it, for its review's title too. */
export type NamedTrip = { trip: Trip; name: string };

/**
 * Each trip by its day ("Martes 20 de octubre"), and by its time as well
 * when another one fell on the same day.
 */
function named(trips: readonly Trip[], now: Date): NamedTrip[] {
  return trips.map((trip) => {
    const date = formatTripDate(trip.emptied_at, now);
    const twin = trips.some(
      (other) =>
        other.id !== trip.id && sameDay(other.emptied_at, trip.emptied_at),
    );
    return {
      trip,
      name: twin ? t.at(date, formatTripTime(trip.emptied_at)) : date,
    };
  });
}

/**
 * "Compras anteriores", in the menu (docs/improvements.md, F-4): every
 * emptying of the cart, newest first, with its day, how many products went
 * through the checkout and what they came to by currency. A trip opens its
 * products to add again; the menu closes first (onOpen), so the review is
 * never a sheet on top of this one.
 */
export function TripsSection({
  onOpen,
}: {
  onOpen: (trip: NamedTrip) => void;
}) {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const listId = currentListOf(useLists(userId).data)?.id ?? null;
  const history = useTrips(userId, listId);
  // The clock is read only with trips in hand: never while the page is
  // prerendered (the menu is closed then).
  const trips = useMemo(
    () => (history.data ? named(history.data.trips, new Date()) : []),
    [history.data],
  );

  return (
    <section
      aria-labelledby="trips-heading"
      data-testid="trips-section"
      className="border-rule flex flex-col gap-4 border-t pt-6 pb-6"
    >
      <h2 id="trips-heading" className="text-heading">
        {t.title}
      </h2>
      <p className="text-ink-2 text-pretty">{t.description}</p>

      {history.data === undefined ? (
        history.isError ? (
          <Banner
            tone="error"
            icon={CircleAlert}
            title={t.errors.load}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void history.refetch()}
              >
                {t.errors.retry}
              </Button>
            }
          />
        ) : (
          <p className="text-ink-2">{t.loading}</p>
        )
      ) : trips.length === 0 ? (
        <p className="text-ink-2 text-pretty">{t.empty}</p>
      ) : (
        <>
          <ul data-slot="trips-list" className="border-rule border-t">
            {trips.map((named) => (
              <TripRow
                key={named.trip.id}
                named={named}
                onOpen={() => onOpen(named)}
              />
            ))}
          </ul>
          {history.data.more ? (
            <p className="text-label text-ink-2">{t.more(TRIP_LIMIT)}</p>
          ) : null}
        </>
      )}
    </section>
  );
}

function TripRow({ named, onOpen }: { named: NamedTrip; onOpen: () => void }) {
  const { trip, name } = named;
  const count = t.count(trip.items.length);
  const totals = tripEstimate(trip.items).totals.map(({ currency, total }) =>
    formatMoney(total, currency),
  );
  return (
    <li className="border-rule border-b">
      <button
        type="button"
        data-slot="trip-row"
        data-trip-id={trip.id}
        aria-haspopup="dialog"
        aria-label={t.label(name, count, totals)}
        onClick={onOpen}
        className="group/trip min-h-row hover:bg-paper-hover active:bg-paper-pressed duration-instant -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 px-2 py-2 text-left transition-colors ease-out"
      >
        <span className="min-w-0 flex-1">
          <span className="text-row block break-words">{name}</span>
          <span className="text-label text-ink-2 block">
            {count}
            {totals.map((total) => (
              <Fragment key={total}>
                {" · "}
                <span data-numeric className="font-mono">
                  {total}
                </span>
              </Fragment>
            ))}
          </span>
        </span>
        <ChevronRight
          aria-hidden
          strokeWidth={1.5}
          className="text-ink-2 duration-fast size-5 shrink-0 transition-transform ease-out motion-safe:group-hover/trip:translate-x-0.5"
        />
      </button>
    </li>
  );
}
