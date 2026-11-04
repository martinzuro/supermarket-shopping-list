import { expect, test, type Page, type Request } from "@playwright/test";
import { texts } from "../src/lib/texts";
import { SCHEMES } from "./sharing";
import { seedCatalog, seedTrips, type TripSeed } from "./supabase-admin";
import {
  captureViewport,
  catalogLoaded,
  field,
  openAndCreateList,
  pending,
  rhythmLoaded,
  row,
  waitHydrated,
} from "./two-members";

/**
 * docs/improvements.md, F-7, end to end against the local Supabase stack,
 * for one member at 375px in light and dark: with past trips, "Lo de
 * siempre" tells what is due from what is still at home. What is due comes
 * ticked with its rhythm under the name; what there still is waits folded
 * at the end, unticked, and goes in if it is ticked. Taps are real touches.
 */

const u = texts.addItem.usuals;
const r = texts.addItem.review;

/**
 * Seven trips. Agua in the last four (every week: of every trip). Café every
 * three weeks, last bought two weeks ago: it runs out before the next trip.
 * Detergente every three weeks, bought a week ago, and Ketchup every three
 * months, bought ten days ago: still at home. The gaps between the trips
 * make the list's own rhythm a week.
 */
const TRIPS: TripSeed[] = [
  { daysAgo: 100, products: [{ name: "Ketchup", category: "Almacén" }] },
  { daysAgo: 35, products: [{ name: "Café", category: "Almacén" }] },
  {
    daysAgo: 28,
    products: [
      { name: "Agua", category: "Bebidas", quantity: 6 },
      { name: "Detergente", category: "Limpieza" },
    ],
  },
  {
    daysAgo: 21,
    products: [{ name: "Agua", category: "Bebidas", quantity: 6 }],
  },
  {
    daysAgo: 14,
    products: [
      { name: "Agua", category: "Bebidas", quantity: 6 },
      { name: "Café", category: "Almacén" },
    ],
  },
  { daysAgo: 10, products: [{ name: "Ketchup", category: "Almacén" }] },
  {
    daysAgo: 7,
    products: [
      { name: "Agua", category: "Bebidas", quantity: 6 },
      { name: "Detergente", category: "Limpieza" },
    ],
  },
];

const DUE = [
  // Route order: Panadería, Almacén, Bebidas. Pan is usual by its adds alone
  // (no trips): no rhythm under its name.
  { name: "Pan", detail: null },
  { name: "Café", detail: "Cada 3 semanas · hace 2 semanas" },
  { name: "Agua", detail: "Cada compra", amount: "6" },
];
const LATER = [
  { name: "Ketchup", detail: "Cada 3 meses · hace 10 días" },
  { name: "Detergente", detail: "Cada 3 semanas · hace 7 días" },
];

function usualsButton(page: Page, count: number) {
  return page
    .getByRole("group", { name: texts.addItem.frequents })
    .getByRole("button", { name: u.aria(count), exact: true });
}

function sheet(page: Page) {
  return page.getByRole("dialog", { name: u.title });
}

function laterToggle(page: Page) {
  return sheet(page).getByRole("button", { name: new RegExp(`^${r.later}`) });
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

async function openWithTrips(page: Page) {
  const list = await openAndCreateList(page);
  await seedTrips(list.id, list.created_by, TRIPS);
  await seedCatalog(list.id, [
    { name: "Pan", times: 3, category: "Panadería" },
  ]);
  const loaded = Promise.all([catalogLoaded(page), rhythmLoaded(page)]);
  await page.reload();
  await expect(field(page)).toBeVisible();
  await waitHydrated(page);
  await loaded;
  return list;
}

/** The row's text, as the checkbox reads it: name, rhythm and quantity. */
function rowText(product: {
  name: string;
  detail: string | null;
  amount?: string;
}) {
  return new RegExp(
    `^${product.name}\\s*${product.detail ? product.detail.replace(/\./g, "\\.") : ""}\\s*${product.amount ?? ""}$`,
  );
}

for (const scheme of SCHEMES) {
  test.describe(`F-7, the rhythm in Lo de siempre (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("what is due comes ticked with its rhythm, what there still is waits folded, and ticking it adds it", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await openWithTrips(page);
      const posts = recordItemPosts(page);

      // Three due and two still at home: five to review.
      await usualsButton(page, 5).tap();
      const review = sheet(page);
      await expect(review).toBeVisible();
      await expect(review.getByText(u.descriptionRhythm)).toBeVisible();
      await expect(
        review.getByRole("heading", { name: r.due, exact: true }),
      ).toBeVisible();
      const rows = review.getByRole("checkbox");
      await expect(rows).toHaveText(DUE.map(rowText));
      for (const one of await rows.all()) {
        await expect(one).toHaveAttribute("aria-checked", "true");
      }
      // The ones still at home are folded: a tap unfolds them, unticked.
      await expect(laterToggle(page)).toHaveAttribute("aria-expanded", "false");
      await expect(laterToggle(page)).toContainText("2");
      await expect(
        review.getByRole("button", { name: r.add(3), exact: true }),
      ).toBeInViewport();
      await laterToggle(page).tap();
      await expect(laterToggle(page)).toHaveAttribute("aria-expanded", "true");
      await expect(rows).toHaveText([...DUE, ...LATER].map(rowText));
      for (const product of LATER) {
        await expect(
          review.getByRole("checkbox", {
            name: new RegExp(`^${product.name}`),
          }),
        ).toHaveAttribute("aria-checked", "false");
      }
      for (const one of await rows.all()) {
        const box = await one.boundingBox();
        expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44);
      }
      await captureViewport(page, testInfo, `f7-review-${scheme}`);

      // The ketchup ran out early.
      await review.getByRole("checkbox", { name: /^Ketchup/ }).tap();
      await expect(
        review.getByRole("checkbox", { name: /^Ketchup/ }),
      ).toHaveAttribute("aria-checked", "true");
      expect(posts).toEqual([]);
      await review.getByRole("button", { name: r.add(4), exact: true }).tap();

      await expect(review).toHaveCount(0);
      for (const name of ["Pan", "Café", "Agua", "Ketchup"]) {
        await expect(row(pending(page), name)).toBeVisible();
      }
      await expect(row(pending(page), "Agua")).toContainText("6");
      await expect(row(pending(page), "Detergente")).toHaveCount(0);
      await expect.poll(() => posts.length).toBe(1);
      expect((posts[0] as { name: string }[]).map((one) => one.name)).toEqual([
        "Pan",
        "Café",
        "Agua",
        "Ketchup",
      ]);
      // Detergente alone is left: with one, nothing to review at once.
      await expect(
        page
          .getByRole("group", { name: texts.addItem.frequents })
          .getByRole("button", { name: /^Lo de siempre/ }),
      ).toHaveCount(0);
    });

    test("with nothing due, the sheet says so and shows what there still is", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      const list = await openAndCreateList(page);
      // Weekly trips (the one-offs keep the list's own rhythm at a week),
      // and both every three weeks, bought a week ago: nothing runs out
      // before the next trip.
      await seedTrips(list.id, list.created_by, [
        {
          daysAgo: 28,
          products: [
            { name: "Café", category: "Almacén" },
            { name: "Detergente", category: "Limpieza" },
            { name: "Velas" },
          ],
        },
        { daysAgo: 21, products: [{ name: "Pilas" }] },
        { daysAgo: 14, products: [{ name: "Sal" }] },
        {
          daysAgo: 7,
          products: [
            { name: "Café", category: "Almacén" },
            { name: "Detergente", category: "Limpieza" },
            { name: "Flores" },
          ],
        },
      ]);
      const loaded = Promise.all([catalogLoaded(page), rhythmLoaded(page)]);
      await page.reload();
      await expect(field(page)).toBeVisible();
      await waitHydrated(page);
      await loaded;

      await usualsButton(page, 2).tap();
      const review = sheet(page);
      await expect(review.getByText(r.nothingDue)).toBeVisible();
      // Unfolded from the start: it is all there is to see.
      await expect(laterToggle(page)).toHaveAttribute("aria-expanded", "true");
      await expect(review.getByRole("checkbox")).toHaveText([
        rowText({ name: "Café", detail: "Cada 3 semanas · hace 7 días" }),
        rowText({ name: "Detergente", detail: "Cada 3 semanas · hace 7 días" }),
      ]);
      await expect(
        review.getByRole("button", { name: r.none, exact: true }),
      ).toBeDisabled();
    });
  });
}
