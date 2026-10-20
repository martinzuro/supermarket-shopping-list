import { expect, test, type Page } from "@playwright/test";
import { texts } from "../src/lib/texts";
import { addMember, deleteList } from "./supabase-admin";
import {
  CHANGE_MS,
  PULSE_END_MS,
  captureViewport,
  editor,
  field,
  newPlayer,
  openAndCreateList,
  pending,
  reloadJoined,
  removeButton,
  reportSteps,
  row,
  rowName,
  stepper,
  type Step,
} from "./two-members";

/**
 * Phase 3, part (b), two members: what one does to the price and to the
 * currency of an item reaches the other in under a second, with the new row
 * total and the new Pendientes total, the pulse on the other's row only, one
 * sentence for the other's screen reader and none for the actor's, and no
 * mount, unmount or check of the actor's own row (the criteria are the
 * stepper's, as in phase-2b; its row log does not record totals, so the
 * actor's new total is checked on its own). Then, not measured, the catalog following the change: the
 * product deleted and typed again comes with the other member's price and
 * currency, with no reload.
 */

const t = texts;
const e = t.editItem;
const DOLLARS = `${e.currency.usd.symbol}, ${e.currency.usd.name}`;

/** The text of the row's total and of the Pendientes total, whitespace folded. */
function totalsOf(page: Page, name: string) {
  return page.evaluate((itemName) => {
    const fold = (text: string | null | undefined) =>
      (text ?? "").replace(/\s+/g, " ").trim();
    const box = Array.from(
      document.querySelectorAll<HTMLElement>(
        '#pending [role="checkbox"], #cart [role="checkbox"]',
      ),
    ).find((one) => one.getAttribute("aria-label") === itemName);
    const total = box
      ?.closest("[data-item-id]")
      ?.querySelector('[data-slot="list-row-total"]');
    const estimate = document.querySelector(
      '#pending [data-slot="estimate"] [data-numeric]',
    );
    return {
      row: fold(total?.textContent),
      estimate: fold(estimate?.textContent),
    };
  }, name);
}

/** Resolves on the first frame the page shows these totals. */
async function showsTotals(
  page: Page,
  name: string,
  row: string,
  estimate: string,
) {
  await page.waitForFunction(
    ([itemName, wantRow, wantEstimate]) => {
      const fold = (text: string | null | undefined) =>
        (text ?? "").replace(/\s+/g, " ").trim();
      const box = Array.from(
        document.querySelectorAll<HTMLElement>('#pending [role="checkbox"]'),
      ).find((one) => one.getAttribute("aria-label") === itemName);
      const total = box
        ?.closest("[data-item-id]")
        ?.querySelector('[data-slot="list-row-total"]');
      const sum = document.querySelector(
        '#pending [data-slot="estimate"] [data-numeric]',
      );
      return (
        fold(total?.textContent) === wantRow &&
        fold(sum?.textContent) === wantEstimate
      );
    },
    [name, row, estimate] as const,
    { polling: "raf", timeout: CHANGE_MS },
  );
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`phase 3b, price, two members (${colorScheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );

    test("a price and a currency change reach the other member in under a second", async ({
      browser,
    }, testInfo) => {
      test.setTimeout(120_000);
      const alice = await newPlayer(browser, testInfo, colorScheme);
      const bob = await newPlayer(browser, testInfo, colorScheme);
      const a = alice.page;
      const b = bob.page;
      const steps: Step[] = [];

      try {
        // Setup as phase-2b: each gets a list, B becomes a member of A's and
        // loses their own. A's list has one item, per kilo, without price.
        const listA = await openAndCreateList(a);
        const listB = await openAndCreateList(b);
        await field(a).fill("2 kg de tomates");
        await field(a).press("Enter");
        await expect(row(pending(a), "tomates")).toBeVisible();
        // The insert's own event must be over before the channels rejoin, or
        // it reaches the joining page as a change by someone else ("Agregaron").
        await a.waitForTimeout(1500);
        await addMember(listA.id, listB.created_by);
        await deleteList(listB.id);
        const [readA, readB] = await Promise.all([
          reloadJoined(a),
          reloadJoined(b),
        ]);
        expect(readA).toBe(listA.id);
        expect(readB).toBe(listA.id);
        for (const page of [a, b]) {
          await expect(row(pending(page), "tomates")).toBeVisible();
          expect(await totalsOf(page, "tomates")).toEqual({
            row: "",
            estimate: "",
          });
        }

        // Whatever late event the rejoin still brings ends before the steps.
        await Promise.all(
          [a, b].map((page) =>
            page
              .waitForFunction(
                () => (window.__said ?? []).length > 0,
                undefined,
                { timeout: 1500 },
              )
              .catch(() => {}),
          ),
        );
        await a.waitForTimeout(PULSE_END_MS);

        const step = stepper(steps);
        const save = () =>
          editor(b).getByRole("button", { name: e.save, exact: true });
        async function openEditorOfB() {
          await rowName(pending(b), "tomates").click();
          await expect(editor(b)).toBeVisible();
          await b.evaluate(() => document.fonts.ready);
        }

        // 1. B prices the tomatoes, a kilo at 89,50 (the comma decimal): A
        // shows the line (2 kg) and the Pendientes total, the row pulses on A
        // only, A hears one sentence, and B's own row is not touched.
        await openEditorOfB();
        await editor(b)
          .getByRole("textbox", { name: e.price.kg, exact: true })
          .fill("89,50");
        await save().hover();
        await step(
          "1 B sets the price",
          b,
          a,
          ["tomates"],
          [],
          t.remoteChanges.one.edited("tomates"),
          () => save().click(),
          () => showsTotals(a, "tomates", "$ 179", "$ 179"),
        );
        await expect(editor(b)).toBeHidden();
        expect(await totalsOf(b, "tomates")).toEqual({
          row: "$ 179",
          estimate: "$ 179",
        });

        // 2. B changes the currency to dollars: both totals follow on A.
        // A's catalog is read again because of it (step 3 needs that).
        const catalogOfA = a.waitForResponse(
          (response) =>
            response.url().includes("/rest/v1/catalog") &&
            response.request().method() === "GET",
        );
        await openEditorOfB();
        await editor(b)
          .getByRole("radio", { name: DOLLARS, exact: true })
          .click();
        await save().hover();
        await step(
          "2 B sets the currency",
          b,
          a,
          ["tomates"],
          [],
          t.remoteChanges.one.edited("tomates"),
          () => save().click(),
          () => showsTotals(a, "tomates", "US$ 179", "US$ 179"),
        );
        await expect(editor(b)).toBeHidden();
        expect(await totalsOf(b, "tomates")).toEqual({
          row: "US$ 179",
          estimate: "US$ 179",
        });
        await captureViewport(a, testInfo, `a-after-currency-${colorScheme}`);
        await captureViewport(b, testInfo, `b-after-currency-${colorScheme}`);

        // 3. Not measured: A deletes the item and types it again. A's
        // catalog followed B's change through Realtime, so it comes with B's
        // price and currency, with no reload.
        await catalogOfA;
        await rowName(pending(a), "tomates").click();
        await expect(editor(a)).toBeVisible();
        const remove = removeButton(a);
        await remove.click();
        await expect(remove).toHaveAttribute("data-armed", "true");
        await remove.click();
        await expect(row(pending(a), "tomates")).toHaveCount(0);
        await field(a).fill("2 kg de tomates");
        await field(a).press("Enter");
        await expect(row(pending(a), "tomates")).toBeVisible();
        await expect
          .poll(() => totalsOf(a, "tomates"), { timeout: 3000 })
          .toEqual({ row: "US$ 179", estimate: "US$ 179" });
      } finally {
        reportSteps(steps, testInfo, "phase-3b-members");
        await Promise.all([alice.context.close(), bob.context.close()]);
      }
    });
  });
}
