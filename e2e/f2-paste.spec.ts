import { expect, test, type Page, type Request } from "@playwright/test";
import { texts } from "../src/lib/texts";
import { SCHEMES } from "./sharing";
import { seedCatalog, type CatalogSeed } from "./supabase-admin";
import {
  captureViewport,
  catalogLoaded,
  checkbox,
  field,
  openAndCreateList,
  pending,
  row,
  waitHydrated,
} from "./two-members";

/**
 * docs/improvements.md, F-2, end to end against the local Supabase stack at
 * 375px in light and dark: a list pasted in the add field (several lines,
 * or one with commas) opens a review before anything is added; what stays
 * ticked goes in one request, each as if typed, with its category and
 * price; what is already pending is not added again; a one-line list closed
 * without adding stays in the field. The paste is dispatched to the field
 * as the browser does it (the clipboard of a headless phone is out of reach).
 */

const p = texts.addItem.paste;
const r = texts.addItem.review;

const HISTORY: CatalogSeed[] = [
  {
    name: "Tomates",
    times: 4,
    category: "Frutas y verduras",
    price: 90,
    priceUnit: "kg",
  },
  { name: "Leche", times: 5, category: "Fiambres y lácteos", price: 45 },
];

const MONEY = (amount: number) => new RegExp(`\\$\\s*${amount}\\b`);

function sheet(page: Page) {
  return page.getByRole("dialog", { name: p.title });
}

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

function recordItemPosts(page: Page) {
  const posts: unknown[] = [];
  page.on("request", (request: Request) => {
    if (
      new URL(request.url()).pathname === "/rest/v1/items" &&
      request.method() === "POST"
    ) {
      posts.push(request.postDataJSON());
    }
  });
  return posts;
}

async function openWithHistory(page: Page) {
  const list = await openAndCreateList(page);
  await seedCatalog(list.id, HISTORY);
  const catalog = catalogLoaded(page);
  await page.reload();
  await expect(field(page)).toBeVisible();
  await waitHydrated(page);
  await catalog;
  return list;
}

async function typeAdd(page: Page, name: string) {
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

for (const scheme of SCHEMES) {
  test.describe(`F-2, a pasted list (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("a pasted list is reviewed, then added in one request", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await openWithHistory(page);
      await typeAdd(page, "Pan");
      const posts = recordItemPosts(page);

      await paste(page, "Súper:\n- 2 kg tomates\n- Leche x3\n- Pan\n- Lechuga");
      await expect(sheet(page)).toBeVisible();
      await expect(sheet(page).getByRole("checkbox")).toHaveText([
        /^tomates\s*2 kg$/,
        /^Leche\s*3$/,
        /^Lechuga$/,
      ]);
      // Pan is already pending: shown, nothing to tick.
      await expect(
        sheet(page).locator('[data-slot="review-in-list"]'),
      ).toContainText(["Pan"]);
      await expect(sheet(page).getByText(r.inList)).toBeVisible();
      expect(posts).toEqual([]);
      await captureViewport(page, testInfo, `f2-review-${scheme}`);

      await sheet(page)
        .getByRole("checkbox", { name: /^Lechuga/ })
        .tap();
      await sheet(page)
        .getByRole("button", { name: r.add(2), exact: true })
        .tap();

      await expect(sheet(page)).toHaveCount(0);
      // 2 kg at $ 90 a kilo; 3 at $ 45.
      await expect(row(pending(page), "Tomates")).toContainText(MONEY(180));
      await expect(row(pending(page), "Leche")).toContainText(MONEY(135));
      await expect(checkbox(page, "Pan")).toHaveCount(1);
      await expect(row(pending(page), "Lechuga")).toHaveCount(0);
      await expect.poll(() => posts.length).toBe(1);
      expect((posts[0] as { name: string }[]).map((one) => one.name)).toEqual([
        "Tomates",
        "Leche",
      ]);
      await expect(
        page
          .locator("[data-keyboard-open]")
          .locator('[data-slot="banner"][data-tone="info"]'),
      ).toContainText(texts.addItem.usuals.added(2));
      await expect(field(page)).toBeFocused();
    });

    test("a double tap on Agregar adds once", async ({ page }) => {
      test.setTimeout(90_000);
      await openWithHistory(page);
      const posts = recordItemPosts(page);

      await paste(page, "arroz\nfideos");
      const add = sheet(page).getByRole("button", {
        name: r.add(2),
        exact: true,
      });
      await expect(add).toBeVisible();
      // Where the button ends up: the sheet slides in for 320 ms.
      await page.waitForTimeout(500);
      const box = await add.boundingBox();
      if (!box) throw new Error("Agregar is not on screen");
      // The second tap lands while the sheet slides away.
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

      await expect(sheet(page)).toHaveCount(0);
      await expect(row(pending(page), "Arroz")).toBeVisible();
      await page.waitForTimeout(800);
      expect(posts).toHaveLength(1);
      await expect(checkbox(page, "Arroz")).toHaveCount(1);
    });

    test("a one-line list closed without adding stays in the field", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await openWithHistory(page);
      const posts = recordItemPosts(page);

      await paste(page, "arroz, fideos, 1,5 kg de papas");
      await expect(sheet(page).getByRole("checkbox")).toHaveText([
        /^arroz$/,
        /^fideos$/,
        /^papas\s*1,5 kg$/,
      ]);
      await sheet(page)
        .getByRole("button", { name: texts.sheet.close, exact: true })
        .tap();

      await expect(sheet(page)).toHaveCount(0);
      await expect(field(page)).toHaveValue("arroz, fideos, 1,5 kg de papas");
      expect(posts).toEqual([]);
    });
  });
}
