import { expect, test, type Page, type Request } from "@playwright/test";
import { texts } from "../src/lib/texts";
import { SCHEMES, menuSheet } from "./sharing";
import { seedCatalog, type CatalogSeed } from "./supabase-admin";
import {
  captureViewport,
  catalogLoaded,
  field,
  openAndCreateList,
  waitHydrated,
} from "./two-members";

/**
 * docs/improvements.md, M-5, end to end against the local Supabase stack at
 * 375px in light and dark: "Productos guardados" in the menu lists what the
 * catalog remembers, finds a product typed wrong, and forgets it with the
 * light confirmation (two taps, one DELETE); from then on it is not
 * suggested, also after a reload. Taps are real touches.
 */

const p = texts.products;

const HISTORY: CatalogSeed[] = [
  { name: "Tomatse", times: 1, category: "Frutas y verduras" },
  { name: "Tomates", times: 4, category: "Frutas y verduras", price: 90 },
  { name: "Leche", times: 5, category: "Fiambres y lácteos", price: 45 },
];

function products(page: Page) {
  return menuSheet(page).getByTestId("products-section");
}

function productRows(page: Page) {
  return products(page).locator('[data-slot="product-row"]');
}

function suggestions(page: Page) {
  return page.getByRole("option");
}

function recordCatalogDeletes(page: Page) {
  const deletes: string[] = [];
  page.on("request", (request: Request) => {
    const url = new URL(request.url());
    if (url.pathname === "/rest/v1/catalog" && request.method() === "DELETE") {
      deletes.push(url.search);
    }
  });
  return deletes;
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

async function openMenu(page: Page) {
  await page
    .getByRole("button", { name: texts.header.menu, exact: true })
    .tap();
  await expect(menuSheet(page)).toBeVisible();
}

for (const scheme of SCHEMES) {
  test.describe(`M-5, forget a product (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("a product typed wrong is forgotten from the menu and no longer suggested", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await openWithHistory(page);

      // The typo comes up while typing.
      await field(page).fill("tom");
      await expect(suggestions(page)).toHaveCount(2);
      await expect(suggestions(page).first()).toContainText("Tomatse");
      await field(page).fill("");
      await field(page).blur();

      await openMenu(page);
      await expect(
        products(page).getByRole("heading", { name: p.title }),
      ).toBeVisible();
      // Alphabetical, each with how often it was added.
      await expect(productRows(page)).toHaveText([
        /^Leche.*5 veces/,
        /^Tomates.*4 veces/,
        /^Tomatse.*1 vez/,
      ]);
      await products(page)
        .getByRole("textbox", { name: p.search })
        .fill("tomat");
      await expect(productRows(page)).toHaveCount(2);

      const deletes = recordCatalogDeletes(page);
      await products(page)
        .getByRole("button", { name: p.forget.label("Tomatse"), exact: true })
        .tap();
      const confirm = products(page).getByRole("button", {
        name: p.forget.confirmLabel("Tomatse"),
        exact: true,
      });
      await expect(confirm).toBeVisible();
      await captureViewport(page, testInfo, `m5-confirm-${scheme}`);
      // Past the guard against an accidental double tap.
      await page.waitForTimeout(400);
      await confirm.tap();

      await expect(productRows(page)).toHaveCount(1);
      await expect(productRows(page).first()).toContainText("Tomates");
      await expect.poll(() => deletes.length).toBe(1);
      expect(deletes[0]).toContain("name_normalized=eq.tomatse");

      // Not suggested any more, also after a reload (the server forgot it).
      await page.keyboard.press("Escape");
      await expect(menuSheet(page)).toHaveCount(0);
      await field(page).fill("tom");
      await expect(suggestions(page)).toHaveCount(1);
      await expect(suggestions(page).first()).toContainText("Tomates");
      const catalog = catalogLoaded(page);
      await page.reload();
      await waitHydrated(page);
      await catalog;
      await field(page).fill("tom");
      await expect(suggestions(page)).toHaveCount(1);
      await expect(suggestions(page).first()).toContainText("Tomates");
    });
  });
}
