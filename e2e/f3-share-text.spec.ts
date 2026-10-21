import { expect, test, type Page } from "@playwright/test";
import { texts } from "../src/lib/texts";
import { SCHEMES } from "./sharing";
import { seedCatalog, type CatalogSeed } from "./supabase-admin";
import {
  captureViewport,
  catalogLoaded,
  cart,
  checkbox,
  editor,
  editorField,
  field,
  openAndCreateList,
  pending,
  row,
  rowName,
  waitHydrated,
} from "./two-members";

/**
 * docs/improvements.md, F-3, end to end against the local Supabase stack at
 * 375px in light and dark: the button in the header of Pendientes hands
 * what is pending, as a message, to the share sheet of the system (stubbed:
 * a headless phone has none), says nothing when the person closes it, and
 * pasted back in the add field the message gives the same products. Without
 * Web Share it copies, and the bar says so; when not even the copy works,
 * a sheet offers the text, selected, to copy by hand.
 */

const t = texts.sendPending;

// The catalog gives each product its category, as after a few weeks.
const HISTORY: CatalogSeed[] = [
  { name: "Tomates", times: 3, category: "Frutas y verduras" },
  { name: "Leche", times: 3, category: "Fiambres y lácteos" },
  { name: "Pan", times: 3, category: "Panadería" },
];

// What goes out: the route's order, Otros last, the cart (Pan) left out.
const MESSAGE = [
  "Lo que falta:",
  "",
  "*Frutas y verduras:*",
  "- Tomates 2 kg",
  "",
  "*Fiambres y lácteos:*",
  "- Leche ×3 — _descremada, la de caja_",
  "",
  "*Otros:*",
  "- Pilas",
].join("\n");

function bar(page: Page) {
  return page.locator("[data-keyboard-open]");
}

function copiedNotice(page: Page) {
  return bar(page)
    .locator('[data-slot="banner"][data-tone="info"]')
    .filter({ hasText: t.copied });
}

function sendButton(page: Page, name: string) {
  return pending(page).getByRole("button", { name, exact: true });
}

/** navigator.share, recorded: it resolves, or rejects as a closed sheet. */
async function stubWebShare(page: Page) {
  await page.addInitScript(() => {
    const shared: unknown[] = [];
    Object.assign(window, { __shared: shared, __shareMode: "ok" });
    Object.defineProperty(Navigator.prototype, "share", {
      configurable: true,
      value: async (data: unknown) => {
        shared.push(data);
        const mode = (window as unknown as { __shareMode: string }).__shareMode;
        if (mode === "abort") throw new DOMException("closed", "AbortError");
      },
    });
  });
}

function sharedOf(page: Page) {
  return page.evaluate(
    () => (window as unknown as { __shared: unknown[] }).__shared,
  );
}

async function grantClipboard(page: Page) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  });
}

async function openWithHistory(page: Page) {
  const list = await openAndCreateList(page);
  await seedCatalog(list.id, HISTORY);
  const catalog = catalogLoaded(page);
  await page.reload();
  await expect(field(page)).toBeVisible();
  await waitHydrated(page);
  await catalog;
}

async function add(page: Page, typed: string, name: string) {
  await field(page).fill(typed);
  await field(page).press("Enter");
  await expect(row(pending(page), name)).toBeVisible();
}

/** Tomates, Leche with a note, Pilas, and Pan already in the cart. */
async function fillList(page: Page) {
  await add(page, "Tomates 2 kg", "Tomates");
  await add(page, "Leche x3", "Leche");
  await add(page, "Pilas", "Pilas");
  await add(page, "Pan", "Pan");

  await rowName(pending(page), "Leche").click();
  await expect(editor(page)).toBeVisible();
  await editorField(page, texts.editItem.note).fill("descremada, la de caja");
  const save = editor(page).getByRole("button", {
    name: texts.editItem.save,
    exact: true,
  });
  await save.hover();
  await save.click();
  await expect(editor(page)).toHaveCount(0);
  await expect(row(pending(page), "Leche")).toContainText("descremada");

  await checkbox(page, "Pan").click();
  await expect(row(cart(page), "Pan")).toBeVisible();
}

/** A paste in the add field, as the browser dispatches it. */
async function paste(page: Page, text: string) {
  await field(page).focus();
  await field(page).evaluate((input, pasted) => {
    const data = new DataTransfer();
    data.setData("text/plain", pasted);
    input.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
}

for (const scheme of SCHEMES) {
  test.describe(`F-3, what is pending as a message (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("the share sheet gets what is pending, and it pastes back the same", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await stubWebShare(page);
      await openWithHistory(page);
      await fillList(page);

      const send = sendButton(page, t.share);
      await expect(send).toBeVisible();
      // The header's two actions: 44px each, side by side.
      const box = await send.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      await page.evaluate(() => window.scrollTo(0, 0));
      await captureViewport(page, testInfo, `f3-header-${scheme}`);

      await send.tap();
      await expect.poll(async () => (await sharedOf(page)).length).toBe(1);
      expect(await sharedOf(page)).toEqual([{ text: MESSAGE }]);
      // The share sheet of the system said it all.
      await page.waitForTimeout(300);
      await expect(copiedNotice(page)).toHaveCount(0);

      // Closing the share sheet says nothing either.
      await page.evaluate(() => {
        (window as unknown as { __shareMode: string }).__shareMode = "abort";
      });
      await send.tap();
      await expect.poll(async () => (await sharedOf(page)).length).toBe(2);
      await page.waitForTimeout(300);
      await expect(copiedNotice(page)).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);

      // Pasted back, the message names what is already on the list: the
      // review has every product as "Ya está en la lista", nothing to add.
      await paste(page, MESSAGE);
      const review = page.getByRole("dialog", {
        name: texts.addItem.paste.title,
      });
      await expect(review).toBeVisible();
      await expect(review.locator('[data-slot="review-in-list"]')).toHaveText([
        /^Tomates/,
        /^Leche/,
        /^Pilas/,
      ]);
      await expect(review.getByRole("checkbox")).toHaveCount(0);
      await review
        .getByRole("button", { name: texts.sheet.close, exact: true })
        .tap();
      await expect(review).toHaveCount(0);

      // With nothing pending there is nothing to send.
      for (const name of ["Tomates", "Leche", "Pilas"]) {
        await checkbox(page, name).click();
        await expect(row(cart(page), name)).toBeVisible();
      }
      await expect(sendButton(page, t.share)).toHaveCount(0);
      await expect(
        pending(page).getByRole("button", { name: texts.route.open }),
      ).toBeVisible();
    });
  });

  test.describe(`F-3, without Web Share (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("it copies, the bar says so, and a refused copy is offered by hand", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await page.addInitScript(() => {
        Reflect.deleteProperty(Navigator.prototype, "share");
      });
      await openWithHistory(page);
      await fillList(page);
      await grantClipboard(page);

      // No share sheet to open: the button copies, and says so.
      await expect(sendButton(page, t.share)).toHaveCount(0);
      const copy = sendButton(page, t.copy);
      await copy.tap();
      await expect(copiedNotice(page)).toBeVisible();
      await expect(copiedNotice(page)).toContainText(t.copiedBody);
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        MESSAGE,
      );
      await expect(page.locator('[data-slot="add-announcement"]')).toHaveText(
        `${t.copied} ${t.copiedBody}`,
      );
      await captureViewport(page, testInfo, `f3-copied-${scheme}`);

      await copiedNotice(page)
        .getByRole("button", { name: texts.itemErrors.dismiss })
        .tap();
      await expect(copiedNotice(page)).toHaveCount(0);

      // The clipboard refuses: the text, selected, in a sheet.
      await page.evaluate(() => {
        navigator.clipboard.writeText = () =>
          Promise.reject(new Error("denied"));
      });
      await copy.tap();
      const manual = page.getByRole("dialog", { name: t.manual.title });
      await expect(manual).toBeVisible();
      await expect(manual.locator('[data-slot="pending-text"]')).toHaveText(
        MESSAGE,
        { useInnerText: true },
      );
      expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
        MESSAGE,
      );
      await expect(copiedNotice(page)).toHaveCount(0);
      await captureViewport(page, testInfo, `f3-manual-${scheme}`);

      // Closed, the focus goes back to the button that sent it.
      await page.keyboard.press("Escape");
      await expect(manual).toHaveCount(0);
      await expect(copy).toBeFocused();
    });
  });
}
