import { expect, test, type Page, type Request } from "@playwright/test";
import { texts } from "../src/lib/texts";
import { SCHEMES } from "./sharing";
import { seedCatalog, type CatalogSeed } from "./supabase-admin";
import {
  captureViewport,
  catalogLoaded,
  field,
  openAndCreateList,
  pending,
  row,
  waitHydrated,
} from "./two-members";

/**
 * docs/improvements.md, A-3, end to end against the local Supabase stack, for
 * one member at 375px in light and dark: "Lo de siempre" opens a review with
 * every usual product ticked, in route order and with the quantity it comes
 * back with; what stays ticked is added in one request. The frequents bring
 * that quantity too, and with it a price per kilo. Taps are real touches.
 */

const u = texts.addItem.usuals;

/** Four usual products; Tomates is bought by 2 kg at $ 90 a kilo. */
const HISTORY: CatalogSeed[] = [
  {
    name: "Tomates",
    times: 4,
    category: "Frutas y verduras",
    price: 90,
    priceUnit: "kg",
    quantity: 2,
    quantityUnit: "kg",
  },
  {
    name: "Leche",
    times: 5,
    category: "Fiambres y lácteos",
    price: 45,
    quantity: 3,
  },
  { name: "Arroz", times: 6, category: "Almacén", price: 62 },
  { name: "Pan", times: 3, category: "Panadería" },
];

const MONEY = (amount: number) => new RegExp(`\\$\\s*${amount}\\b`);

function usualsButton(page: Page, count: number) {
  return page
    .getByRole("group", { name: texts.addItem.frequents })
    .getByRole("button", { name: u.aria(count), exact: true });
}

function sheet(page: Page) {
  return page.getByRole("dialog", { name: u.title });
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

for (const scheme of SCHEMES) {
  test.describe(`A-3, the review of Lo de siempre (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("the review shows what comes back and adds only what stays ticked", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await openWithHistory(page);
      const posts = recordItemPosts(page);

      await usualsButton(page, 4).tap();
      const review = sheet(page);
      await expect(review).toBeVisible();
      const rows = review.getByRole("checkbox");
      // Route order, each ticked, with the quantity it comes back with.
      await expect(rows).toHaveText([
        /^Tomates\s*2 kg$/,
        /^Leche\s*3$/,
        /^Pan$/,
        /^Arroz$/,
      ]);
      for (const one of await rows.all()) {
        await expect(one).toHaveAttribute("aria-checked", "true");
      }
      // Thumb-sized rows, and the add button in view with the list.
      for (const one of await rows.all()) {
        const box = await one.boundingBox();
        expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44);
      }
      await expect(
        review.getByRole("button", {
          name: texts.addItem.review.add(4),
          exact: true,
        }),
      ).toBeInViewport();
      await captureViewport(page, testInfo, `a3-review-${scheme}`);

      // Leche is still at home.
      await review.getByRole("checkbox", { name: /^Leche/ }).tap();
      await expect(
        review.getByRole("checkbox", { name: /^Leche/ }),
      ).toHaveAttribute("aria-checked", "false");
      expect(posts).toEqual([]);
      await review
        .getByRole("button", { name: texts.addItem.review.add(3), exact: true })
        .tap();

      await expect(review).toHaveCount(0);
      await expect(row(pending(page), "Tomates")).toContainText("2 kg");
      // 2 kg at $ 90 a kilo.
      await expect(row(pending(page), "Tomates")).toContainText(MONEY(180));
      await expect(row(pending(page), "Pan")).toBeVisible();
      await expect(row(pending(page), "Arroz")).toBeVisible();
      await expect(row(pending(page), "Leche")).toHaveCount(0);
      await expect(field(page)).toBeFocused();
      await expect.poll(() => posts.length).toBe(1);
      expect((posts[0] as { name: string }[]).map((one) => one.name)).toEqual([
        "Tomates",
        "Pan",
        "Arroz",
      ]);
    });

    test("a frequent comes with the quantity it is bought in", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await openWithHistory(page);

      await page
        .getByRole("group", { name: texts.addItem.frequents })
        .getByRole("button", {
          name: texts.addItem.addProduct("Leche"),
          exact: true,
        })
        .tap();

      await expect(row(pending(page), "Leche")).toContainText("3");
      // 3 at $ 45 each.
      await expect(row(pending(page), "Leche")).toContainText(MONEY(135));
      await expect(field(page)).toBeFocused();
    });

    test("closing the review adds nothing", async ({ page }) => {
      test.setTimeout(90_000);
      await openWithHistory(page);
      const posts = recordItemPosts(page);

      await usualsButton(page, 4).tap();
      await expect(sheet(page)).toBeVisible();
      await sheet(page)
        .getByRole("button", { name: texts.sheet.close, exact: true })
        .tap();

      await expect(sheet(page)).toHaveCount(0);
      await expect(usualsButton(page, 4)).toBeVisible();
      await page.waitForTimeout(300);
      expect(posts).toEqual([]);
    });
  });
}
