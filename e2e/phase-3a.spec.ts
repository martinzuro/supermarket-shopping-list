import { expect, test, type Locator, type Page } from "@playwright/test";
import { texts } from "../src/lib/texts";
import { SCHEMES } from "./sharing";
import { categoryIds, setCategory } from "./supabase-admin";
import {
  captureViewport,
  catalogLoaded,
  editor,
  openAndCreateList,
  pending,
  removeButton,
  row,
  rowName,
  waitHydrated,
  field,
  type CreatedList,
} from "./two-members";

/**
 * Phase 3, part (a), end to end against the local Supabase stack, for one
 * member at 375px in light and dark: the category of an item chosen in its
 * edit sheet (and learned by the catalog), and the route ("Recorrido")
 * reordered from its own sheet, with Pendientes following it, the focus kept
 * on the pressed arrow, and nothing sliding with reduced motion.
 */

const t = texts;
const IDENTITY = ["none", "matrix(1, 0, 0, 1, 0, 0)"];

function routeButton(page: Page) {
  return pending(page).getByRole("button", { name: t.route.open, exact: true });
}

/**
 * Every alert of the page that says a move was rejected (not Next's own
 * empty route announcer, which is a role="alert" too).
 */
function notices(page: Page) {
  return page
    .getByRole("alert")
    .filter({ hasText: t.route.error.title("Frutas y verduras") });
}

function routeSheet(page: Page) {
  return page.getByRole("dialog", { name: t.route.title });
}

function routeRows(page: Page) {
  return routeSheet(page).locator('[data-slot="route-row"]');
}

function arrow(page: Page, direction: "up" | "down", name: string) {
  return routeSheet(page).getByRole("button", {
    name: direction === "up" ? t.route.up(name) : t.route.down(name),
    exact: true,
  });
}

async function routeOrder(page: Page) {
  return routeRows(page).evaluateAll((rows) =>
    rows.map((row) => row.querySelector(".text-row")?.textContent),
  );
}

/** The names of the category groups of Pendientes, top to bottom. */
function groupTitles(page: Page) {
  return pending(page)
    .locator("h3")
    .evaluateAll((titles) =>
      titles.map((title) => title.querySelector("span.truncate")?.textContent),
    );
}

function group(page: Page, name: string) {
  return pending(page)
    .locator("section")
    .filter({
      has: page.locator("h3 span.truncate", {
        hasText: new RegExp(`^${name}$`),
      }),
    });
}

function chip(page: Page, name: string) {
  return editor(page)
    .getByRole("group", { name: t.editItem.category })
    .getByRole("button", { name, exact: true });
}

async function openEditor(page: Page, name: string) {
  await rowName(pending(page), name).click();
  await expect(editor(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function saveEditor(page: Page) {
  await editor(page)
    .getByRole("button", { name: t.editItem.save, exact: true })
    .click();
  await expect(editor(page)).toBeHidden();
}

async function reload(page: Page) {
  const catalog = catalogLoaded(page);
  await page.reload();
  await expect(field(page)).toBeVisible();
  await waitHydrated(page);
  await catalog;
}

async function add(page: Page, text: string, name = text) {
  await field(page).fill(text);
  await field(page).press("Enter");
  await expect(row(pending(page), name)).toBeVisible();
}

/** Puts items in categories by name through the service role (setup only). */
async function seed(
  page: Page,
  list: CreatedList,
  placed: [name: string, category: string][],
) {
  const ids = await categoryIds(list.id);
  for (const [name, category] of placed) {
    await add(page, name);
    const itemId = await row(pending(page), name).getAttribute("data-item-id");
    await setCategory(itemId ?? "", ids.get(category) ?? "");
  }
  // The service role's writes reach the page as a read, not as events.
  await reload(page);
  for (const [name, category] of placed) {
    await expect(group(page, category)).toContainText(name);
  }
}

/**
 * Records, frame by frame, the vertical transforms of the groups of
 * Pendientes and of the rows of the route sheet, and the number of groups
 * (it must never dip: nothing flickers out and back). An element slid when
 * it went through two or more different translations: an interpolation.
 * With reduced motion Motion's layout animation is instant (`type: false`)
 * and may still paint one frame at the old place, which is a jump, not a
 * slide.
 */
async function recordTransforms(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __moving: Map<string, Set<string>>;
      __groupCounts: number[];
      __stop: boolean;
    };
    w.__moving = new Map();
    w.__groupCounts = [];
    w.__stop = false;
    const tick = () => {
      const groups = document.querySelectorAll("#pending h3");
      w.__groupCounts.push(groups.length);
      const watched = [
        ...document.querySelectorAll("#pending h3"),
        ...document.querySelectorAll('[data-slot="route-row"]'),
      ];
      for (const element of watched) {
        // The motion wrapper of a group, or the row itself.
        const target =
          element.tagName === "H3"
            ? element.closest("section")?.parentElement
            : element;
        const transform = target ? getComputedStyle(target).transform : "none";
        if (/matrix\(1, 0, 0, 1, [^,]+, (?!0\))/.test(transform)) {
          const key =
            element.tagName === "H3"
              ? `group:${element.textContent}`
              : `row:${element.getAttribute("data-category-id")}`;
          const seen = w.__moving.get(key) ?? new Set<string>();
          w.__moving.set(key, seen.add(transform));
        }
      }
      if (!w.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** What slid (two or more different translations), and the group counts. */
async function stopRecording(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      __moving: Map<string, Set<string>>;
      __groupCounts: number[];
      __stop: boolean;
    };
    w.__stop = true;
    const moving = [...w.__moving]
      .filter(([, transforms]) => transforms.size >= 2)
      .map(([key]) => key);
    return { moving, groupCounts: w.__groupCounts };
  });
}

/** No two chips come closer than their 8px touch extensions allow. */
async function expectChipsDoNotOverlap(chips: Locator) {
  const rects = await chips.evaluateAll((buttons) =>
    buttons.map((button) => {
      const r = button.getBoundingClientRect();
      return { l: r.left - 8, r: r.right + 8, t: r.top - 8, b: r.bottom + 8 };
    }),
  );
  expect(rects.length).toBeGreaterThan(5);
  for (const [i, a] of rects.entries()) {
    for (const b of rects.slice(i + 1)) {
      const overlap =
        Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 &&
        Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
      expect(overlap, "touch areas of two chips overlap").toBe(false);
    }
  }
}

for (const scheme of SCHEMES) {
  test.describe(`phase 3a, route and categories (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("an item changes category in its sheet, and the catalog learns it", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await openAndCreateList(page);
      await add(page, "Yerba");
      // No category yet: the list shows it under Otros.
      await expect(group(page, "Otros")).toContainText("Yerba");

      await openEditor(page, "Yerba");
      const names = await editor(page)
        .getByRole("group", { name: t.editItem.category })
        .getByRole("button")
        .allTextContents();
      expect(names).toEqual([
        "Frutas y verduras",
        "Carnes y pescados",
        "Fiambres y lácteos",
        "Panadería",
        "Almacén",
        "Bebidas",
        "Congelados",
        "Limpieza",
        "Higiene",
        "Otros",
      ]);
      await expect(chip(page, "Otros")).toHaveAttribute("aria-pressed", "true");
      await expectChipsDoNotOverlap(
        editor(page)
          .getByRole("group", { name: t.editItem.category })
          .locator("button"),
      );

      await chip(page, "Almacén").click();
      await expect(chip(page, "Almacén")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(chip(page, "Otros")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await captureViewport(page, testInfo, `edit-sheet-picker-${scheme}`);

      // The sheet may be taller than the viewport: it scrolls to the end,
      // where Guardar is.
      await saveEditor(page);
      await expect(group(page, "Almacén")).toContainText("Yerba");
      await expect(group(page, "Otros")).toHaveCount(0);

      await reload(page);
      await expect(group(page, "Almacén")).toContainText("Yerba");

      // Deleted and added again, the product lands where it was put last.
      await openEditor(page, "Yerba");
      await expect(chip(page, "Almacén")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      const remove = removeButton(page);
      await remove.click();
      await expect(remove).toHaveAttribute("data-armed", "true");
      await remove.click();
      await expect(row(pending(page), "Yerba")).toHaveCount(0);
      await add(page, "Yerba");
      await expect(group(page, "Almacén")).toContainText("Yerba");
      await expect(group(page, "Otros")).toHaveCount(0);

      // Picking Otros for an item in Almacén sends it there (the id, not
      // "no category"): it moves.
      await openEditor(page, "Yerba");
      await chip(page, "Otros").click();
      await saveEditor(page);
      await expect(group(page, "Otros")).toContainText("Yerba");
      await expect(group(page, "Almacén")).toHaveCount(0);
    });

    test("the route is reordered from its sheet and Pendientes follows it", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      const list = await openAndCreateList(page);
      await seed(page, list, [
        ["Tomates", "Frutas y verduras"],
        ["Leche", "Fiambres y lácteos"],
        ["Yerba", "Almacén"],
        ["Agua", "Bebidas"],
      ]);
      expect(await groupTitles(page)).toEqual([
        "Frutas y verduras",
        "Fiambres y lácteos",
        "Almacén",
        "Bebidas",
      ]);

      // Only once the list and its categories are in.
      const open = routeButton(page);
      await expect(open).toHaveAttribute("aria-haspopup", "dialog");
      await open.click();
      const sheet = routeSheet(page);
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText(t.route.description);
      await expect(routeRows(page)).toHaveCount(10);
      expect((await routeOrder(page)).slice(0, 2)).toEqual([
        "Frutas y verduras",
        "Carnes y pescados",
      ]);
      // Empty categories are here too, with no count; the others show theirs.
      const carnes = routeRows(page).filter({ hasText: "Carnes y pescados" });
      await expect(carnes).toHaveCount(1);
      await expect(carnes.locator("[data-numeric]")).toHaveCount(0);
      await expect(
        routeRows(page)
          .filter({ hasText: "Almacén" })
          .locator("[data-numeric]"),
      ).toHaveText(/^1/);
      await captureViewport(page, testInfo, `route-sheet-${scheme}`);

      // The ends: aria-disabled (not disabled), and a tap changes nothing.
      const first = arrow(page, "up", "Frutas y verduras");
      const last = arrow(page, "down", "Otros");
      for (const end of [first, last]) {
        await expect(end).toHaveAttribute("aria-disabled", "true");
        // Playwright reads aria-disabled as disabled: look at the property.
        expect(await end.evaluate((b: HTMLButtonElement) => b.disabled)).toBe(
          false,
        );
      }
      const before = await routeOrder(page);
      await first.click({ force: true });
      await last.click({ force: true });
      expect(await routeOrder(page)).toEqual(before);

      await recordTransforms(page);
      // Almacén down once; Bebidas up twice.
      await arrow(page, "down", "Almacén").click();
      await expect(arrow(page, "down", "Almacén")).toBeFocused();
      await expect(
        sheet.locator('[data-slot="route-announcement"]'),
      ).toHaveText(t.route.position("Almacén", 6, 10));
      await arrow(page, "up", "Bebidas").click();
      await expect(arrow(page, "up", "Bebidas")).toBeFocused();
      await arrow(page, "up", "Bebidas").click();
      await expect(arrow(page, "up", "Bebidas")).toBeFocused();
      await expect(
        sheet.locator('[data-slot="route-announcement"]'),
      ).toHaveText(t.route.position("Bebidas", 3, 10));
      await expect
        .poll(() => routeOrder(page))
        .toEqual([
          "Frutas y verduras",
          "Carnes y pescados",
          "Bebidas",
          "Fiambres y lácteos",
          "Panadería",
          "Almacén",
          "Congelados",
          "Limpieza",
          "Higiene",
          "Otros",
        ]);
      // Let the last slide finish before reading what moved.
      await page.waitForTimeout(500);
      const { moving, groupCounts } = await stopRecording(page);
      // The rows of the sheet and the groups behind it slid by transform,
      // and no group left and came back.
      expect(moving.some((key) => key.startsWith("row:"))).toBe(true);
      expect(moving.some((key) => key.startsWith("group:"))).toBe(true);
      expect(new Set(groupCounts)).toEqual(new Set([4]));

      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expect(routeButton(page)).toBeFocused();
      const expected = [
        "Frutas y verduras",
        "Bebidas",
        "Fiambres y lácteos",
        "Almacén",
      ];
      expect(await groupTitles(page)).toEqual(expected);
      await page.evaluate(() => document.fonts.ready);
      await captureViewport(page, testInfo, `list-after-reorder-${scheme}`);

      // It is on the server: a reload shows the same order, in both places.
      await reload(page);
      expect(await groupTitles(page)).toEqual(expected);
      await routeButton(page).click();
      expect((await routeOrder(page)).slice(0, 3)).toEqual([
        "Frutas y verduras",
        "Carnes y pescados",
        "Bebidas",
      ]);
    });
  });
}

for (const scheme of SCHEMES) {
  test.describe(`phase 3a, a rejected move (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("the category goes back and the sheet says so", async ({
      page,
    }, testInfo) => {
      test.setTimeout(60_000);
      await openAndCreateList(page);
      let calls = 0;
      await page.route("**/rest/v1/rpc/move_category", async (route) => {
        calls += 1;
        // Slow enough to see the category where the tap put it.
        await new Promise((resolve) => setTimeout(resolve, 600));
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            code: "P0001",
            message: "category_not_found",
          }),
        });
      });
      await routeButton(page).click();
      await expect(routeSheet(page)).toBeVisible();
      const before = await routeOrder(page);
      expect(before.slice(0, 3)).toEqual([
        "Frutas y verduras",
        "Carnes y pescados",
        "Fiambres y lácteos",
      ]);
      await expect(routeSheet(page).getByRole("alert")).toHaveCount(0);

      await arrow(page, "down", "Frutas y verduras").click();
      // It moves at once...
      await expect
        .poll(async () => (await routeOrder(page)).slice(0, 2))
        .toEqual(["Carnes y pescados", "Frutas y verduras"]);
      // ...and goes back when the server says no, with the notice.
      const alert = routeSheet(page).getByRole("alert");
      await expect(alert).toContainText(
        t.route.error.title("Frutas y verduras"),
      );
      await expect(alert).toContainText(t.route.error.body);
      await expect.poll(() => routeOrder(page)).toEqual(before);
      expect(calls).toBe(1);
      await expect(arrow(page, "down", "Frutas y verduras")).toBeFocused();
      await captureViewport(page, testInfo, `route-sheet-rejected-${scheme}`);

      // The notice goes with its button, and closing the sheet does not
      // bring it back in the add bar.
      await alert.getByRole("button", { name: t.itemErrors.dismiss }).click();
      await expect(alert).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(routeSheet(page)).toBeHidden();
      await page.waitForTimeout(500);
      await expect(notices(page)).toHaveCount(0);

      // Closed without dismissing: still the sheet's notice, not the add
      // bar's.
      await routeButton(page).click();
      await arrow(page, "down", "Frutas y verduras").click();
      await expect(routeSheet(page).getByRole("alert")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(routeSheet(page)).toBeHidden();
      await page.waitForTimeout(500);
      await expect(notices(page)).toHaveCount(0);
      expect(calls).toBe(2);
    });
  });
}

test.describe("phase 3a, reduced motion", () => {
  test.skip(
    process.env.E2E_SUPABASE !== "1",
    "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
  );
  test.use({
    colorScheme: "light",
    reducedMotion: "reduce",
    viewport: { width: 375, height: 812 },
  });

  test("a reorder shows no translate on the rows or the groups", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const list = await openAndCreateList(page);
    await seed(page, list, [
      ["Tomates", "Frutas y verduras"],
      ["Yerba", "Almacén"],
    ]);
    await routeButton(page).click();
    await expect(routeSheet(page)).toBeVisible();
    await page.waitForTimeout(500);

    await recordTransforms(page);
    await arrow(page, "up", "Almacén").click();
    await arrow(page, "up", "Almacén").click();
    await expect(arrow(page, "up", "Almacén")).toBeFocused();
    await expect
      .poll(async () => (await routeOrder(page)).slice(0, 3))
      .toEqual(["Frutas y verduras", "Carnes y pescados", "Almacén"]);
    await page.waitForTimeout(600);
    const { moving } = await stopRecording(page);
    expect(moving).toEqual([]);

    // The groups follow the order all the same.
    await page.keyboard.press("Escape");
    await expect(routeSheet(page)).toBeHidden();
    expect(await groupTitles(page)).toEqual(["Frutas y verduras", "Almacén"]);
    // The identity transform is all the groups and rows ever had.
    const transforms = await pending(page)
      .locator("h3")
      .evaluateAll((titles) =>
        titles.map(
          (title) =>
            getComputedStyle(title.closest("section")!.parentElement!)
              .transform,
        ),
      );
    for (const transform of transforms) expect(IDENTITY).toContain(transform);
  });
});
