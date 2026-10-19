import { expect, test } from "@playwright/test";
import { texts } from "../src/lib/texts";

test.describe("first use", () => {
  // Fresh storage: the welcome has not been seen on this device.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the welcome shows once and a tap leads to the list", async ({
    page,
  }) => {
    await page.goto("/");

    const welcome = page.getByTestId("welcome");
    await expect(welcome).toBeVisible();
    await expect(welcome).toContainText(texts.welcome.headline.em);
    // The list stays hidden underneath until the welcome finishes.
    await expect(page.locator("h1")).toBeHidden();

    await welcome.getByRole("button", { name: texts.welcome.cta }).click();
    await expect(welcome).toHaveCount(0);
    await expect(page.locator("h1")).toBeVisible();

    await page.reload();
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByTestId("welcome")).toHaveCount(0);
  });

  test("the welcome finishes on its own in under three seconds", async ({
    page,
  }) => {
    await page.goto("/");
    const welcome = page.getByTestId("welcome");
    await expect(welcome).toBeVisible();
    const shownAt = Date.now();

    // Still there at 1 s: it did not vanish instantly.
    await page.waitForTimeout(1000);
    await expect(welcome).toBeVisible();

    // Auto-finish at 2.6 s plus the 0.32 s exit: gone within 3.5 s of showing.
    await expect
      .poll(async () => await welcome.count(), {
        timeout: Math.max(500, 3500 - (Date.now() - shownAt)),
      })
      .toBe(0);
    await expect(page.locator("h1")).toBeVisible();
  });
});
