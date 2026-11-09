import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
  type Request,
} from "@playwright/test";
import { texts } from "../src/lib/texts";
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
 * docs/improvements.md, M-9, end to end against the local Supabase stack at
 * 375px in light and dark: "Borrar" in the edit sheet deletes with one tap,
 * a pending row deletes by swiping it to the left, and the bar's notice
 * brings back everything deleted while it shows, whole and in its place.
 * Swipes are real touches (CDP), so the browser decides scroll against drag
 * as on a phone.
 */

const r = texts.list.removed;

function bar(page: Page) {
  return page.locator("[data-keyboard-open]");
}

function notice(page: Page) {
  return bar(page).locator('[data-slot="banner"][data-tone="info"]');
}

function undo(page: Page, names: string[]) {
  return page.getByRole("button", { name: r.undoAria(names), exact: true });
}

function editor(page: Page) {
  return page.getByRole("dialog", { name: texts.editItem.title });
}

/** The visible part of a row: its name, amount and price. */
async function rowText(section: Locator, name: string) {
  return row(section, name).innerText();
}

/** The names of the pending rows, top to bottom. */
function pendingNames(page: Page) {
  return pending(page)
    .locator('[data-slot="list-row-name"] > span > span:first-child')
    .allInnerTexts();
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

function itemWriteAnswered(page: Page) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/rest/v1/items" &&
      response.request().method() === "PATCH",
  );
}

/** The answer to "Deshacer": the update that clears deleted_at. */
function undoAnswered(page: Page) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/rest/v1/items" &&
      response.request().method() === "PATCH" &&
      (response.request().postDataJSON() as { deleted_at?: unknown })
        .deleted_at === null,
  );
}

async function addAll(page: Page, typed: [text: string, name: string][]) {
  for (const [text, name] of typed) {
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/rest/v1/items" &&
        response.request().method() === "POST",
    );
    await field(page).fill(text);
    await field(page).press("Enter");
    await expect(row(pending(page), name)).toBeVisible();
    expect((await saved).ok()).toBe(true);
  }
}

/**
 * A finger on the row's middle that moves by (dx, dy) in small steps, as a
 * thumb does, and lifts unless `hold`.
 */
async function drag(
  page: Page,
  cdp: CDPSession,
  target: Locator,
  dx: number,
  dy: number,
  { hold = false, steps = 12 } = {},
) {
  const box = await target.boundingBox();
  if (!box) throw new Error("the row is not on screen");
  const x = box.x + box.width * 0.6;
  const y = box.y + box.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let step = 1; step <= steps; step++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + (dx * step) / steps, y: y + (dy * step) / steps }],
    });
    await page.waitForTimeout(16);
  }
  if (hold) return () => lift(cdp);
  await lift(cdp);
  return async () => {};
}

async function lift(cdp: CDPSession) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

for (const scheme of SCHEMES) {
  test.describe(`M-9, delete with one tap or a swipe, and undo (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("Borrar in the sheet takes one tap, and Deshacer brings it back whole", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await openAndCreateList(page);
      await addAll(page, [
        ["Pan", "Pan"],
        ["2 L de leche", "Leche"],
        ["Yerba", "Yerba"],
      ]);
      await field(page).blur();
      const before = await rowText(pending(page), "Leche");
      const order = await pendingNames(page);
      const writes = recordItemWrites(page);

      await row(pending(page), "Leche")
        .locator('[data-slot="list-row-name"]')
        .tap();
      await expect(editor(page)).toBeVisible();
      const deleted = itemWriteAnswered(page);
      await editor(page)
        .getByRole("button", { name: texts.editItem.remove, exact: true })
        .tap();

      await expect(editor(page)).toBeHidden();
      await expect(row(pending(page), "Leche")).toHaveCount(0);
      await expect(notice(page)).toContainText(r.notice(["Leche"]));
      // The focus is on Deshacer, not on the field: no keyboard pops up.
      await expect(undo(page, ["Leche"])).toBeFocused();
      await expect(field(page)).not.toBeFocused();
      expect((await deleted).ok()).toBe(true);
      await captureViewport(page, testInfo, `m9-removed-notice-${scheme}`);

      const restored = undoAnswered(page);
      await undo(page, ["Leche"]).tap();
      await expect(row(pending(page), "Leche")).toBeVisible();
      await expect(notice(page)).toHaveCount(0);
      expect((await restored).ok()).toBe(true);
      // The same row, in the same place, with its amount.
      expect(await pendingNames(page)).toEqual(order);
      expect(await rowText(pending(page), "Leche")).toBe(before);
      await expect(
        row(pending(page), "Leche").locator('[data-slot="list-row-name"]'),
      ).toBeFocused();
      // One request to delete, one to bring it back; nothing inserted.
      expect(writes.map((write) => write.method)).toEqual(["PATCH", "PATCH"]);
      expect(writes[0].body).toEqual({ deleted_at: expect.any(String) });
      expect(writes[1].body).toEqual({ deleted_at: null });

      await page.reload();
      await expect(row(pending(page), "Leche")).toBeVisible();
      expect(await pendingNames(page)).toEqual(order);
    });

    test("swiping a row to the left deletes it; a short swipe or a scroll does not", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await openAndCreateList(page);
      await addAll(page, [
        ["Pan", "Pan"],
        ["Leche", "Leche"],
        ["Yerba", "Yerba"],
        ["Café", "Café"],
      ]);
      await field(page).blur();
      const order = await pendingNames(page);
      const cdp = await page.context().newCDPSession(page);
      const writes = recordItemWrites(page);

      // Short of the threshold: the row goes back, nothing is deleted.
      await drag(page, cdp, row(pending(page), "Pan"), -80, 0);
      await page.waitForTimeout(600);
      await expect(row(pending(page), "Pan")).toBeVisible();
      await expect(notice(page)).toHaveCount(0);
      // All the way back, not a pixel short: the check stays whole.
      await expect(
        row(pending(page), "Pan")
          .locator('[data-slot="swipe-to-remove"] > div')
          .last(),
      ).toHaveCSS("transform", "none");
      await expect(
        row(pending(page), "Pan").locator('[data-slot="swipe-to-remove"]'),
      ).toHaveCSS("overflow", "visible");

      // Mostly vertical: a scroll, never a drag of the row.
      await drag(page, cdp, row(pending(page), "Pan"), -30, -160);
      await page.waitForTimeout(600);
      await expect(row(pending(page), "Pan")).toBeVisible();
      expect(writes).toEqual([]);
      await expect(editor(page)).toBeHidden();
      await expect(checkbox(page, "Pan")).not.toBeChecked();

      // Past the threshold, held: the danger shows, armed.
      const swipe = row(pending(page), "Leche").locator(
        '[data-slot="swipe-to-remove"]',
      );
      const release = await drag(
        page,
        cdp,
        row(pending(page), "Leche"),
        -220,
        0,
        {
          hold: true,
        },
      );
      await expect(swipe).toHaveAttribute("data-armed", "true");
      await captureViewport(page, testInfo, `m9-swipe-armed-${scheme}`);
      const deleted = itemWriteAnswered(page);
      await release();
      await expect(row(pending(page), "Leche")).toHaveCount(0);
      await expect(notice(page)).toContainText(r.notice(["Leche"]));
      expect((await deleted).ok()).toBe(true);
      // Nothing was tapped on the way: no sheet, no check.
      await expect(editor(page)).toBeHidden();
      await expect(field(page)).not.toBeFocused();

      // A second one while the notice shows: one notice for both.
      await drag(page, cdp, row(pending(page), "Yerba"), -240, 0);
      await expect(row(pending(page), "Yerba")).toHaveCount(0);
      await expect(notice(page)).toContainText(r.notice(["Leche", "Yerba"]));

      const restored = undoAnswered(page);
      await undo(page, ["Leche", "Yerba"]).tap();
      await expect(row(pending(page), "Leche")).toBeVisible();
      await expect(row(pending(page), "Yerba")).toBeVisible();
      expect((await restored).ok()).toBe(true);
      expect(await pendingNames(page)).toEqual(order);
      // Two deletes and one undo for both.
      expect(writes.map((write) => write.body)).toEqual([
        { deleted_at: expect.any(String) },
        { deleted_at: expect.any(String) },
        { deleted_at: null },
      ]);

      await page.reload();
      await expect(row(pending(page), "Yerba")).toBeVisible();
      expect(await pendingNames(page)).toEqual(order);
    });

    test("a row in the cart does not swipe", async ({ page }) => {
      test.setTimeout(60_000);
      await openAndCreateList(page);
      await addAll(page, [["Pan", "Pan"]]);
      await field(page).blur();
      const checked = itemWriteAnswered(page);
      await checkbox(page, "Pan").tap();
      await expect(row(cart(page), "Pan")).toBeVisible();
      expect((await checked).ok()).toBe(true);

      const cdp = await page.context().newCDPSession(page);
      const writes = recordItemWrites(page);
      await drag(page, cdp, row(cart(page), "Pan"), -260, 0);
      await page.waitForTimeout(600);
      await expect(row(cart(page), "Pan")).toBeVisible();
      // The check's own notice (A-4) may still show; no delete's.
      await expect(page.getByText(r.notice(["Pan"]))).toHaveCount(0);
      expect(writes).toEqual([]);
    });
  });
}
