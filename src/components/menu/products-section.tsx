"use client";

import { CircleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { CategoryIcon } from "@/components/icons/category-icons";
import { useSession } from "@/components/session-provider";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/use-confirm";
import { categoryKind, matchOf, normalizeName } from "@/lib/domain";
import {
  currentListOf,
  useCatalog,
  useCategories,
  useForgetProduct,
  useLists,
  type CatalogEntry,
  type Category,
} from "@/lib/queries";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";

const t = texts.products;

/**
 * "Productos guardados", in the menu (docs/improvements.md, M-5): what the
 * list's catalog remembers of every product ever added, in alphabetical
 * order, with a search by the same rule as the suggestions. A product typed
 * wrong, or one no longer bought, is forgotten with the light confirmation
 * of the system (first tap asks, second one does it, as "Sacar" a member):
 * it stops being suggested, frequent or usual. Not in the suggestions
 * themselves: a listbox option cannot hold a button of its own.
 */
export function ProductsSection() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const listId = currentListOf(useLists(userId).data)?.id ?? null;
  const catalog = useCatalog(userId, listId);
  const categories = useCategories(userId, listId);
  const forget = useForgetProduct(userId ?? "", listId ?? "");
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  // The product whose forgetting the server rejected last (it is back).
  const [failed, setFailed] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const key = normalizeName(query);
  const entries = [...(catalog.data ?? [])]
    .filter((entry) => key === "" || matchOf(entry.name_normalized, key))
    .sort((a, b) => a.name_normalized.localeCompare(b.name_normalized, "es"));
  const asked = entries.find(
    (entry) => entry.name_normalized === confirm.target,
  );

  function handleForget(entry: CatalogEntry) {
    if (!confirm.press(entry.name_normalized)) return;
    setFailed(null);
    forget.mutate(
      { key: entry.name_normalized, name: entry.display_name },
      { onError: () => setFailed(entry.display_name) },
    );
    // Its row, and the button that had the focus, go with it: the focus
    // moves to the section's title now, not to the search (a phone would open
    // its keyboard). Never taken from somewhere else it moved to.
    const active = document.activeElement;
    if (
      !active ||
      active === document.body ||
      active.matches('[role="dialog"]') ||
      active.closest('[data-slot="product-row"]')
    ) {
      heading.current?.focus({ preventScroll: true });
    }
  }

  return (
    <section
      aria-labelledby="products-heading"
      data-testid="products-section"
      className="border-rule flex flex-col gap-4 border-t pt-6 pb-6"
    >
      <h2
        ref={heading}
        id="products-heading"
        tabIndex={-1}
        className="text-heading outline-none"
      >
        {t.title}
      </h2>
      <p className="text-ink-2 text-pretty">{t.description}</p>

      {catalog.data === undefined ? (
        catalog.isError ? (
          <Banner
            tone="error"
            icon={CircleAlert}
            title={t.errors.load}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void catalog.refetch()}
              >
                {t.errors.retry}
              </Button>
            }
          />
        ) : (
          <p className="text-ink-2">{t.loading}</p>
        )
      ) : catalog.data.length === 0 ? (
        <p className="text-ink-2 text-pretty">{t.empty}</p>
      ) : (
        <>
          <Field label={t.search}>
            <Input
              // Text, not search: no native clear button with the browser's
              // look (enterKeyHint still shows "search" on the keyboard).
              type="text"
              value={query}
              placeholder={t.searchPlaceholder}
              autoComplete="off"
              enterKeyHint="search"
              onChange={(event) => setQuery(event.target.value)}
            />
          </Field>
          {failed ? (
            <Banner
              tone="error"
              icon={CircleAlert}
              title={t.errors.forget(failed)}
            />
          ) : null}
          {entries.length === 0 ? (
            <p className="text-ink-2 text-pretty">{t.none(query.trim())}</p>
          ) : (
            <ul data-slot="products-list" className="border-rule border-t">
              {entries.map((entry) => (
                <ProductRow
                  key={entry.name_normalized}
                  entry={entry}
                  categories={categories.data}
                  confirming={confirm.target === entry.name_normalized}
                  armed={confirm.armed}
                  onForget={() => handleForget(entry)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {/* Always mounted, so the question is read out when it is asked. */}
      <p role="status" aria-live="polite" className="sr-only">
        {asked ? t.forget.confirmLabel(asked.display_name) : ""}
      </p>
    </section>
  );
}

function ProductRow({
  entry,
  categories,
  confirming,
  armed,
  onForget,
}: {
  entry: CatalogEntry;
  categories: readonly Category[] | undefined;
  confirming: boolean;
  armed: boolean;
  onForget: () => void;
}) {
  const category = categories?.find((one) => one.id === entry.last_category_id);
  return (
    <li
      data-slot="product-row"
      className="border-rule min-h-row flex items-center gap-3 border-b py-2"
    >
      <CategoryIcon
        category={category ? categoryKind(category) : "otros"}
        className="text-ink-2 size-5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="text-row break-words">{entry.display_name}</p>
        <p className="text-label text-ink-2 text-pretty">
          {confirming ? t.forget.consequence : t.times(entry.times_added)}
        </p>
      </div>
      <Button
        type="button"
        variant="danger"
        data-armed={armed}
        aria-label={
          confirming
            ? t.forget.confirmLabel(entry.display_name)
            : t.forget.label(entry.display_name)
        }
        // Texto en tinta sobre el fondo de peligro, como "Sacar".
        className={cn("shrink-0", confirming && "bg-danger-bg text-ink")}
        onClick={onForget}
      >
        {confirming ? t.forget.confirm : t.forget.action}
      </Button>
    </li>
  );
}
