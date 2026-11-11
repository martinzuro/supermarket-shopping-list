import { expect, test, type Page } from "@playwright/test";
import { SHOPPING_KEY } from "../src/components/list/shopping-mode";
import { texts } from "../src/lib/texts";
import {
  board,
  boardHeading,
  checkOnLine,
  expectAt,
  goToStation,
  lineAnnouncement,
  lineRow,
  lineRows,
  nextButton,
  rail,
  railNode,
  railNodes,
  slide,
} from "./line";
import { SCHEMES } from "./sharing";
import {
  captureViewport,
  checkbox,
  editor,
  field,
  openAndCreateList,
  waitHydrated,
} from "./two-members";

/**
 * docs/improvements.md, F-9 (ADR 0010), end to end against the local
 * Supabase stack at 375px: the shopping mode as a platform. One station at a
 * time on the board, in the list's route order; the button of the bar says
 * what comes next and waits for the tap; the rail moves by tap or by slide;
 * the place survives a reload; the checkout is the last stop, where "Terminé"
 * is. The rows keep what the list does: the edit sheet, the undo after a
 * check, adding with "+".
 */

const s = texts.shopping;
const t = texts.line;

const VEGETABLES = "Frutas y verduras";
const DAIRY = "Fiambres y lácteos";
const BAKERY = "Panadería";
const PANTRY = "Almacén";

declare global {
  interface Window {
    __flyers?: number;
  }
}

/** Counts the dots that fly from a check to the rail. */
async function countFlyers(page: Page) {
  await page.addInitScript(() => {
    window.__flyers = 0;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (
            node instanceof HTMLElement &&
            node.dataset.slot === "line-flyer"
          ) {
            window.__flyers = (window.__flyers ?? 0) + 1;
          }
        }
      }
      // The document itself: this runs before it has a root element.
    }).observe(document, { childList: true, subtree: true });
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

/** Five products in four stations, and the trip started. */
async function startTrip(page: Page) {
  await openAndCreateList(page);
  await addAll(page, ["Tomates", "Lechuga", "Leche", "Pan", "Yerba"]);
  await field(page).blur();
  await page.getByRole("button", { name: s.start, exact: true }).click();
  await expect(board(page)).toBeVisible();
}

function stationNames(page: Page) {
  return railNodes(page).evaluateAll((nodes) =>
    nodes.map((node) => node.textContent ?? ""),
  );
}

function kinds(page: Page) {
  return railNodes(page).evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLElement).dataset.kind),
  );
}

test.skip(
  process.env.E2E_SUPABASE !== "1",
  "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
);

for (const scheme of SCHEMES) {
  test.describe(`F-9, the supermarket line (${scheme})`, () => {
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("one station at a time, in route order; Siguiente waits; the place survives a reload", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await countFlyers(page);
      await startTrip(page);

      // The first station, alone: its two products and nothing else.
      await expectAt(page, VEGETABLES);
      await expect(boardHeading(page)).toContainText(
        `${t.stationSpoken(1, 4)}${t.hereSpoken}${VEGETABLES}. ${t.pending(2)}`,
      );
      await expect(lineRows(page).locator("li")).toHaveCount(2);
      await expect(checkbox(page, "Leche")).toHaveCount(0);
      // The rail: a node per station in the list's route order, and the
      // checkout.
      expect(await stationNames(page)).toEqual([
        `${t.goTo(VEGETABLES)}${t.nodeSpoken(0, 2)}`,
        `${t.goTo(DAIRY)}${t.nodeSpoken(0, 1)}`,
        `${t.goTo(BAKERY)}${t.nodeSpoken(0, 1)}`,
        `${t.goTo(PANTRY)}${t.nodeSpoken(0, 1)}`,
        t.goTo(t.checkout),
      ]);
      expect(await kinds(page)).toEqual([
        "current",
        "upcoming",
        "upcoming",
        "upcoming",
        "upcoming",
      ]);
      // Nothing was announced: nobody moved yet.
      await expect(lineAnnouncement(page)).toHaveText("");
      await captureViewport(page, testInfo, `f9-station-${scheme}`);

      // The button says what comes next, quiet while something is left.
      await expect(nextButton(page)).toHaveText(t.next(DAIRY));
      await expect(nextButton(page)).toHaveAttribute("data-ready", "false");
      await checkOnLine(page, "Tomates");
      expect(await page.evaluate(() => window.__flyers)).toBe(1);
      await checkOnLine(page, "Lechuga");
      // The station is done and stays: nothing moves on its own.
      await expect(boardHeading(page)).toContainText(t.pending(0));
      await expect(nextButton(page)).toHaveAttribute("data-ready", "true");
      await page.waitForTimeout(1200);
      await expectAt(page, VEGETABLES);
      await expect(lineRow(page, "Tomates")).toBeVisible();
      await captureViewport(page, testInfo, `f9-station-done-${scheme}`);

      await nextButton(page).click();
      await expectAt(page, DAIRY);
      await expect(lineAnnouncement(page)).toHaveText(t.arrived(DAIRY, 2, 4));
      await expect(checkbox(page, "Leche")).toBeVisible();
      await expect(checkbox(page, "Tomates")).toHaveCount(0);
      expect(await kinds(page)).toEqual([
        "passed",
        "current",
        "upcoming",
        "upcoming",
        "upcoming",
      ]);
      // The button stays where the thumb is, and keeps the focus.
      await expect(nextButton(page)).toBeFocused();
      await expect(nextButton(page)).toHaveText(t.next(BAKERY));

      // A reload finds the place.
      await page.reload();
      await waitHydrated(page);
      await expectAt(page, DAIRY);
      await expect(lineAnnouncement(page)).toHaveText("");
      expect((await kinds(page))[0]).toBe("passed");

      // Leaving something behind: Siguiente skips nothing ahead, and the
      // checkout comes after the last station.
      await nextButton(page).click();
      await expectAt(page, BAKERY);
      await nextButton(page).click();
      await expectAt(page, PANTRY);
      await expect(nextButton(page)).toHaveText(t.toCheckout);
      // A hurried double tap: "Terminé" takes the button's place under the
      // thumb, and the second tap does not end the trip.
      await nextButton(page).dblclick();
      await expect(board(page)).toHaveAttribute("data-stop", "caja");
      await expect(
        page.locator('[data-slot="shopping-masthead"]'),
      ).toBeVisible();
      await expect(lineAnnouncement(page)).toHaveText(t.arrivedCheckout);
      await expect(boardHeading(page)).toContainText(
        `${t.cartSpoken(2, 5)}${t.hereSpoken}${t.checkout}`,
      );
      // "Siguiente" is gone with the stations, and the bar ends the trip.
      await expect(nextButton(page)).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: s.finish, exact: true }),
      ).toBeVisible();
      await captureViewport(page, testInfo, `f9-checkout-${scheme}`);

      // Back from the checkout by the rail: what was left is still there.
      await goToStation(page, DAIRY);
      await expect(checkbox(page, "Leche")).toHaveAttribute(
        "aria-checked",
        "false",
      );
      expect(
        await page.evaluate(
          (key) =>
            (
              JSON.parse(localStorage.getItem(key) ?? "{}") as {
                line?: { passed: string[] };
              }
            ).line?.passed.length,
          SHOPPING_KEY,
        ),
      ).toBe(3);
    });

    test("the rail moves by tap and by slide, with the name under the thumb", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await startTrip(page);
      await expectAt(page, VEGETABLES);

      // A tap on a node goes there, passing what is on the way.
      await goToStation(page, BAKERY);
      expect(await kinds(page)).toEqual([
        "passed",
        "passed",
        "current",
        "upcoming",
        "upcoming",
      ]);
      // And back: the station left waits ahead again.
      await goToStation(page, VEGETABLES);
      expect(await kinds(page)).toEqual([
        "current",
        "passed",
        "upcoming",
        "upcoming",
        "upcoming",
      ]);

      // A slide: the name of the stop under the thumb shows beside the rail,
      // and nothing moves until the finger lifts.
      const cdp = await page.context().newCDPSession(page);
      const lift = await slide(
        page,
        cdp,
        railNode(page, VEGETABLES),
        railNode(page, PANTRY),
        { hold: true },
      );
      const scrub = page.locator('[data-slot="line-scrub"]');
      await expect(scrub).toHaveText(PANTRY);
      await expectAt(page, VEGETABLES);
      await captureViewport(page, testInfo, `f9-scrub-${scheme}`);
      await lift();
      await expect(scrub).toHaveCount(0);
      await expectAt(page, PANTRY);
      await expect(lineAnnouncement(page)).toHaveText(t.arrived(PANTRY, 4, 4));

      // The rail is a navigation of buttons: the keyboard moves too.
      await railNode(page, DAIRY).focus();
      await page.keyboard.press("Enter");
      await expectAt(page, DAIRY);
      await expect(rail(page)).toBeVisible();
    });
  });
}

test.describe("F-9, the station keeps what the list does", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the edit sheet, the undo after a check, and adding with +", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await startTrip(page);

    // A tap on the name opens the edit sheet (phase 3).
    await lineRow(page, "Tomates")
      .locator('[data-slot="list-row-name"]')
      .click();
    await expect(editor(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editor(page)).toBeHidden();

    // The undo after a check (A-4) is in the bar, over "Siguiente".
    await checkOnLine(page, "Tomates");
    const undo = page.getByRole("button", {
      name: texts.list.cart.undoAria("Tomates"),
      exact: true,
    });
    await undo.click();
    await expect(checkbox(page, "Tomates")).toHaveAttribute(
      "aria-checked",
      "false",
    );

    // "+" adds to the station it belongs to: here, it shows at once; in
    // another one, the rail grows a node.
    await page.getByRole("button", { name: s.add, exact: true }).click();
    await addAll(page, ["Bananas"]);
    await expect(lineRow(page, "Bananas")).toBeVisible();
    await addAll(page, ["Detergente"]);
    await expect(checkbox(page, "Detergente")).toHaveCount(0);
    await field(page).press("Escape");
    await expect(railNodes(page)).toHaveCount(6);

    // One tap on "Ir a la caja": the button is gone with the stations, and
    // the focus it had goes to the board, not to "Terminé".
    await goToStation(page, "Limpieza");
    await nextButton(page).click();
    await expect(board(page)).toHaveAttribute("data-stop", "caja");
    await expect(boardHeading(page)).toBeFocused();
  });
});

test.describe("F-9 with reduced motion", () => {
  test.use({ reducedMotion: "reduce", viewport: { width: 375, height: 812 } });

  test("nothing flies and the board does not flip", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    await countFlyers(page);
    await startTrip(page);
    await checkOnLine(page, "Tomates");
    expect(await page.evaluate(() => window.__flyers)).toBe(0);

    // Every frame after the tap: no letter of the board is ever rotated.
    const rotated = await page.evaluate(async () => {
      document.getElementById("shopping-next")?.click();
      let seen = false;
      const end = performance.now() + 500;
      await new Promise<void>((resolve) => {
        const tick = () => {
          for (const letter of document.querySelectorAll(
            '[data-slot="line-board"] h2 [aria-hidden] span span span',
          )) {
            const transform = getComputedStyle(letter).transform;
            if (transform !== "none" && !new DOMMatrix(transform).isIdentity) {
              seen = true;
            }
          }
          if (performance.now() < end) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      return seen;
    });
    expect(rotated).toBe(false);
    await expectAt(page, DAIRY);
    await captureViewport(page, testInfo, "f9-reduced");
  });
});
