import { expect, test, type Page, type Request } from "@playwright/test";
import { texts } from "../src/lib/texts";
import { SCHEMES } from "./sharing";
import {
  adminClient,
  categoryIds,
  seedCatalog,
  type CatalogSeed,
} from "./supabase-admin";
import {
  captureViewport,
  catalogLoaded,
  cart,
  field,
  openAndCreateList,
  pending,
  row,
  waitHydrated,
  type CreatedList,
} from "./two-members";

/**
 * Phase 3, part (c), end to end against the local Supabase stack, for one
 * member at 375px in light and dark: the add field as a combobox (suggestions
 * from the catalog), the row of frequents above it, "Lo de siempre" in one
 * request with its Deshacer, and the page keeping its last rows above the bar
 * as the bar grows. Taps are real touches (`tap`), which is how the phone
 * keeps its keyboard: the field must keep the focus.
 */

const t = texts;

/** What the list "remembers" (see `seedCatalog`). Four are usual, six frequent. */
const HISTORY: CatalogSeed[] = [
  { name: "Leche", times: 5, category: "Fiambres y lácteos", price: 45 },
  { name: "Tomates", times: 4, category: "Frutas y verduras", price: 90 },
  { name: "Arroz", times: 6, category: "Almacén", price: 62 },
  { name: "Pan", times: 3, category: "Panadería" },
  { name: "Yerba", times: 2, category: "Almacén", price: 210 },
  // Often, but not for more than a year: frequent, not usual.
  { name: "Atún", times: 9, category: "Almacén", daysAgo: 400 },
  { name: "Lechuga", times: 1, category: "Frutas y verduras", price: 30 },
  { name: "Lentejas", times: 1, category: "Almacén", price: 80 },
];

const MONEY = (amount: number) => new RegExp(`\\$\\s*${amount}\\b`);

function bar(page: Page) {
  return page.locator("[data-keyboard-open]");
}

function options(page: Page) {
  return page.getByRole("option");
}

function listbox(page: Page) {
  return page.getByRole("listbox", { name: t.addItem.suggestions });
}

function frequents(page: Page) {
  return page.getByRole("group", { name: t.addItem.frequents });
}

function chip(page: Page, name: string) {
  return frequents(page).getByRole("button", {
    name: t.addItem.addProduct(name),
    exact: true,
  });
}

function usualsButton(page: Page, count: number) {
  return frequents(page).getByRole("button", {
    name: t.addItem.usuals.aria(count),
    exact: true,
  });
}

function undoButton(page: Page) {
  return bar(page).getByRole("button", {
    name: t.addItem.usuals.undo,
    exact: true,
  });
}

/** The notice of what "Lo de siempre" added (the info banner of the bar). */
function addedNotice(page: Page) {
  return bar(page).locator('[data-slot="banner"][data-tone="info"]');
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

/** First load of a list with a history: the service role writes it, the page reads it. */
async function openWithHistory(page: Page, history = HISTORY) {
  const list = await openAndCreateList(page);
  await seedCatalog(list.id, history);
  await reload(page);
  return list;
}

async function reload(page: Page) {
  const catalog = catalogLoaded(page);
  await page.reload();
  await expect(field(page)).toBeVisible();
  await waitHydrated(page);
  await catalog;
  await expect(field(page)).toBeFocused();
}

async function typeAdd(page: Page, text: string, name = text) {
  await field(page).fill(text);
  await field(page).press("Enter");
  await expect(row(pending(page), name)).toBeVisible();
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

async function box(locator: ReturnType<Page["locator"]>) {
  const found = await locator.boundingBox();
  if (!found) throw new Error("not on screen");
  return found;
}

/**
 * The end of the page (the bottom of the cart section) is above the bar, and
 * on screen: the last rows are not under it.
 */
async function expectEndAboveBar(
  page: Page,
  label: string,
  { scroll = false }: { scroll?: boolean } = {},
) {
  await expect
    .poll(
      async () => {
        // (The list itself may still be growing, with a total line or a new
        // group: the person scrolls to the new end; the bar must not be why
        // the end is hidden.)
        if (scroll) await scrollToEnd(page);
        const end = await box(cart(page));
        const top = (await box(bar(page))).y;
        return Math.round(top - (end.y + end.height));
      },
      { message: label, timeout: 3000 },
    )
    .toBeGreaterThanOrEqual(0);
}

async function scrollToEnd(page: Page) {
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
}

for (const scheme of SCHEMES) {
  test.describe(`phase 3c, suggestions (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("typing proposes products, a tap adds one and keeps the keyboard", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await openWithHistory(page);
      const input = field(page);
      await expect(input).toHaveAttribute("aria-expanded", "false");
      await expect(input).toHaveAttribute("aria-autocomplete", "list");

      // From the first character: the best match next to the field.
      await input.fill("l");
      await expect(listbox(page)).toBeVisible();
      await expect(input).toHaveAttribute("aria-expanded", "true");
      await expect(input).toHaveAttribute(
        "aria-controls",
        (await listbox(page).getAttribute("id")) ?? "",
      );
      await input.fill("lec");
      await expect(options(page)).toHaveCount(2);
      await expect(options(page).nth(0)).toContainText("Lechuga");
      await expect(options(page).nth(1)).toContainText("Leche");
      await expect(options(page).nth(1)).toContainText(MONEY(45));
      // Each option is a thumb target, and the list sits on top of the field.
      // Rounded: measured while the list still enters, its transform can
      // leave sub-pixel noise (43.99994) on a row whose min-height is 44.
      for (const option of await options(page).all()) {
        expect(Math.round((await box(option)).height)).toBeGreaterThanOrEqual(
          44,
        );
      }
      const listBox = await box(listbox(page));
      const fieldBox = await box(input);
      expect(listBox.y + listBox.height).toBeLessThanOrEqual(fieldBox.y);
      await captureViewport(page, testInfo, `suggestions-${scheme}`);

      // A tap: the product lands in its category with its last price, the
      // field empties and keeps the focus (the keyboard stays open).
      const started = Date.now();
      await options(page).nth(1).tap();
      await expect(
        group(page, "Fiambres y lácteos").getByRole("checkbox", {
          name: "Leche",
          exact: true,
        }),
      ).toBeVisible();
      testInfo.annotations.push({
        type: "timing",
        description: `type "lec" is already done; tap -> row on screen: ${Date.now() - started} ms`,
      });
      await expect(row(pending(page), "Leche")).toContainText(MONEY(45));
      await expect(input).toHaveValue("");
      await expect(input).toBeFocused();
      await expect(listbox(page)).toHaveCount(0);
      await expect(input).toHaveAttribute("aria-expanded", "false");

      // What is pending is not proposed again.
      await input.fill("lec");
      await expect(options(page)).toHaveCount(1);
      await expect(options(page).first()).toContainText("Lechuga");

      // The quantity typed goes with the product.
      await input.fill("2 kg lec");
      await options(page).first().tap();
      await expect(
        group(page, "Frutas y verduras").getByRole("checkbox", {
          name: "Lechuga",
          exact: true,
        }),
      ).toBeVisible();
      await expect(row(pending(page), "Lechuga")).toContainText("2 kg");
      await expect(input).toBeFocused();
    });

    test("the arrows, Enter and Escape work from the keyboard", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await openWithHistory(page);
      const input = field(page);

      await input.fill("le");
      await expect(options(page)).toHaveCount(3);
      // Up from the field reaches the option next to it, then goes up.
      await input.press("ArrowUp");
      const last = options(page).last();
      await expect(last).toHaveAttribute("aria-selected", "true");
      await expect(input).toHaveAttribute(
        "aria-activedescendant",
        (await last.getAttribute("id")) ?? "",
      );
      await input.press("ArrowUp");
      await expect(options(page).nth(1)).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(last).toHaveAttribute("aria-selected", "false");
      await input.press("ArrowDown");
      await expect(last).toHaveAttribute("aria-selected", "true");
      const name = (await last.locator("span.truncate").textContent()) ?? "";
      expect(name).toBe("Leche");

      // Enter adds the active one; the field is empty and still focused.
      await input.press("Enter");
      await expect(row(pending(page), "Leche")).toBeVisible();
      await expect(input).toHaveValue("");
      await expect(input).toBeFocused();

      // With none active, Enter adds what was typed, as always.
      await input.fill("len");
      await expect(options(page)).toHaveCount(1);
      await input.press("Enter");
      await expect(row(pending(page), "len")).toBeVisible();
      await expect(listbox(page)).toHaveCount(0);

      // Escape closes the list and leaves the text.
      await input.fill("lec");
      await expect(listbox(page)).toBeVisible();
      await input.press("Escape");
      await expect(listbox(page)).toHaveCount(0);
      await expect(input).toHaveAttribute("aria-expanded", "false");
      await expect(input).toHaveValue("lec");
      await expect(input).toBeFocused();
      // Typing again opens it again.
      await input.fill("lech");
      await expect(listbox(page)).toBeVisible();
    });
  });

  test.describe(`phase 3c, frequents (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("there is no row without history, and a tap adds from it with the entrance", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      const list = await openAndCreateList(page);
      // No history: the row does not exist, and takes no room.
      await expect(frequents(page)).toHaveCount(0);
      const bare = (await box(bar(page))).height;
      expect(bare).toBeLessThan(90);

      await seedCatalog(list.id, HISTORY);
      await reload(page);
      await expect(frequents(page)).toBeVisible();
      await expect(frequents(page).getByRole("button")).toHaveText([
        `${t.addItem.usuals.label}4`,
        "Atún",
        "Arroz",
        "Leche",
        "Tomates",
        "Pan",
        "Yerba",
      ]);
      await expect(usualsButton(page, 4)).toBeVisible();
      // It takes the room it needs and no more; nothing overflows the page.
      expect((await box(bar(page))).height).toBeGreaterThan(bare + 30);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
      // It scrolls sideways (more chips than the screen shows).
      expect(
        await frequents(page).evaluate(
          (el) => el.scrollWidth > el.clientWidth + 8,
        ),
      ).toBe(true);
      // The pills are 36px, with a target of 44px: what is 3px beyond their
      // edges still hits them.
      await page.waitForTimeout(400);
      for (const name of ["Atún", "Arroz"]) {
        const target = chip(page, name);
        const frame = await box(target);
        const hits = await target.evaluate(
          (el, { x, y, h }) => {
            const above = document
              .elementFromPoint(x, y - 3.5)
              ?.closest("button");
            const below = document
              .elementFromPoint(x, y + h + 3.5)
              ?.closest("button");
            return [above === el, below === el];
          },
          { x: frame.x + frame.width / 2, y: frame.y, h: frame.height },
        );
        expect(hits).toEqual([true, true]);
      }
      await captureViewport(page, testInfo, `frequents-${scheme}`);

      // A tap adds with its category and price, the row shows the standard
      // entrance, the chip leaves and the field keeps the focus.
      await page.evaluate(() => {
        const w = window as unknown as { __lowest: number; __watch: boolean };
        w.__lowest = 1;
        w.__watch = true;
        const tick = () => {
          // The row, or its group when the group is the new one (it enters
          // and its rows do not): the lowest opacity up to #pending.
          for (const row of document.querySelectorAll(
            "#pending [data-item-id]",
          )) {
            for (
              let node: Element | null = row;
              node && node.id !== "pending";
              node = node.parentElement
            ) {
              const opacity = Number(getComputedStyle(node).opacity);
              if (opacity < w.__lowest) w.__lowest = opacity;
            }
          }
          if (w.__watch) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const started = Date.now();
      await chip(page, "Leche").tap();
      await expect(
        group(page, "Fiambres y lácteos").getByRole("checkbox", {
          name: "Leche",
          exact: true,
        }),
      ).toBeVisible();
      testInfo.annotations.push({
        type: "timing",
        description: `tap on a frequent -> row on screen: ${Date.now() - started} ms`,
      });
      await expect(row(pending(page), "Leche")).toContainText(MONEY(45));
      await expect(chip(page, "Leche")).toHaveCount(0);
      await expect(usualsButton(page, 3)).toBeVisible();
      await expect(field(page)).toBeFocused();
      await page.waitForTimeout(500);
      const lowest = await page.evaluate(() => {
        const w = window as unknown as { __lowest: number; __watch: boolean };
        w.__watch = false;
        return w.__lowest;
      });
      expect(lowest, "the row enters with a fade").toBeLessThan(1);

      // While typing, the suggestions replace it; when empty, it is back.
      await field(page).fill("p");
      await expect(listbox(page)).toBeVisible();
      await expect(frequents(page)).toHaveCount(0);
      await field(page).fill("");
      await expect(frequents(page)).toBeVisible();
      await expect(listbox(page)).toHaveCount(0);
    });

    test("a double tap on a suggestion adds it once", async ({ page }) => {
      test.setTimeout(60_000);
      await openWithHistory(page);
      const writes = recordItemWrites(page);
      await field(page).fill("lec");
      await expect(options(page)).toHaveCount(2);
      // Two clicks at the same spot, as quick as a double tap: the second
      // lands on what fades out or on what took its place.
      await options(page).nth(1).dblclick();
      await expect(row(pending(page), "Leche")).toBeVisible();
      await page.waitForTimeout(600);
      await expect(pending(page).getByRole("checkbox")).toHaveCount(1);
      expect(writes.filter((w) => w.method === "POST")).toHaveLength(1);
    });

    test("with a single usual product there is no Lo de siempre, only the frequents", async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await openWithHistory(page, [
        { name: "Yerba", times: 2, category: "Almacén" },
        { name: "Atún", times: 9, daysAgo: 400 },
        { name: "Pan", times: 3, category: "Panadería" },
      ]);
      // Pan is the only usual: nothing to add "de una vez".
      await expect(frequents(page)).toBeVisible();
      await expect(
        frequents(page).getByRole("button", { name: /Lo de siempre/ }),
      ).toHaveCount(0);
      await expect(frequents(page).getByRole("button")).toHaveCount(3);
    });
  });

  test.describe(`phase 3c, lo de siempre (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("one tap adds the usual products in one request and Deshacer takes them back in one", async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000);
      const list: CreatedList = await openWithHistory(page);
      const ids = await categoryIds(list.id);
      // Pan is already pending: it is left out, and it stays when undoing.
      await typeAdd(page, "Pan");
      await expect(usualsButton(page, 3)).toBeVisible();
      await expect(usualsButton(page, 3)).toContainText("3");

      const writes = recordItemWrites(page);
      const started = Date.now();
      await usualsButton(page, 3).tap();
      for (const name of ["Arroz", "Leche", "Tomates"]) {
        await expect(row(pending(page), name)).toBeVisible();
      }
      const elapsed = Date.now() - started;
      testInfo.annotations.push({
        type: "timing",
        description: `tap on Lo de siempre -> 3 rows on screen: ${elapsed} ms`,
      });
      await expect(addedNotice(page)).toContainText(t.addItem.usuals.added(3));
      await expect(undoButton(page)).toBeVisible();
      // The row of frequents lost what is pending now (and the usuals button).
      await expect(usualsButton(page, 3)).toHaveCount(0);
      await expect(field(page)).toBeFocused();
      await captureViewport(page, testInfo, `usuals-notice-${scheme}`);

      // One POST with the three products, their categories and last prices.
      expect(writes).toHaveLength(1);
      expect(writes[0].method).toBe("POST");
      const body = writes[0].body as {
        id: string;
        name: string;
        category_id: string | null;
        estimated_price: number | null;
      }[];
      expect(body.map((one) => one.name)).toEqual([
        "Arroz",
        "Leche",
        "Tomates",
      ]);
      expect(body.map((one) => one.category_id)).toEqual([
        ids.get("Almacén"),
        ids.get("Fiambres y lácteos"),
        ids.get("Frutas y verduras"),
      ]);
      expect(body.map((one) => one.estimated_price)).toEqual([62, 45, 90]);
      await expect(
        group(page, "Almacén").getByRole("checkbox", { name: "Arroz" }),
      ).toBeVisible();

      // Deshacer: one request, the three go, Pan stays.
      writes.length = 0;
      await undoButton(page).tap();
      for (const name of ["Arroz", "Leche", "Tomates"]) {
        await expect(row(pending(page), name)).toHaveCount(0);
      }
      await expect(row(pending(page), "Pan")).toBeVisible();
      await expect(addedNotice(page)).toHaveCount(0);
      await expect(field(page)).toBeFocused();
      await expect.poll(() => writes.length).toBe(1);
      await page.waitForTimeout(500);
      expect(writes).toHaveLength(1);
      expect(writes[0].method).toBe("PATCH");
      // The products are back in the row, ready for the next time.
      await expect(usualsButton(page, 3)).toBeVisible();
      const { data } = await adminClient()
        .from("items")
        .select("name, deleted_at")
        .eq("list_id", list.id)
        .order("name");
      expect(
        data?.map((item) => [item.name, item.deleted_at !== null]),
      ).toEqual([
        ["Arroz", true],
        ["Leche", true],
        ["Pan", false],
        ["Tomates", true],
      ]);
    });

    test("a rejected Lo de siempre says so and leaves the list as it was", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await openWithHistory(page);
      await page.route(/\/rest\/v1\/items(\?|$)/, async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            code: "42501",
            message: "new row violates row-level security policy",
          }),
        });
      });

      await usualsButton(page, 4).tap();
      // Optimistic first...
      await expect(row(pending(page), "Leche")).toBeVisible();
      // ...then the rejection: the rows go and the alert replaces the notice.
      const alert = bar(page).getByRole("alert");
      await expect(alert).toContainText(t.itemErrors.addMany(4));
      await expect(alert).toContainText(t.itemErrors.addManyBody);
      await expect(row(pending(page), "Leche")).toHaveCount(0);
      await expect(addedNotice(page)).toHaveCount(0);
      await expect(usualsButton(page, 4)).toBeVisible();
      await captureViewport(page, testInfo, `usuals-rejected-${scheme}`);
    });

    test("the page keeps its last rows above the bar as it grows, with the keyboard open or closed", async ({
      page,
    }) => {
      test.setTimeout(150_000);
      await openWithHistory(page);
      // (A trailing number would be read as a quantity.)
      for (const letter of "ABCDEFGHIJ") {
        await typeAdd(page, `Cosa ${letter}`);
      }
      await expect(frequents(page)).toBeVisible();

      // An open keyboard shrinks the viewport on Android (interactive-widget
      // resizes-content): the same thing, in a short window.
      for (const height of [812, 480]) {
        await page.setViewportSize({ width: 375, height });
        await page.waitForTimeout(300);
        await expectEndAboveBar(page, `row of frequents, ${height}px`, {
          scroll: true,
        });

        // The listbox grows the bar upwards: the end of the page goes with it
        // with no scrolling of the person.
        await field(page).fill("le");
        await expect(options(page)).toHaveCount(3);
        await expectEndAboveBar(page, `suggestions, ${height}px`);
        await field(page).fill("");
        await expect(listbox(page)).toHaveCount(0);
        await expectEndAboveBar(page, `back to the row, ${height}px`, {
          scroll: true,
        });

        // The notice of Lo de siempre adds a line on top of it all.
        // (Four rows come in with it: the person scrolls to see the new end.)
        await usualsButton(page, 4).tap();
        await expect(addedNotice(page)).toBeVisible();
        await expectEndAboveBar(page, `notice, ${height}px`, { scroll: true });
        await undoButton(page).tap();
        await expect(addedNotice(page)).toHaveCount(0);
        await expectEndAboveBar(page, `after Deshacer, ${height}px`, {
          scroll: true,
        });
      }
    });
  });
}
