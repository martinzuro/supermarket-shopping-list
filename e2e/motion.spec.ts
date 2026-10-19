import { expect, test } from "@playwright/test";
import { texts } from "../src/lib/texts";

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the menu sheet opens without sliding and closes", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: texts.header.menu }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // MotionConfig reducedMotion="user" drops the translate: only the fade
    // remains, so the panel never sits off-screen while it settles.
    await expect
      .poll(
        () => dialog.evaluate((element) => getComputedStyle(element).transform),
        { intervals: [100] },
      )
      .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
});
