import { expect, test } from "@playwright/test";

test("home page shows a level-1 heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
});
