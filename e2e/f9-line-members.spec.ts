import { expect, test, type Page } from "@playwright/test";
import { texts } from "../src/lib/texts";
import {
  board,
  boardHeading,
  checkOnLine,
  expectAt,
  goToCheckout,
  lineAnnouncement,
  lineRow,
  railNode,
  tapNext,
} from "./line";
import { SCHEMES } from "./sharing";
import { addMember, deleteList } from "./supabase-admin";
import {
  captureViewport,
  checkbox,
  field,
  newPlayer,
  openAndCreateList,
  reloadJoined,
} from "./two-members";

/**
 * docs/improvements.md, F-9 (ADR 0010), what is left behind, end to end
 * against the local Supabase stack at 375px. A passed station with something
 * to pick is citrus on the rail, with a branch that counts it. A product that
 * arrives at a passed station (another member's by Realtime, or your own
 * "+") says so under the board, with "Volver", which goes there; at the
 * checkout too, where every station is behind.
 */

const s = texts.shopping;
const t = texts.line;

const VEGETABLES = "Frutas y verduras";
const DAIRY = "Fiambres y lácteos";

function late(page: Page) {
  return page.locator('[data-slot="line-late"]');
}

function back(page: Page) {
  return late(page).getByRole("button", { name: t.late.back, exact: true });
}

function branch(page: Page, station: string) {
  return railNode(page, station).locator('[data-slot="line-behind"]');
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

test.skip(
  process.env.E2E_SUPABASE !== "1",
  "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
);

for (const scheme of SCHEMES) {
  test.describe(`F-9, what is left behind, two members (${scheme})`, () => {
    test("another member adds to a station already passed: the branch, the notice and Volver", async ({
      browser,
    }, testInfo) => {
      test.setTimeout(120_000);
      const alice = await newPlayer(browser, testInfo, scheme);
      const bob = await newPlayer(browser, testInfo, scheme);
      const a = alice.page;
      const b = bob.page;

      try {
        // B joins A's list.
        const listA = await openAndCreateList(a);
        const listB = await openAndCreateList(b);
        await addMember(listA.id, listB.created_by);
        await deleteList(listB.id);
        await addAll(a, ["Tomates", "Leche", "Pan"]);
        await field(a).blur();
        const [readA, readB] = await Promise.all([
          reloadJoined(a),
          reloadJoined(b),
        ]);
        expect(readA).toBe(listA.id);
        expect(readB).toBe(listA.id);

        // A shops: the first station done, on to the second.
        await a.getByRole("button", { name: s.start, exact: true }).click();
        await expectAt(a, VEGETABLES);
        await checkOnLine(a, "Tomates");
        await tapNext(a);
        await expectAt(a, DAIRY);
        // Passed with everything in the cart: no branch.
        await expect(branch(a, VEGETABLES)).toHaveCount(0);
        await expect(late(a)).toHaveCount(0);

        // The pulse is short (under half a second): it is recorded as it
        // happens, not looked for afterwards.
        await a.evaluate(() => {
          new MutationObserver(() => {
            if (
              document.querySelector('[data-slot="line-behind"][data-pulsing]')
            ) {
              document.documentElement.dataset.branchPulsed = "true";
            }
          }).observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["data-pulsing"],
          });
        });

        // B, at home, remembers the lettuce.
        await addAll(b, ["Lechuga"]);

        // A is told under the board, and the rail shows where it waits.
        const text = t.late.byOther("Lechuga", VEGETABLES);
        await expect(late(a)).toContainText(text);
        await expect(branch(a, VEGETABLES)).toHaveText(t.behindTag(1));
        // Another member's: the branch pulses, as a row would.
        await expect(a.locator("html")).toHaveAttribute(
          "data-branch-pulsed",
          "true",
        );
        await expect(railNode(a, VEGETABLES)).toContainText(
          `${t.goTo(VEGETABLES)}${t.nodeSpoken(1, 2)}${t.behindSpoken(1)}`,
        );
        await expect(lineAnnouncement(a)).toHaveText(text);
        // Nobody moved: A is still where they were.
        await expectAt(a, DAIRY);
        await expect(branch(a, VEGETABLES)).not.toHaveAttribute(
          "data-pulsing",
          "true",
        );
        await captureViewport(a, testInfo, `f9-late-${scheme}`);

        // Volver goes there, and the focus with it: the notice is gone.
        await back(a).click();
        await expectAt(a, VEGETABLES);
        await expect(boardHeading(a)).toBeFocused();
        await expect(late(a)).toHaveCount(0);
        await expect(lineRow(a, "Lechuga")).toBeVisible();
        await expect(lineAnnouncement(a)).toHaveText(
          t.arrived(VEGETABLES, 1, 3),
        );
        // Where you are is not behind; the station that was left is ahead.
        await expect(branch(a, VEGETABLES)).toHaveCount(0);
        await checkOnLine(a, "Lechuga");
        await tapNext(a);
        await expectAt(a, DAIRY);
      } finally {
        await alice.context.close();
        await bob.context.close();
      }
    });
  });
}

test.describe("F-9, what is left behind, on your own", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("a station left with something keeps a branch, and your own + at the checkout leads back", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    await openAndCreateList(page);
    await addAll(page, ["Tomates", "Lechuga", "Leche"]);
    await field(page).blur();
    await page.getByRole("button", { name: s.start, exact: true }).click();
    await expectAt(page, VEGETABLES);

    // One of two picked, and on: the station is left with one to pick.
    await checkOnLine(page, "Tomates");
    await tapNext(page);
    await expectAt(page, DAIRY);
    await expect(branch(page, VEGETABLES)).toHaveText(t.behindTag(1));
    await expect(railNode(page, VEGETABLES)).toContainText(t.behindSpoken(1));
    // Nothing arrived late: it was left on purpose.
    await expect(late(page)).toHaveCount(0);
    await captureViewport(page, testInfo, "f9-behind");

    // At the checkout every station is behind: what "+" adds there is said,
    // with the way back.
    await checkOnLine(page, "Leche");
    await goToCheckout(page);
    await page.getByRole("button", { name: s.add, exact: true }).click();
    await addAll(page, ["Queso"]);
    await field(page).press("Escape");
    await expect(late(page)).toContainText(t.late.bySelf("Queso", DAIRY));
    await expect(branch(page, DAIRY)).toHaveText(t.behindTag(1));
    await captureViewport(page, testInfo, "f9-late-checkout");

    await back(page).click();
    await expectAt(page, DAIRY);
    await expect(boardHeading(page)).toBeFocused();
    await expect(checkbox(page, "Queso")).toBeVisible();
    await expect(late(page)).toHaveCount(0);
    // The other one left behind still waits on the rail.
    await expect(branch(page, VEGETABLES)).toHaveText(t.behindTag(1));
    await expect(board(page)).toHaveAttribute("data-stop", /.+/);
  });
});
