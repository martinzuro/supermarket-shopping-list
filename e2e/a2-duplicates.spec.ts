import { expect, test, type Page, type Request } from "@playwright/test";
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
 * docs/improvements.md, A-2, end to end against the local Supabase stack, for
 * one member at 375px in light and dark: a product that is already pending
 * is not added again. The bar says so, with its quantity, and "Sumar" adds
 * what was typed to it in one edit; the suggestions show it as already on
 * the list. Taps are real touches (`tap`), which keep the phone's keyboard.
 */

const d = texts.addItem.duplicate;

function bar(page: Page) {
  return page.locator("[data-keyboard-open]");
}

function notice(page: Page) {
  return bar(page).locator('[data-slot="banner"][data-tone="info"]');
}

function options(page: Page) {
  return page.getByRole("option");
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

/**
 * Adds a product and waits for the server to save it: the writes recorded
 * after this are only those of the step under test.
 */
async function typeAdd(page: Page, text: string, name: string) {
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

for (const scheme of SCHEMES) {
  test.describe(`A-2, products already pending (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("a pending product is not added twice, and Sumar adds to it", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await openAndCreateList(page);
      await typeAdd(page, "Leche x3", "Leche");
      await expect(row(pending(page), "Leche")).toContainText("3");
      const writes = recordItemWrites(page);
      const input = field(page);

      // Typed again, in another case: no second row, the bar says so.
      await input.fill("LECHE");
      await input.press("Enter");
      await expect(notice(page)).toContainText(d.title("Leche"));
      await expect(notice(page)).toContainText(d.quantity("3"));
      await expect(input).toHaveValue("");
      await expect(input).toBeFocused();
      await expect(checkbox(page, "Leche")).toHaveCount(1);
      await captureViewport(page, testInfo, `a2-notice-${scheme}`);

      // "Sumar 1": one edit of the pending row, and the keyboard stays.
      await notice(page)
        .getByRole("button", { name: d.addAria("1", "Leche"), exact: true })
        .tap();
      await expect(row(pending(page), "Leche")).toContainText("4");
      await expect(notice(page)).toHaveCount(0);
      await expect(input).toBeFocused();
      await expect
        .poll(() => writes.map((write) => write.method))
        .toEqual(["PATCH"]);
      expect(writes[0].body).toEqual({ quantity: 4 });
      await expect(checkbox(page, "Leche")).toHaveCount(1);
    });

    test("the suggestions show what is already on the list", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await openAndCreateList(page);
      await typeAdd(page, "2 kg tomates", "Tomates");
      const writes = recordItemWrites(page);
      const input = field(page);

      await input.fill("tom");
      await expect(options(page)).toHaveCount(1);
      await expect(options(page).first()).toContainText("Tomates");
      await expect(options(page).first()).toContainText(d.inList("2 kg"));
      await captureViewport(page, testInfo, `a2-suggestion-${scheme}`);

      // Picked from the list, with a quantity that does not add up to kilos:
      // it is said, and only closes.
      await input.fill("3 tom");
      await options(page).first().tap();
      await expect(notice(page)).toContainText(d.title("Tomates"));
      await expect(notice(page)).toContainText(d.quantity("2 kg"));
      await expect(
        notice(page).getByRole("button", { name: /^Sumar/ }),
      ).toHaveCount(0);
      await notice(page)
        .getByRole("button", { name: texts.itemErrors.dismiss, exact: true })
        .tap();
      await expect(notice(page)).toHaveCount(0);
      await expect(checkbox(page, "Tomates")).toHaveCount(1);
      expect(writes).toEqual([]);
    });

    test("a product that is only in the cart is added as always", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await openAndCreateList(page);
      await typeAdd(page, "Pan", "Pan");
      await checkbox(page, "Pan").tap();
      await expect(row(cart(page), "Pan")).toBeVisible();

      await typeAdd(page, "pan", "Pan");
      await expect(notice(page)).toHaveCount(0);
      await expect(row(cart(page), "Pan")).toBeVisible();
    });
  });
}
