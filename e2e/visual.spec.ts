import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { palette, type Mode } from "../src/lib/design/tokens";
import { texts } from "../src/lib/texts";

/**
 * Capturas automáticas a 375px (proyecto Pixel 7) en claro, oscuro y con
 * movimiento reducido. No comparan píxeles: las fuentes se rasterizan
 * distinto en cada sistema y eso haría flaky el CI. En su lugar adjuntan
 * la captura al informe (artefacto en CI) y comprueban invariantes del
 * sistema de diseño que sí son deterministas.
 */

const pages = [
  { name: "lista", path: "/" },
  { name: "design", path: "/design" },
  { name: "offline", path: "/offline" },
] as const;

const modes: Mode[] = ["light", "dark"];

function rgb(hex: string) {
  const value = parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  // Entradas coreografiadas: la más larga (bienvenida) dura menos de 2 s.
  await page.waitForTimeout(500);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  // En disco (test-results/, artefacto en CI) y adjunta al informe.
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function expectSystemInvariants(page: Page, mode: Mode) {
  const { background, overflow, scheme } = await page.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    overflow:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    scheme: getComputedStyle(document.documentElement).colorScheme,
  }));
  // El fondo es exactamente el token papel del modo: los tokens oscuros
  // están aplicados y nadie pisó el color del body.
  expect(background).toBe(rgb(palette[mode].paper));
  // Nada desborda a lo ancho a 375px.
  expect(overflow).toBeLessThanOrEqual(0);
  expect(scheme).toContain(mode);
}

for (const mode of modes) {
  test.describe(`${mode} mode`, () => {
    test.use({ colorScheme: mode });

    for (const target of pages) {
      test(`${target.name}: paper background and no horizontal overflow`, async ({
        page,
      }, testInfo) => {
        await page.goto(target.path);
        await settle(page);
        await expectSystemInvariants(page, mode);
        await capture(page, testInfo, `${target.name}-${mode}`);
      });
    }

    test(`menu sheet: floats on paper`, async ({ page }, testInfo) => {
      await page.goto("/");
      await settle(page);
      await page.getByRole("button", { name: texts.header.menu }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await settle(page);
      const sheetBackground = await dialog.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      expect(sheetBackground).toBe(rgb(palette[mode].paper));
      await capture(page, testInfo, `menu-${mode}`);
    });
  });
}

test.describe("first use with reduced motion", () => {
  test.use({
    reducedMotion: "reduce",
    storageState: { cookies: [], origins: [] },
  });

  test("the welcome fades in without any translate", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    const welcome = page.getByTestId("welcome");
    await expect(welcome).toBeVisible();
    // Las filas entran escalonadas con un desplazamiento de 8px; con
    // movimiento reducido MotionConfig lo quita y solo queda el fundido.
    const transforms = await welcome
      .locator("li")
      .evaluateAll((items) =>
        items.map((item) => getComputedStyle(item).transform),
      );
    expect(transforms.length).toBeGreaterThan(0);
    for (const transform of transforms) {
      expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(transform);
    }
    await capture(page, testInfo, "welcome-reduced-motion");
    await welcome.getByRole("button", { name: texts.welcome.cta }).click();
    await expect(welcome).toHaveCount(0);
  });
});
