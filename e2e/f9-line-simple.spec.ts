import { expect, test, type Page } from "@playwright/test";
import { SIMPLE_LINE_KEY } from "../src/components/list/simple-line";
import { SIMPLE_STATION } from "../src/lib/domain/line";
import { texts } from "../src/lib/texts";
import {
  board,
  boardHeading,
  checkOnLine,
  goToCheckout,
  lineRows,
  nextButton,
  railNode,
  railNodes,
} from "./line";
import { SCHEMES } from "./sharing";
import { seedTrips } from "./supabase-admin";
import {
  captureViewport,
  checkbox,
  field,
  openAndCreateList,
  pending,
  waitHydrated,
} from "./two-members";

/**
 * docs/improvements.md, F-9 (ADR 0010), end to end against the local
 * Supabase stack at 375px: the simple list (one station with everything,
 * and the rail measures the cart), chosen on this device in "Ordenar el
 * recorrido" or used on its own when everything to pick falls in one
 * category; and the order learned from past trips, which that sheet offers
 * when it differs from the route and writes when used.
 */

const s = texts.shopping;
const t = texts.line;
const r = texts.route;

const VEGETABLES = "Frutas y verduras";
const DAIRY = "Fiambres y lácteos";
const BAKERY = "Panadería";
const PANTRY = "Almacén";

function routeButton(page: Page) {
  return pending(page).getByRole("button", { name: r.open, exact: true });
}

function routeSheet(page: Page) {
  return page.getByRole("dialog", { name: r.title });
}

/** The four categories of these tests, as the route sheet orders them. */
async function routeOrder(page: Page) {
  const names = await routeSheet(page)
    .locator('[data-slot="route-row"]')
    .evaluateAll((rows) =>
      rows.map((row) => row.querySelector(".text-row")?.textContent ?? ""),
    );
  return names.filter((name) =>
    [VEGETABLES, DAIRY, BAKERY, PANTRY].includes(name),
  );
}

function simpleSwitch(page: Page) {
  return routeSheet(page).getByRole("switch", {
    name: r.simple.title,
    exact: true,
  });
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

async function start(page: Page) {
  await page.getByRole("button", { name: s.start, exact: true }).click();
  await expect(board(page)).toBeVisible();
}

test.skip(
  process.env.E2E_SUPABASE !== "1",
  "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
);

for (const scheme of SCHEMES) {
  test.describe(`F-9, the simple list (${scheme})`, () => {
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("chosen on this device: one station with everything, and the rail measures the cart", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await openAndCreateList(page);
      await addAll(page, ["Tomates", "Leche", "Pan", "Yerba"]);
      await field(page).blur();

      // The switch is in "Ordenar el recorrido", off until turned on.
      await routeButton(page).click();
      await expect(simpleSwitch(page)).toHaveAttribute("aria-checked", "false");
      await simpleSwitch(page).scrollIntoViewIfNeeded();
      await simpleSwitch(page).click();
      await expect(simpleSwitch(page)).toHaveAttribute("aria-checked", "true");
      await captureViewport(page, testInfo, `f9-simple-switch-${scheme}`);
      await page.keyboard.press("Escape");
      await expect(routeSheet(page)).toBeHidden();

      await start(page);
      // One station, "Tu lista", with the four products in route order; the
      // board counts the cart.
      await expect(board(page)).toHaveAttribute("data-stop", SIMPLE_STATION);
      await expect(boardHeading(page)).toContainText(
        `${t.cartSpoken(0, 4)}${t.hereSpoken}${t.simple}. ${t.pending(4)}`,
      );
      await expect(
        lineRows(page).locator('[data-slot="list-row-name"]'),
      ).toHaveText(["Tomates", "Leche", "Pan", "Yerba"]);
      // The rail: the list and the checkout.
      await expect(railNodes(page)).toHaveCount(2);
      await expect(railNode(page, t.simple)).toHaveAttribute(
        "aria-current",
        "step",
      );
      await expect(nextButton(page)).toHaveText(t.toCheckout);

      // Every product picked moves the dot down the rail.
      const dot = page.locator('[data-slot="line-here"]');
      const before = (await dot.boundingBox())!.y;
      await checkOnLine(page, "Tomates");
      await checkOnLine(page, "Pan");
      await expect(boardHeading(page)).toContainText(t.cartSpoken(2, 4));
      await expect
        .poll(async () => (await dot.boundingBox())!.y - before)
        .toBeGreaterThan(100);
      await captureViewport(page, testInfo, `f9-simple-${scheme}`);

      // A reload finds the same trip, still simple.
      await page.reload();
      await waitHydrated(page);
      await expect(board(page)).toHaveAttribute("data-stop", SIMPLE_STATION);
      await expect(railNodes(page)).toHaveCount(2);

      // The checkout: the ticket has one line, and what is pending on the
      // stub; the rail leads back.
      await goToCheckout(page);
      const ticket = page.locator('[data-slot="line-ticket"]');
      await expect(ticket.locator("ul").first().locator("li")).toHaveText([
        `${t.simple}${t.ticket.count(2, 4)}`,
      ]);
      await expect(ticket.locator('[data-slot="line-stub"]')).toContainText(
        t.ticket.missingCount(2),
      );
      await railNode(page, t.simple).click();
      await expect(board(page)).toHaveAttribute("data-stop", SIMPLE_STATION);
      await expect(checkbox(page, "Leche")).toBeVisible();
    });
  });
}

test.describe("F-9, the simple list on its own", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("is used when everything to pick falls in one category, and only then", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openAndCreateList(page);
    await addAll(page, ["Tomates", "Lechuga"]);
    await field(page).blur();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), SIMPLE_LINE_KEY),
    ).toBeNull();
    await start(page);
    await expect(board(page)).toHaveAttribute("data-stop", SIMPLE_STATION);
    await expect(railNodes(page)).toHaveCount(2);

    // Another category joins mid-trip: the line keeps its shape, and the
    // product is in the list.
    await page.getByRole("button", { name: s.add, exact: true }).click();
    await addAll(page, ["Leche"]);
    await field(page).press("Escape");
    await expect(railNodes(page)).toHaveCount(2);
    await expect(checkbox(page, "Leche")).toBeVisible();

    // The next trip has two categories to pick from: stations again.
    await page.getByRole("button", { name: s.exitAria, exact: true }).click();
    await start(page);
    await expect(railNodes(page)).toHaveCount(3);
    await expect(boardHeading(page)).toContainText(
      `${t.hereSpoken}${VEGETABLES}`,
    );
  });
});

test.describe("F-9, the order learned from past trips", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("is offered in the route sheet when it differs, and using it writes the route", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const list = await openAndCreateList(page);
    // Two trips that went bakery first and dairy last.
    const products = [
      { name: "Pan", category: BAKERY, minutesBefore: 40 },
      { name: "Tomates", category: VEGETABLES, minutesBefore: 30 },
      { name: "Yerba", category: PANTRY, minutesBefore: 20 },
      { name: "Leche", category: DAIRY, minutesBefore: 10 },
    ];
    await seedTrips(list.id, list.created_by, [
      { daysAgo: 14, products },
      { daysAgo: 7, products },
    ]);
    await addAll(page, ["Tomates"]);
    await field(page).blur();

    await routeButton(page).click();
    expect(await routeOrder(page)).toEqual([VEGETABLES, DAIRY, BAKERY, PANTRY]);
    const use = routeSheet(page).getByRole("button", {
      name: r.suggestion.use,
      exact: true,
    });
    await expect(use).toBeVisible();
    await expect(routeSheet(page)).toContainText(r.suggestion.title);
    await captureViewport(page, testInfo, "f9-suggestion");

    // Using it reorders the route at once and saves it: one move per
    // category out of place.
    const moves: string[] = [];
    page.on("response", (response) => {
      if (new URL(response.url()).pathname === "/rest/v1/rpc/move_category") {
        moves.push(String(response.status()));
      }
    });
    await use.click();
    await expect
      .poll(async () => await routeOrder(page))
      .toEqual([BAKERY, VEGETABLES, PANTRY, DAIRY]);
    await expect(use).toBeHidden();
    await expect(
      routeSheet(page).locator('[data-slot="route-announcement"]'),
    ).toHaveText(r.suggestion.used);
    // Three moves: the categories no trip saw keep their place.
    await expect.poll(() => moves).toEqual(["200", "200", "200"]);

    // The server has it: a reload shows the same route, and nothing to
    // suggest.
    await page.reload();
    await waitHydrated(page);
    await routeButton(page).click();
    expect(await routeOrder(page)).toEqual([BAKERY, VEGETABLES, PANTRY, DAIRY]);
    await expect(routeSheet(page).getByText(r.suggestion.title)).toHaveCount(0);
  });
});
