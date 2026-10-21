import { expect, test, type Page, type Request } from "@playwright/test";
import { texts } from "../src/lib/texts";
import { SCHEMES, menuSheet } from "./sharing";
import {
  addMember,
  adminClient,
  deleteList,
  seedCatalog,
  type CatalogSeed,
} from "./supabase-admin";
import {
  captureViewport,
  cart,
  catalogLoaded,
  checkbox,
  emptyAction,
  field,
  newPlayer,
  openAndCreateList,
  pending,
  reloadJoined,
  row,
  waitHydrated,
} from "./two-members";

/**
 * docs/improvements.md, F-4, end to end against the local Supabase stack at
 * 375px in light and dark: every emptying of the cart is a trip in "Compras
 * anteriores" (the menu), a trip's products go back on the list, all or some,
 * an undone emptying leaves no trip behind, and the other member of the list
 * finds the trip in their history. Taps are real touches.
 */

/**
 * The steps that only set the scene get more than the default: on a loaded
 * machine the local Realtime is slower (see a4-undo.spec.ts).
 */
const SETUP_MS = 5000;

const t = texts.trips;
const m = texts.moments.cartEmptied;

// What the catalog remembers: the price per kilo of tomatoes and per unit of
// milk, and their categories, so a trip has an estimate and a route. Added
// once each, so not frequent yet: a frequent product just added shows in the
// frequents row for a moment before its row lands, and the page, at its end,
// follows the bar up and down under the next tap.
const PRICES: CatalogSeed[] = [
  {
    name: "Tomates",
    times: 1,
    category: "Frutas y verduras",
    price: 90,
    priceUnit: "kg",
  },
  { name: "Leche", times: 1, category: "Fiambres y lácteos", price: 45 },
];

function history(page: Page) {
  return menuSheet(page).getByTestId("trips-section");
}

function tripRows(page: Page) {
  return history(page).locator('[data-slot="trip-row"]');
}

/** A trip's review: the dialog with the list of that trip's products. */
function review(page: Page) {
  return page.getByRole("dialog").filter({
    has: page.getByRole("list", { name: t.review.listLabel }),
  });
}

function bar(page: Page) {
  return page.locator("[data-keyboard-open]");
}

function moment(page: Page) {
  return page.getByRole("group", { name: m.eyebrow });
}

async function openMenu(page: Page) {
  await page
    .getByRole("button", { name: texts.header.menu, exact: true })
    .tap();
  await expect(menuSheet(page)).toBeVisible();
}

/** Every insert of items the page sends, with its rows. */
function recordInserts(page: Page) {
  const inserts: unknown[] = [];
  page.on("request", (request: Request) => {
    if (
      new URL(request.url()).pathname === "/rest/v1/items" &&
      request.method() === "POST"
    ) {
      inserts.push(request.postDataJSON());
    }
  });
  return inserts;
}

/** Adds products as typed ([text, name shown]) and waits for the server. */
async function addAll(page: Page, products: [string, string][]) {
  for (const [typed, name] of products) {
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/rest/v1/items" &&
        response.request().method() === "POST",
    );
    await field(page).fill(typed);
    await field(page).press("Enter");
    await expect(row(pending(page), name)).toBeVisible();
    expect((await saved).ok()).toBe(true);
  }
  await field(page).blur();
}

/** Checks them one by one, each in the cart and answered before the next. */
async function checkAll(page: Page, names: string[]) {
  for (const name of names) {
    const answered = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/rest/v1/items" &&
        response.request().method() === "PATCH",
    );
    await checkbox(page, name).tap();
    await expect(row(cart(page), name)).toBeVisible();
    expect((await answered).ok()).toBe(true);
  }
}

function rpcAnswered(page: Page, name: "empty_cart" | "restore_trip") {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/rest/v1/rpc/${name}` &&
      response.request().method() === "POST",
  );
}

/** "Vaciar el carro": the moment shows, and the trip made is returned. */
async function emptyCart(page: Page): Promise<string> {
  const emptied = rpcAnswered(page, "empty_cart");
  await emptyAction(page).tap();
  await expect(moment(page)).toBeVisible();
  const answer = await emptied;
  expect(answer.ok()).toBe(true);
  return (answer.request().postDataJSON() as { target_trip_id: string })
    .target_trip_id;
}

async function backToList(page: Page) {
  await moment(page).getByRole("button", { name: m.action, exact: true }).tap();
  await expect(moment(page)).toHaveCount(0);
}

async function tripsOf(listId: string) {
  const { data, error } = await adminClient()
    .from("trips")
    .select("id, deleted_at")
    .eq("list_id", listId);
  if (error) throw error;
  return data;
}

for (const scheme of SCHEMES) {
  test.describe(`F-4, past trips (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("two emptyings are two trips, and part of one goes back on the list", async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000);
      const list = await openAndCreateList(page);
      await seedCatalog(list.id, PRICES);
      const catalog = catalogLoaded(page);
      await page.reload();
      await waitHydrated(page);
      await catalog;

      await addAll(page, [
        ["2 kg Tomates", "Tomates"],
        ["3 Leche", "Leche"],
        ["Pan", "Pan"],
      ]);
      await checkAll(page, ["Tomates", "Leche", "Pan"]);
      const first = await emptyCart(page);
      await backToList(page);

      await addAll(page, [
        ["Yerba", "Yerba"],
        ["Arroz", "Arroz"],
      ]);
      await checkAll(page, ["Yerba", "Arroz"]);
      const second = await emptyCart(page);
      await backToList(page);
      // Milk is needed again before the next shopping.
      await addAll(page, [["Leche", "Leche"]]);

      await openMenu(page);
      await expect(
        history(page).getByRole("heading", { name: t.title }),
      ).toBeVisible();
      // Newest first; both today, so each with its time.
      await expect(tripRows(page)).toHaveCount(2);
      await expect(tripRows(page).nth(0)).toHaveAttribute(
        "data-trip-id",
        second,
      );
      await expect(tripRows(page).nth(1)).toHaveAttribute(
        "data-trip-id",
        first,
      );
      await expect(tripRows(page).nth(0)).toContainText(t.count(2));
      // 2 kg at $ 90 the kilo and 3 at $ 45; Pan had no price.
      await expect(tripRows(page).nth(1)).toContainText(
        new RegExp(`${t.count(3)} · \\$\\s315`),
      );
      await expect(tripRows(page).nth(1)).toHaveAttribute(
        "aria-label",
        new RegExp(`, ${t.count(3)}, \\$\\s315$`),
      );
      // Two trips of the same day: each says its time too (seconds apart
      // here, so the same one).
      for (const one of await tripRows(page).all()) {
        await expect(one).toHaveAttribute(
          "aria-label",
          /^[^,]+ de [a-z]+, \d\d:\d\d, \d+ productos/,
        );
      }
      await tripRows(page).nth(1).scrollIntoViewIfNeeded();
      await captureViewport(page, testInfo, `f4-history-${scheme}`);

      // The menu goes, then the trip comes up: never two sheets at once.
      const inserts = recordInserts(page);
      await tripRows(page).nth(1).tap();
      await expect(review(page)).toBeVisible();
      await expect(menuSheet(page)).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(1);
      // In route order; what is pending already is shown and not offered.
      await expect(review(page).getByRole("listitem")).toHaveText([
        /^Tomates\s*2 kg$/,
        new RegExp(`^Leche\\s*3\\s*${texts.addItem.review.inList}$`),
        /^Pan$/,
      ]);
      await expect(review(page).getByRole("checkbox")).toHaveCount(2);
      // Bread is still at home.
      await review(page).getByRole("checkbox", { name: "Pan" }).tap();
      await expect(
        review(page).getByRole("checkbox", { name: "Pan" }),
      ).toHaveAttribute("aria-checked", "false");
      await captureViewport(page, testInfo, `f4-review-${scheme}`);

      const added = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/rest/v1/items" &&
          response.request().method() === "POST",
      );
      await review(page)
        .getByRole("button", { name: texts.addItem.review.add(1) })
        .tap();
      expect((await added).ok()).toBe(true);
      await expect(review(page)).toHaveCount(0);
      await expect(row(pending(page), "Tomates")).toBeVisible();
      // One write, with its quantity and the catalog's price per kilo.
      expect(inserts).toEqual([
        [
          expect.objectContaining({
            name: "Tomates",
            quantity: 2,
            unit: "kg",
            estimated_price: 90,
          }),
        ],
      ]);
      await expect(row(pending(page), "Leche")).toHaveCount(1);
      await expect(row(pending(page), "Pan")).toHaveCount(0);
      await expect(bar(page).locator('[data-slot="banner"]')).toContainText(
        texts.addItem.usuals.added(1),
      );
      await expect(
        bar(page).getByRole("button", {
          name: texts.addItem.usuals.undo,
          exact: true,
        }),
      ).toBeVisible();
      await captureViewport(page, testInfo, `f4-added-${scheme}`);
    });

    test("an undone emptying leaves no trip behind", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      const list = await openAndCreateList(page);
      await addAll(page, [["Pan", "Pan"]]);
      await checkAll(page, ["Pan"]);
      await emptyCart(page);

      const restored = rpcAnswered(page, "restore_trip");
      await moment(page)
        .getByRole("button", { name: m.undo, exact: true })
        .tap();
      await expect(row(cart(page), "Pan")).toBeVisible();
      expect((await restored).ok()).toBe(true);

      await openMenu(page);
      await expect(history(page)).toContainText(t.empty);
      await expect(tripRows(page)).toHaveCount(0);
      await captureViewport(page, testInfo, `f4-empty-${scheme}`);
      // Kept undone on the server, and out of the history after a reload.
      const trips = await tripsOf(list.id);
      expect(trips).toHaveLength(1);
      expect(trips[0].deleted_at).not.toBeNull();
      await page.keyboard.press("Escape");
      await page.reload();
      await waitHydrated(page);
      await openMenu(page);
      await expect(history(page)).toContainText(t.empty);
    });
  });
}

test.describe("F-4, the other member's history", () => {
  test.skip(
    process.env.E2E_SUPABASE !== "1",
    "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
  );

  test("a trip one member makes is in the other's history", async ({
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

      await addAll(a, [
        ["Leche", "Leche"],
        ["Pan", "Pan"],
      ]);
      await checkAll(a, ["Leche", "Pan"]);
      // Setup: B sees them in its cart, then sees them go with the emptying.
      for (const name of ["Leche", "Pan"]) {
        await expect(row(cart(b), name)).toBeVisible({ timeout: SETUP_MS });
      }
      const trip = await emptyCart(a);
      for (const name of ["Leche", "Pan"]) {
        await expect(row(cart(b), name)).toHaveCount(0, { timeout: SETUP_MS });
      }

      // Trips are not in Realtime: B reads them when the history opens.
      await openMenu(b);
      await expect(tripRows(b)).toHaveCount(1);
      await expect(tripRows(b).first()).toHaveAttribute("data-trip-id", trip);
      await expect(tripRows(b).first()).toContainText(t.count(2));
      await tripRows(b).first().tap();
      await expect(review(b).getByRole("checkbox")).toHaveText([
        "Leche",
        "Pan",
      ]);
      await captureViewport(b, testInfo, "f4-other-member");
    } finally {
      await Promise.all([alice.context.close(), bob.context.close()]);
    }
  });
});
