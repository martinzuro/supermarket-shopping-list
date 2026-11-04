import { formatMoney, type Estimate } from "@/lib/domain";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";

const t = texts.shopping.totals;

type ShoppingTotalsProps = {
  /** What is in the cart. */
  cart: Estimate;
  /** What is still pending. */
  pending: Estimate;
  className?: string;
};

function Amounts({ estimate }: { estimate: Estimate }) {
  return estimate.totals.map((one, index) => (
    <span key={one.currency}>
      {index > 0 ? <span aria-hidden> · </span> : null}
      <span data-currency={one.currency} className="whitespace-nowrap">
        {formatMoney(one.total, one.currency)}
      </span>
    </span>
  ));
}

/**
 * The totals while shopping (docs/improvements.md, M-2), a quiet line over
 * the add bar: what the cart adds up to on the left, about what is left on
 * the right, each per currency in mono ("Carro $ 253 · Falta ~$ 708"). Each
 * side keeps its place: at the start only "Falta" shows, at the end only
 * "Carro". Nothing at all when no product has a price; how many have one
 * stays at the foot of each section (EstimateLine).
 */
export function ShoppingTotals({
  cart,
  pending,
  className,
}: ShoppingTotalsProps) {
  if (cart.totals.length === 0 && pending.totals.length === 0) return null;
  return (
    <p
      data-slot="shopping-totals"
      className={cn(
        "text-label flex items-baseline justify-between gap-4",
        className,
      )}
    >
      {cart.totals.length > 0 ? (
        <span data-slot="shopping-cart" className="min-w-0">
          <span className="eyebrow mr-2">{t.cart}</span>
          <span data-numeric className="text-ink font-mono">
            <Amounts estimate={cart} />
          </span>
        </span>
      ) : (
        <span aria-hidden />
      )}
      {pending.totals.length > 0 ? (
        <span data-slot="shopping-remaining" className="min-w-0 text-right">
          <span className="eyebrow mr-2">{t.remaining}</span>
          <span data-numeric className="text-ink font-mono">
            <span aria-hidden>{t.about}</span>
            <span className="sr-only">{t.aboutSpoken}</span>
            <Amounts estimate={pending} />
          </span>
        </span>
      ) : null}
    </p>
  );
}
