import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { REFLOW_IDLE_MS } from "../src/components/list/deferred-reflow";
import { SCHEMES } from "./sharing";
import {
  captureViewport,
  cart,
  checkbox,
  field,
  openAndCreateList,
  pending,
  row,
} from "./two-members";

/**
 * docs/improvements.md, A-5, end to end against the local Supabase stack at
 * 375px in light and dark: checks in a burst, tapped by position as a thumb
 * does, land on the rows that were under it. The rows stay in place while
 * the checks come, struck, and go down to the cart together once they stop.
 * Taps are real touches, at the points measured before the first one.
 */

/** Longer than the old hold and travel (320 + 320 ms), shorter than the wait. */
const TAP_GAP_MS = 700;

const PRODUCTS = ["Huevos", "Queso rallado", "Yerba", "Fideos", "Leche"];

/** Adds products and waits for the server to have them all. */
async function addAll(page: Page, names: string[]) {
  for (const name of names) {
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/rest/v1/items" &&
        response.request().method() === "POST",
    );
    await field(page).fill(name);
    await field(page).press("Enter");
    await expect(row(pending(page), name)).toBeVisible();
    expect((await saved).ok()).toBe(true);
  }
}

/** Every check the page sends: the id of the row and its new state. */
function recordChecks(page: Page) {
  const checks: { id: string | null; checked: unknown }[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/rest/v1/items" && request.method() === "PATCH") {
      const body = request.postDataJSON() as { checked?: unknown };
      checks.push({
        id: url.searchParams.get("id")?.replace(/^eq\./, "") ?? null,
        checked: body.checked,
      });
    }
  });
  return checks;
}

/** The rows of Pendientes as shown, top to bottom: name, id and centre. */
async function shownRows(page: Page) {
  return pending(page)
    .locator('[data-item-id] [role="checkbox"]')
    .evaluateAll((boxes) =>
      boxes.map((box) => {
        const rect = box.getBoundingClientRect();
        return {
          name: box.getAttribute("aria-label") ?? "",
          id: box.closest("[data-item-id]")?.getAttribute("data-item-id"),
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
        };
      }),
    );
}

async function attachNow(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

for (const scheme of SCHEMES) {
  test.describe(`A-5, checks in a burst (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("three quick taps by position check the three rows under the thumb", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await openAndCreateList(page);
      await addAll(page, PRODUCTS);
      await field(page).blur();
      // Everything in place before the points are measured.
      await page.waitForTimeout(REFLOW_IDLE_MS);
      const before = await shownRows(page);
      expect(before).toHaveLength(PRODUCTS.length);
      const tapped = before.slice(0, 3);
      const untouched = before.slice(3);
      const checks = recordChecks(page);

      for (const [index, target] of tapped.entries()) {
        if (index > 0) await page.waitForTimeout(TAP_GAP_MS);
        await page.touchscreen.tap(target.x, target.y);
      }
      // Right after the last tap, well inside the wait: every row is still
      // where it was measured.
      const held = await shownRows(page);

      // Checked on the tap, and still where they were: the same points,
      // struck, while the checks may go on.
      expect(held.map(({ name, y }) => ({ name, y }))).toEqual(
        before.map(({ name, y }) => ({ name, y })),
      );
      for (const target of tapped) {
        await expect(row(pending(page), target.name)).toBeVisible();
        await expect(checkbox(page, target.name)).toBeChecked();
      }
      await attachNow(page, testInfo, `a5-burst-held-${scheme}`);

      // The checks stop: the three go down to the cart, the rest stay.
      for (const target of tapped) {
        await expect(row(cart(page), target.name)).toBeVisible();
      }
      for (const target of untouched) {
        await expect(row(pending(page), target.name)).toBeVisible();
        await expect(checkbox(page, target.name)).not.toBeChecked();
      }
      // One write per tap, each for the row that was under it.
      await expect.poll(() => checks.length).toBe(3);
      expect(checks).toEqual(
        tapped.map((target) => ({ id: target.id, checked: true })),
      );
      await captureViewport(page, testInfo, `a5-burst-settled-${scheme}`);
    });

    test("tapping a waiting row again unchecks it in its place", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await openAndCreateList(page);
      // The whole list, as above: with only a few rows the page is at its
      // end, and the add bar that grows with the "al carro" notice scrolls
      // it (use-bar-height.ts), which is not what this test is about.
      await addAll(page, PRODUCTS);
      await field(page).blur();
      await page.waitForTimeout(REFLOW_IDLE_MS);
      const [first] = await shownRows(page);

      await page.touchscreen.tap(first.x, first.y);
      await expect(row(pending(page), first.name)).toBeVisible();
      await expect(checkbox(page, first.name)).toBeChecked();
      // A second tap after the double-tap guard, before the rows go down.
      await page.waitForTimeout(TAP_GAP_MS);
      await page.touchscreen.tap(first.x, first.y);
      await expect(checkbox(page, first.name)).not.toBeChecked();

      await page.waitForTimeout(REFLOW_IDLE_MS + 400);
      await expect(row(pending(page), first.name)).toBeVisible();
      await expect(cart(page).locator("[data-item-id]")).toHaveCount(0);
    });
  });
}
