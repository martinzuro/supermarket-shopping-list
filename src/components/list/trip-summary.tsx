import { formatMoney, type Estimate } from "@/lib/domain";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";

const t = texts.moments.cartEmptied.summary;

/** What an emptying of the cart leaves to tell (M-3). */
export type TripSummaryData = {
  /** How many rows went through the checkout. */
  count: number;
  /** What they were estimated to cost, per currency. */
  estimate: Estimate;
  /** How many stayed pending on the list. */
  remaining: number;
};

function amounts(estimate: Estimate) {
  return estimate.totals
    .map((one) => formatMoney(one.total, one.currency))
    .join(" · ");
}

/**
 * The summary said out loud, for the moment's live region: the same lines
 * the eye reads in the ledger, one sentence each.
 */
export function tripSummarySpoken({
  count,
  estimate,
  remaining,
}: TripSummaryData): string {
  const lines = [`${t.checkout}: ${count} ${t.products(count)}.`];
  if (estimate.totals.length > 0) {
    lines.push(`${t.estimate}: ${amounts(estimate)}.`);
  }
  lines.push(
    `${t.remaining}: ${
      remaining === 0 ? t.nothing : `${remaining} ${t.products(remaining)}`
    }.`,
  );
  return lines.join(" ");
}

/**
 * The summary of a trip in the "Buena compra" moment (docs/improvements.md,
 * M-3), as a ticket on the inverse surface: one line per figure between
 * rules, the label as an eyebrow on the left and the figure in mono on the
 * right. The estimate only when something had a price (never "$ 0"), with
 * how many it covers when not all did.
 */
export function TripSummary({
  count,
  estimate,
  remaining,
  className,
}: TripSummaryData & { className?: string }) {
  const partial =
    estimate.totals.length > 0 && estimate.priced < estimate.count;
  const row =
    "border-inverse-fg-2/40 flex items-baseline justify-between gap-4 border-b py-3";
  const label = "eyebrow text-inverse-fg-2 shrink-0";
  const figure = "font-mono text-inverse-fg";
  return (
    <dl
      aria-label={t.label}
      data-slot="trip-summary"
      className={cn("border-inverse-fg-2/40 max-w-sm border-t", className)}
    >
      <div className={row} data-slot="trip-summary-checkout">
        <dt className={label}>{t.checkout}</dt>
        <dd className="text-right">
          <span data-numeric className={figure}>
            {count}
          </span>{" "}
          {t.products(count)}
        </dd>
      </div>
      {estimate.totals.length > 0 ? (
        <div className={row} data-slot="trip-summary-estimate">
          <dt className={label}>{t.estimate}</dt>
          <dd className="flex min-w-0 flex-col items-end gap-0.5 text-right">
            <span data-numeric className={figure}>
              {estimate.totals.map((one, index) => (
                <span key={one.currency}>
                  {index > 0 ? <span aria-hidden> · </span> : null}
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
              <span className="text-label text-inverse-fg-2">
                {texts.list.estimate.covered(estimate.priced, estimate.count)}
              </span>
            ) : null}
          </dd>
        </div>
      ) : null}
      <div className={row} data-slot="trip-summary-remaining">
        <dt className={label}>{t.remaining}</dt>
        <dd className="text-right">
          {remaining === 0 ? (
            t.nothing
          ) : (
            <>
              <span data-numeric className={figure}>
                {remaining}
              </span>{" "}
              {t.products(remaining)}
            </>
          )}
        </dd>
      </div>
    </dl>
  );
}
