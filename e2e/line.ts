import {
  expect,
  type CDPSession,
  type Locator,
  type Page,
} from "@playwright/test";
import { CHECKOUT } from "../src/lib/domain/line";
import { texts } from "../src/lib/texts";
import { checkbox } from "./two-members";

/**
 * The supermarket line (docs/improvements.md, F-9): the shopping mode shows
 * one station at a time, so a product is reached through the rail.
 */

const t = texts.line;

export function board(page: Page) {
  return page.locator('[data-slot="line-board"]');
}

/** The board's heading: what a screen reader is told about the stop. */
export function boardHeading(page: Page) {
  return board(page).getByRole("heading", { level: 2 });
}

export function rail(page: Page) {
  return page.getByRole("navigation", { name: t.rail, exact: true });
}

export function railNodes(page: Page) {
  return rail(page).getByRole("button");
}

/** The node of a station by its name, or of the checkout. */
export function railNode(page: Page, name: string) {
  return rail(page)
    .locator("button")
    .filter({
      has: page.getByText(t.goTo(name), { exact: false }),
    });
}

export function nextButton(page: Page) {
  return page.locator("#shopping-next");
}

/**
 * A tap on the bar's button that is not taken for the second of a hurried
 * double tap: right after a move, the button ignores one (DOUBLE_TAP_MS).
 */
export async function tapNext(page: Page) {
  await page.waitForTimeout(400);
  await nextButton(page).click();
}

export function lineRows(page: Page) {
  return page.locator('[data-slot="line-rows"]');
}

export function lineRow(page: Page, name: string) {
  return lineRows(page)
    .locator("li")
    .filter({ has: page.getByRole("checkbox", { name, exact: true }) });
}

export function lineAnnouncement(page: Page) {
  return page.locator('[data-slot="line-announcement"]');
}

export async function expectAt(page: Page, station: string) {
  await expect(boardHeading(page)).toContainText(`${t.hereSpoken}${station}`);
}

export async function goToStation(page: Page, station: string) {
  await railNode(page, station).click();
  await expectAt(page, station);
}

export async function goToCheckout(page: Page) {
  await railNode(page, t.checkout).click();
  await expect(board(page)).toHaveAttribute("data-stop", CHECKOUT);
}

/** Walks the rail until the product's station shows. */
export async function findOnLine(page: Page, name: string) {
  const box = checkbox(page, name);
  const stations = (await railNodes(page).count()) - 1;
  for (let index = 0; index < stations; index++) {
    if (await box.isVisible()) return;
    await railNodes(page).nth(index).click();
    await expect(railNodes(page).nth(index)).toHaveAttribute(
      "aria-current",
      "step",
    );
  }
  await expect(box).toBeVisible();
}

/** Checks a product at its station and waits for the server to have it. */
export async function checkOnLine(page: Page, name: string) {
  await findOnLine(page, name);
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/rest/v1/items" &&
      response.request().method() === "PATCH",
  );
  await checkbox(page, name).click();
  // It stays in its place, struck: a station's rows do not move.
  await expect(checkbox(page, name)).toHaveAttribute("aria-checked", "true");
  await expect(lineRow(page, name)).toBeVisible();
  expect((await saved).ok()).toBe(true);
}

/**
 * A finger that goes down on one element's middle, slides to another's in
 * small steps, as a thumb does, and lifts unless `hold`. Real touches (CDP):
 * the rail reads pointer events and decides tap against slide.
 */
export async function slide(
  page: Page,
  cdp: CDPSession,
  from: Locator,
  to: Locator,
  { hold = false, steps = 12 } = {},
) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error("the rail is not on screen");
  const start = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const end = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [start],
  });
  for (let step = 1; step <= steps; step++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: start.x + ((end.x - start.x) * step) / steps,
          y: start.y + ((end.y - start.y) * step) / steps,
        },
      ],
    });
    await page.waitForTimeout(16);
  }
  const lift = () =>
    cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  if (hold) return lift;
  await lift();
  return async () => {};
}
