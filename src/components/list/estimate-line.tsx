import { formatMoney, type Estimate } from "@/lib/domain";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";

type EstimateLineProps = {
  estimate: Estimate;
  className?: string;
};

/**
 * What a section is estimated to cost, at its foot: "Estimado" and one
 * amount per currency in mono ("$ 1.234 · US$ 12"), and, when some products
 * have no price, how many the amounts cover. Nothing at all when no product
 * has a price (never "$ 0"). Quiet on purpose: it sits under the last rule of
 * the rows and its amounts line up with theirs on the right.
 */
export function EstimateLine({ estimate, className }: EstimateLineProps) {
  if (estimate.totals.length === 0) return null;
  const partial = estimate.priced < estimate.count;

  return (
    <div
      data-slot="estimate"
      className={cn(
        "flex items-baseline justify-between gap-4 py-3",
        className,
      )}
    >
      <span className="eyebrow shrink-0">{texts.list.estimate.label}</span>
      <div className="text-label flex min-w-0 flex-col items-end gap-0.5 text-right">
        <p data-numeric className="text-ink font-mono">
          {estimate.totals.map((one, index) => (
            <span key={one.currency}>
              {index > 0 ? <span aria-hidden> · </span> : null}
              <span data-currency={one.currency} className="whitespace-nowrap">
                {formatMoney(one.total, one.currency)}
              </span>
            </span>
          ))}
        </p>
        {partial ? (
          <p data-slot="estimate-covered" className="text-ink-2">
            {texts.list.estimate.covered(estimate.priced, estimate.count)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
