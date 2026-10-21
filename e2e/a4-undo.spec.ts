import { expect, test, type Page, type Request } from "@playwright/test";
import { texts } from "../src/lib/texts";
import { SCHEMES } from "./sharing";
import { addMember, deleteList } from "./supabase-admin";
import {
  CHANGE_MS,
  captureViewport,
  cart,
  checkbox,
  emptyAction,
  field,
  newPlayer,
  openAndCreateList,
  pending,
  reloadJoined,
  row,
} from "./two-members";

/**
 * docs/improvements.md, A-4, end to end against the local Supabase stack at
 * 375px in light and dark: a check leaves an undo in the bar ("“X” al carro",
 * Deshacer), a quick second tap at the same spot is not a second check, and
 * the emptied cart's moment has a Deshacer that brings the cart back, for
 * the other member too. Taps are real touches.
 */

/**
 * The steps that only set the scene for the measured one get more than a
 * second: on a loaded machine the local Realtime is slower, and the
 * criterion is for the undo.
 */
const SETUP_MS = 5000;

const c = texts.list.cart;
const m = texts.moments.cartEmptied;

function bar(page: Page) {
  return page.locator("[data-keyboard-open]");
}

function checkNotice(page: Page) {
  return bar(page).locator('[data-slot="banner"][data-tone="info"]');
}

function moment(page: Page) {
  return page.getByRole("group", { name: m.eyebrow });
}

/** Every request of the page that writes items, with its method and body. */
function recordItemWrites(page: Page) {
  const writes: { method: string; body: unknown }[] = [];
  page.on("request", (request: Request) => {
    const url = new URL(request.url());
    if (
      url.pathname === "/rest/v1/items" &&
      ["POST", "PATCH", "DELETE"].includes(request.method())
    ) {
      writes.push({ method: request.method(), body: request.postDataJSON() });
    }
  });
  return writes;
}

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

/** Waits for the list's writes to be answered (the check, the emptying...). */
function itemWriteAnswered(page: Page) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/rest/v1/items" &&
      response.request().method() === "PATCH",
  );
}

for (const scheme of SCHEMES) {
  test.describe(`A-4, undo a check and an emptying (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("a check leaves an undo in the bar, and a quick second tap does nothing", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await openAndCreateList(page);
      await addAll(page, ["Tomates", "Bananas", "Leche"]);
      await field(page).blur();
      const writes = recordItemWrites(page);

      // Two taps at the same spot, as a hurried thumb does: the first checks
      // Tomates; the second would land on it still in place, or on Bananas
      // once it slid up. Neither happens.
      const box = await checkbox(page, "Tomates").boundingBox();
      if (!box) throw new Error("Tomates is not on screen");
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.touchscreen.tap(x, y);
      await page.touchscreen.tap(x, y);
      await expect(row(cart(page), "Tomates")).toBeVisible();
      await expect(row(pending(page), "Bananas")).toBeVisible();
      await expect(row(pending(page), "Leche")).toBeVisible();
      await expect.poll(() => writes.length).toBe(1);
      await page.waitForTimeout(500);
      expect(writes).toHaveLength(1);

      // The bar offers to take it back, without going down to the cart.
      await expect(checkNotice(page)).toContainText(c.checked("Tomates"));
      await captureViewport(page, testInfo, `a4-check-notice-${scheme}`);
      const answered = itemWriteAnswered(page);
      await checkNotice(page)
        .getByRole("button", { name: c.undoAria("Tomates"), exact: true })
        .tap();
      await expect(row(pending(page), "Tomates")).toBeVisible();
      await expect(row(cart(page), "Tomates")).toHaveCount(0);
      await expect(checkNotice(page)).toHaveCount(0);
      expect((await answered).ok()).toBe(true);
      expect(writes.at(-1)).toEqual({
        method: "PATCH",
        body: { checked: false, checked_at: null },
      });
    });

    test("the moment of the emptied cart has a Deshacer that brings it back", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await openAndCreateList(page);
      await addAll(page, ["Leche", "Pan", "Yerba"]);
      await field(page).blur();
      for (const name of ["Leche", "Pan"]) {
        const answered = itemWriteAnswered(page);
        await checkbox(page, name).tap();
        await expect(row(cart(page), name)).toBeVisible();
        expect((await answered).ok()).toBe(true);
      }

      const emptied = itemWriteAnswered(page);
      await emptyAction(page).tap();
      await expect(moment(page)).toBeVisible();
      expect((await emptied).ok()).toBe(true);
      const undo = moment(page).getByRole("button", {
        name: m.undo,
        exact: true,
      });
      await expect(undo).toBeVisible();
      await captureViewport(page, testInfo, `a4-moment-${scheme}`);

      const writes = recordItemWrites(page);
      const restored = itemWriteAnswered(page);
      await undo.tap();
      // Back in the cart at once, and the moment gives way to it.
      await expect(row(cart(page), "Leche")).toBeVisible();
      await expect(row(cart(page), "Pan")).toBeVisible();
      await expect(moment(page)).toHaveCount(0);
      await expect(emptyAction(page)).toBeFocused();
      expect((await restored).ok()).toBe(true);
      expect(writes).toEqual([{ method: "PATCH", body: { deleted_at: null } }]);

      // And on the server: a reload shows the same cart.
      await page.reload();
      await expect(row(cart(page), "Leche")).toBeVisible();
      await expect(row(cart(page), "Pan")).toBeVisible();
      await expect(row(pending(page), "Yerba")).toBeVisible();
    });
  });
}

test.describe("A-4, a rejected Deshacer of the emptying", () => {
  test.skip(
    process.env.E2E_SUPABASE !== "1",
    "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
  );
  test.use({ viewport: { width: 375, height: 812 } });

  test("brings the moment back, to try again, and says so", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openAndCreateList(page);
    await addAll(page, ["Leche"]);
    await field(page).blur();
    const checked = itemWriteAnswered(page);
    await checkbox(page, "Leche").tap();
    expect((await checked).ok()).toBe(true);
    const emptied = itemWriteAnswered(page);
    await emptyAction(page).tap();
    expect((await emptied).ok()).toBe(true);

    // The server refuses to bring them back.
    await page.route(/\/rest\/v1\/items(\?|$)/, async (route) => {
      const body = route.request().postDataJSON() as {
        deleted_at?: unknown;
      } | null;
      if (route.request().method() !== "PATCH" || body?.deleted_at !== null) {
        return route.continue();
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          code: "42501",
          message: "new row violates row-level security policy",
        }),
      });
    });
    await moment(page).getByRole("button", { name: m.undo, exact: true }).tap();
    // Optimistic first...
    await expect(row(cart(page), "Leche")).toBeVisible();
    // ...then the rejection: the cart is empty again, the moment is back with
    // its Deshacer, and the bar says it did not work.
    const alert = bar(page).getByRole("alert");
    await expect(alert).toContainText(texts.itemErrors.restoreCart);
    await expect(row(cart(page), "Leche")).toHaveCount(0);
    await expect(
      moment(page).getByRole("button", { name: m.undo, exact: true }),
    ).toBeVisible();
  });
});

test.describe("A-4, the other member sees the cart come back", () => {
  test.skip(
    process.env.E2E_SUPABASE !== "1",
    "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
  );

  test("an undone emptying reaches the other member in under a second", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120_000);
    const alice = await newPlayer(browser, testInfo, "light");
    const bob = await newPlayer(browser, testInfo, "light");
    const a = alice.page;
    const b = bob.page;
    try {
      // B joins A's list, as in phase-2b.
      const listA = await openAndCreateList(a);
      const listB = await openAndCreateList(b);
      await addMember(listA.id, listB.created_by);
      await deleteList(listB.id);
      await Promise.all([reloadJoined(a), reloadJoined(b)]);
      await addAll(a, ["Leche", "Pan"]);
      await field(a).blur();
      for (const name of ["Leche", "Pan"]) {
        const answered = itemWriteAnswered(a);
        await checkbox(a, name).tap();
        expect((await answered).ok()).toBe(true);
        // Setup: what is measured is the undo, below.
        await expect(row(cart(b), name)).toBeVisible({ timeout: SETUP_MS });
      }

      const emptied = itemWriteAnswered(a);
      await emptyAction(a).tap();
      expect((await emptied).ok()).toBe(true);
      for (const name of ["Leche", "Pan"]) {
        await expect(row(cart(b), name)).toHaveCount(0, { timeout: SETUP_MS });
      }

      await moment(a).getByRole("button", { name: m.undo, exact: true }).tap();
      const started = Date.now();
      for (const name of ["Leche", "Pan"]) {
        await expect(row(cart(b), name)).toBeVisible({ timeout: CHANGE_MS });
      }
      testInfo.annotations.push({
        type: "timing",
        description: `A taps Deshacer -> both rows back on B: ${Date.now() - started} ms`,
      });
    } finally {
      await Promise.all([alice.context.close(), bob.context.close()]);
    }
  });
});
