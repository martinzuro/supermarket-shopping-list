import { expect, test } from "@playwright/test";
import { texts } from "../src/lib/texts";
import { adminClient, seedCatalog } from "./supabase-admin";
import {
  catalogLoaded,
  field,
  openAndCreateList,
  pending,
  row,
  waitHydrated,
} from "./two-members";

/**
 * A frequent product, typed and added with the page at its end, at 375px
 * against the local Supabase stack. The field empties at once and the
 * optimistic row lands a moment later: in between, the product must not
 * come back to the frequents row. If it did, the bar would grow and shrink,
 * and useBarHeight would move the page under the next tap (seen in
 * f4-history.spec.ts, which dodged it with products not frequent yet).
 */

/** Enough rows for a page taller than the screen. */
const FILLER = [
  "Arroz",
  "Fideos",
  "Harina",
  "Azúcar",
  "Sal",
  "Aceite",
  "Yerba",
  "Café",
  "Galletitas",
  "Manteca",
  "Queso",
  "Jamón",
  "Huevos",
  "Pan",
  "Tomates",
  "Cebollas",
  "Papas",
  "Zanahorias",
];

type Frame = { scrollY: number; bar: number; last: number };

declare global {
  interface Window {
    __frames?: Frame[];
    __pillShown?: boolean;
    __stopRecording?: () => void;
  }
}

test.describe("a frequent product on its way to the list", () => {
  test.skip(
    process.env.E2E_SUPABASE !== "1",
    "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
  );
  test.use({ viewport: { width: 375, height: 812 } });

  test("does not come back to the row, and the page does not move", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const list = await openAndCreateList(page);
    const { error } = await adminClient()
      .from("items")
      .insert(
        FILLER.map((name, position) => ({
          list_id: list.id,
          name,
          position,
          created_by: list.created_by,
        })),
      );
    if (error) throw error;
    // The only frequent product (the filler was added once each); without
    // category, so its row lands last, below everything on screen.
    await seedCatalog(list.id, [{ name: "Leche", times: 5 }]);
    const catalog = catalogLoaded(page);
    await page.reload();
    await expect(field(page)).toBeVisible();
    await waitHydrated(page);
    await catalog;
    const last = FILLER.at(-1)!;
    await expect(row(pending(page), last)).toBeVisible();

    const frequents = page.getByRole("group", {
      name: texts.addItem.frequents,
    });
    await expect(frequents.getByRole("button")).toHaveCount(1);
    await expect(frequents.getByRole("button")).toHaveAccessibleName(
      texts.addItem.addProduct("Leche"),
    );

    // Typed, with the suggestions closed: the bar is only the field.
    await field(page).fill("Leche");
    await field(page).press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(frequents).toBeHidden();
    // The page at its end, as when adding one product after another.
    await page.evaluate(() =>
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "instant",
      }),
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.scrollY + window.innerHeight >=
            document.documentElement.scrollHeight - 2,
        ),
      )
      .toBe(true);

    // Every frame from the add on: the scroll, the bar's height and where
    // the last row on screen is; and whether the pill ever shows.
    await page.evaluate(
      ({ pill, bar, lastRow }) => {
        const frames: Frame[] = [];
        window.__frames = frames;
        window.__pillShown = false;
        const observer = new MutationObserver(() => {
          if (
            document.querySelector(
              `[data-slot="frequents-row"] button[aria-label="${pill}"]`,
            )
          ) {
            window.__pillShown = true;
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        let frame = 0;
        const sample = () => {
          frames.push({
            scrollY: window.scrollY,
            bar: bar!.getBoundingClientRect().height,
            last: lastRow!.getBoundingClientRect().top,
          });
          frame = requestAnimationFrame(sample);
        };
        sample();
        window.__stopRecording = () => {
          cancelAnimationFrame(frame);
          observer.disconnect();
        };
      },
      {
        pill: texts.addItem.addProduct("Leche"),
        bar: await page.locator("[data-keyboard-open]").elementHandle(),
        lastRow: await row(pending(page), last).elementHandle(),
      },
    );

    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/rest/v1/items" &&
        response.request().method() === "POST",
    );
    await field(page).press("Enter");
    await expect(field(page)).toHaveValue("");
    expect((await saved).ok()).toBe(true);
    await expect(row(pending(page), "Leche")).toBeVisible();
    // The refetch after the add, and any exit animation of the bar.
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.__stopRecording?.());

    expect(await page.evaluate(() => window.__pillShown)).toBe(false);
    const frames = await page.evaluate(() => window.__frames ?? []);
    expect(frames.length).toBeGreaterThan(10);
    const [first] = frames;
    expect(frames.filter((one) => one.bar !== first.bar)).toEqual([]);
    expect(frames.filter((one) => one.scrollY !== first.scrollY)).toEqual([]);
    expect(frames.filter((one) => one.last !== first.last)).toEqual([]);
    await expect(frequents).toBeHidden();
  });
});
