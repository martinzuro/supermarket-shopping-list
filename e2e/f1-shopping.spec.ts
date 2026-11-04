import { expect, test, type Page, type Request } from "@playwright/test";
import { SHOPPING_KEY } from "../src/components/list/shopping-mode";
import { texts } from "../src/lib/texts";
import { SCHEMES } from "./sharing";
import { adminClient } from "./supabase-admin";
import {
  captureViewport,
  cart,
  checkbox,
  emptyAction,
  field,
  openAndCreateList,
  pending,
  row,
  waitHydrated,
} from "./two-members";

/**
 * docs/improvements.md, F-1 with M-2 and M-3, end to end against the local
 * Supabase stack at 375px in light and dark: "Empezar a comprar" turns the
 * screen into the supermarket's (the header counts what is in the cart, the
 * add bar folds into "+" and "Terminé" with the totals over them, the screen
 * stays on), the mode survives a reload, "Salir" leaves it, and "Terminé"
 * empties the cart into the "Buena compra" moment with its summary, whose
 * Deshacer goes back to shopping. The Screen Wake Lock API is faked
 * (addInitScript): headless Chromium refuses it, and the fake tells when it
 * was asked for and let go.
 */

const s = texts.shopping;
const m = texts.moments.cartEmptied;

declare global {
  interface Window {
    __wakeLock?: { requests: number; releases: number };
  }
}

/** A Screen Wake Lock that grants every request and counts them. */
async function fakeWakeLock(page: Page) {
  await page.addInitScript(() => {
    const log = { requests: 0, releases: 0 };
    window.__wakeLock = log;
    const wakeLock = {
      request: async () => {
        log.requests += 1;
        const sentinel = new EventTarget() as EventTarget & {
          released: boolean;
          type: "screen";
          release: () => Promise<void>;
        };
        sentinel.released = false;
        sentinel.type = "screen";
        sentinel.release = async () => {
          if (sentinel.released) return;
          sentinel.released = true;
          log.releases += 1;
          sentinel.dispatchEvent(new Event("release"));
        };
        return sentinel;
      },
    };
    Object.defineProperty(Navigator.prototype, "wakeLock", {
      configurable: true,
      get: () => wakeLock,
    });
  });
}

function wakeLockLog(page: Page) {
  return page.evaluate(() => window.__wakeLock ?? null);
}

function startButton(page: Page) {
  return page.getByRole("button", { name: s.start, exact: true });
}

function exitButton(page: Page) {
  return page.getByRole("button", { name: s.exitAria, exact: true });
}

function finishButton(page: Page) {
  return page.getByRole("button", { name: s.finish, exact: true });
}

function addButton(page: Page) {
  return page.getByRole("button", { name: s.add, exact: true });
}

function masthead(page: Page) {
  return page.locator('[data-slot="shopping-masthead"]');
}

function progress(page: Page) {
  return page.locator('[data-slot="shopping-count"]');
}

function totals(page: Page) {
  return page.locator('[data-slot="shopping-totals"]');
}

function moment(page: Page) {
  return page.getByRole("group", { name: m.eyebrow });
}

function summary(page: Page) {
  return moment(page).getByRole("definition");
}

function momentAction(page: Page) {
  return moment(page).getByRole("button", { name: m.action, exact: true });
}

/** Every call of the page to the RPC. */
function recordRpc(page: Page, name: string) {
  const calls: unknown[] = [];
  page.on("request", (request: Request) => {
    if (new URL(request.url()).pathname === `/rest/v1/rpc/${name}`) {
      calls.push(request.postDataJSON());
    }
  });
  return calls;
}

function rpcAnswered(page: Page, name: "empty_cart" | "restore_trip") {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/rest/v1/rpc/${name}` &&
      response.request().method() === "POST",
  );
}

/** Adds products and waits for the server to have them all. */
async function addAll(page: Page, names: string[]) {
  for (const text of names) {
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/rest/v1/items" &&
        response.request().method() === "POST",
    );
    await field(page).fill(text);
    await field(page).press("Enter");
    expect((await saved).ok()).toBe(true);
  }
}

/**
 * Prices straight in the database (the edit sheet is phase-3b's), then a
 * reload to read them: Tomates 2 kg at $ 89 the kilo, Leche ×3 at $ 52, Café
 * at US$ 6, Pan without price.
 */
async function priceThem(page: Page, listId: string) {
  const db = adminClient();
  const prices: Record<string, [number, string]> = {
    Tomates: [89, "UYU"],
    Leche: [52, "UYU"],
    Café: [6, "USD"],
  };
  for (const [name, [price, currency]] of Object.entries(prices)) {
    const { error } = await db
      .from("items")
      .update({ estimated_price: price, currency })
      .eq("list_id", listId)
      .eq("name", name);
    if (error) throw error;
  }
  await page.reload();
  await waitHydrated(page);
  await expect(
    row(pending(page), "Tomates").locator('[data-slot="list-row-total"]'),
  ).toHaveText("$ 178");
}

async function checkAndSync(page: Page, name: string) {
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/rest/v1/items" &&
      response.request().method() === "PATCH",
  );
  await checkbox(page, name).click();
  await expect(row(cart(page), name)).toBeVisible();
  expect((await saved).ok()).toBe(true);
}

/** The list of the scene: four products, three with a price. */
async function setScene(page: Page) {
  const list = await openAndCreateList(page);
  // Nothing to buy, nothing to start.
  await expect(startButton(page)).toHaveCount(0);
  await addAll(page, ["Tomates 2 kg", "Leche 3", "Café", "Pan"]);
  await priceThem(page, list.id);
  return list;
}

for (const scheme of SCHEMES) {
  test.describe(`F-1, the shopping mode (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("starts, folds the bar, keeps the screen on, survives a reload and leaves", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await fakeWakeLock(page);
      await setScene(page);
      await field(page).blur();
      await captureViewport(page, testInfo, `f1-before-${scheme}`);

      await startButton(page).click();
      // The header: "Comprando" and how much is in the cart, the share and
      // menu actions out of the way, and the screen held on.
      await expect(masthead(page)).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        `${s.eyebrow}${s.progress(0, 4)}${s.progressTail}`,
      );
      await expect(
        page.getByRole("button", { name: texts.header.menu }),
      ).toBeHidden();
      await expect(exitButton(page)).toBeFocused();
      await expect(masthead(page)).toHaveAttribute("data-wake-lock", "held");
      expect(await wakeLockLog(page)).toEqual({ requests: 1, releases: 0 });
      // The bar: no field, "+" and "Terminé", and what is left to pay.
      await expect(field(page)).toBeHidden();
      await expect(addButton(page)).toBeVisible();
      await expect(finishButton(page)).toBeVisible();
      await expect(totals(page)).toHaveText(
        `${s.totals.remaining}${s.totals.about}${s.totals.aboutSpoken}$ 334 · US$ 6`,
      );
      // "Vaciar el carro" waits: "Terminé" does it.
      await checkAndSync(page, "Tomates");
      await expect(emptyAction(page)).toHaveCount(0);
      await expect(progress(page)).toHaveText(
        `${s.progress(1, 4)}${s.progressTail}`,
      );
      await expect(totals(page)).toContainText(`${s.totals.cart}$ 178`);
      await expect(totals(page)).toContainText(
        `${s.totals.remaining}${s.totals.about}${s.totals.aboutSpoken}$ 156 · US$ 6`,
      );
      // The line on the header's rule is a quarter full.
      await expect
        .poll(() =>
          page
            .locator('[data-slot="shopping-progress"]')
            .evaluate(
              (line) => new DOMMatrix(getComputedStyle(line).transform).a,
            ),
        )
        .toBeCloseTo(0.25, 2);
      await captureViewport(page, testInfo, `f1-shopping-${scheme}`);

      // "+" unfolds the field with the focus; an add counts at once; Escape
      // folds it back, with the focus on "+".
      await addButton(page).click();
      await expect(field(page)).toBeFocused();
      await expect(finishButton(page)).toBeHidden();
      await captureViewport(page, testInfo, `f1-adding-${scheme}`);
      await addAll(page, ["Yerba"]);
      await expect(row(pending(page), "Yerba")).toBeVisible();
      await expect(progress(page)).toHaveText(
        `${s.progress(1, 5)}${s.progressTail}`,
      );
      await field(page).press("Escape");
      await expect(field(page)).toBeHidden();
      await expect(addButton(page)).toBeFocused();
      // A field left empty folds too.
      await addButton(page).click();
      await expect(field(page)).toBeFocused();
      await field(page).blur();
      await expect(field(page)).toBeHidden();
      await expect(finishButton(page)).toBeVisible();

      // A reload finds the trip where it was.
      await page.reload();
      await expect(masthead(page)).toBeVisible();
      await expect(progress(page)).toHaveText(
        `${s.progress(1, 5)}${s.progressTail}`,
      );
      await expect(finishButton(page)).toBeVisible();
      await expect(masthead(page)).toHaveAttribute("data-wake-lock", "held");

      // "Salir" leaves without emptying: the cart is as it was.
      await exitButton(page).click();
      await expect(masthead(page)).toHaveCount(0);
      await expect(startButton(page)).toBeFocused();
      await expect(field(page)).toBeVisible();
      await expect(finishButton(page)).toHaveCount(0);
      await expect(emptyAction(page)).toBeVisible();
      await expect(row(cart(page), "Tomates")).toBeVisible();
      expect(
        await page.evaluate((key) => localStorage.getItem(key), SHOPPING_KEY),
      ).toBeNull();
      expect(await wakeLockLog(page)).toEqual({ requests: 1, releases: 1 });
    });

    test("Terminé empties the cart into the moment with its summary, and Deshacer goes back to shopping", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await fakeWakeLock(page);
      await setScene(page);
      await field(page).blur();
      await startButton(page).click();
      for (const name of ["Tomates", "Leche", "Café"]) {
        await checkAndSync(page, name);
      }
      await expect(progress(page)).toHaveText(
        `${s.progress(3, 4)}${s.progressTail}`,
      );
      const emptyCalls = recordRpc(page, "empty_cart");
      const emptied = rpcAnswered(page, "empty_cart");

      await finishButton(page).click();
      // The moment, in view, with the summary of the trip (M-3), and the
      // usual screen back.
      await expect(moment(page)).toBeVisible();
      await expect(momentAction(page)).toBeFocused();
      await expect(moment(page)).toBeInViewport({ ratio: 0.6 });
      await expect(summary(page)).toHaveText([
        `3 ${m.summary.products(3)}`,
        "$ 334 · US$ 6",
        `1 ${m.summary.products(1)}`,
      ]);
      await expect(moment(page)).toContainText(m.body);
      await expect(masthead(page)).toHaveCount(0);
      await expect(field(page)).toBeVisible();
      await expect(row(pending(page), "Pan")).toBeVisible();
      expect((await emptied).ok()).toBe(true);
      expect(emptyCalls).toHaveLength(1);
      expect(await wakeLockLog(page)).toEqual({ requests: 1, releases: 1 });
      // Said once for whoever hears it: the headline, then the summary.
      await expect(
        page.locator('[aria-live="polite"]').filter({ hasText: m.lead }),
      ).toHaveText(
        `${m.lead} ${m.em}. ${m.body} ${m.summary.checkout}: 3 ${m.summary.products(3)}. ${m.summary.estimate}: $ 334 · US$ 6. ${m.summary.remaining}: 1 ${m.summary.products(1)}.`,
      );
      await captureViewport(page, testInfo, `f1-moment-${scheme}`);

      // Deshacer: the cart comes back, and so does the trip, with the focus
      // on "Terminé".
      const restored = rpcAnswered(page, "restore_trip");
      await moment(page)
        .getByRole("button", { name: m.undo, exact: true })
        .click();
      expect((await restored).ok()).toBe(true);
      await expect(moment(page)).toHaveCount(0);
      for (const name of ["Tomates", "Leche", "Café"]) {
        await expect(row(cart(page), name)).toBeVisible();
      }
      await expect(masthead(page)).toBeVisible();
      await expect(progress(page)).toHaveText(
        `${s.progress(3, 4)}${s.progressTail}`,
      );
      await expect(finishButton(page)).toBeFocused();
      await expect(masthead(page)).toHaveAttribute("data-wake-lock", "held");
    });

    test("Terminé with nothing in the cart only ends the trip; Vaciar el carro tells the summary too", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await setScene(page);
      await field(page).blur();
      const emptyCalls = recordRpc(page, "empty_cart");
      await startButton(page).click();
      await finishButton(page).click();
      await expect(masthead(page)).toHaveCount(0);
      await expect(startButton(page)).toBeFocused();
      await expect(moment(page)).toHaveCount(0);
      expect(emptyCalls).toHaveLength(0);

      // Out of the mode, the usual way to empty the cart, with nothing left
      // pending: the moment says so.
      for (const name of ["Tomates", "Leche", "Café", "Pan"]) {
        await checkAndSync(page, name);
      }
      const emptied = rpcAnswered(page, "empty_cart");
      await emptyAction(page).click();
      expect((await emptied).ok()).toBe(true);
      await expect(moment(page)).toContainText(m.bodyDone);
      await expect(summary(page)).toContainText([
        `4 ${m.summary.products(4)}`,
        "$ 334 · US$ 6",
        m.summary.nothing,
      ]);
      await expect(
        moment(page).locator('[data-slot="trip-summary-estimate"]'),
      ).toContainText(texts.list.estimate.covered(3, 4));

      // Its Deshacer brings the cart back, not a trip that never started.
      const restored = rpcAnswered(page, "restore_trip");
      await moment(page)
        .getByRole("button", { name: m.undo, exact: true })
        .click();
      expect((await restored).ok()).toBe(true);
      await expect(emptyAction(page)).toBeFocused();
      await expect(masthead(page)).toHaveCount(0);
      await expect(field(page)).toBeVisible();
    });
  });
}
