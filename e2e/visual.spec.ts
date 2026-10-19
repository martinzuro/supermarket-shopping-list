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

type Typography = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
};

async function typography(page: Page, selector: string): Promise<Typography> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontFamily: style.fontFamily,
        fontSize: parseFloat(style.fontSize),
        fontWeight: parseInt(style.fontWeight, 10),
      };
    });
}

async function expectSystemInvariants(page: Page, mode: Mode) {
  const { background, overflow, dark } = await page.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    overflow:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    dark: matchMedia("(prefers-color-scheme: dark)").matches,
  }));
  // El fondo es exactamente el token papel del modo: los tokens oscuros
  // están aplicados y nadie pisó el color del body.
  expect(background).toBe(rgb(palette[mode].paper));
  // Nada desborda a lo ancho a 375px.
  expect(overflow).toBeLessThanOrEqual(0);
  // La emulación del modo llegó al documento.
  expect(dark).toBe(mode === "dark");
}

/**
 * Roles tipográficos sobre elementos reales: detecta que una clase de rol
 * se pierda por el camino (como pasó con `cn` sin configurar) o que un
 * componente vuelva al tamaño de cuerpo.
 */
async function expectTypographyRoles(page: Page) {
  const wordmark = await typography(page, "h1");
  expect(wordmark.fontFamily).toContain("Instrument Serif");
  expect(wordmark.fontSize).toBeGreaterThanOrEqual(28);

  const button = await typography(page, "[data-slot=button][data-size=touch]");
  expect(button.fontSize).toBe(13);
  expect(button.fontWeight).toBe(500);
  expect(button.fontFamily).toContain("Geist");

  const heading = await typography(page, "[data-slot=section] h2");
  expect(heading.fontSize).toBeGreaterThanOrEqual(20);
  expect(heading.fontWeight).toBe(500);
}

/** Todo control visible de la pantalla mide al menos 44px por lado. */
async function expectTouchTargets(page: Page) {
  const small = await page
    .locator("button, a[href], input, [role=checkbox]")
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          // El indicador de desarrollo de Next no es parte de la app (en CI
          // no existe: el servidor es el de producción).
          if (
            element.closest("nextjs-portal") ||
            /next\.js/i.test(element.getAttribute("aria-label") ?? "")
          ) {
            return false;
          }
          const style = getComputedStyle(element);
          return style.visibility !== "hidden" && style.display !== "none";
        })
        .map((element) => {
          const { width, height } = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            label:
              element.getAttribute("aria-label") ??
              element.textContent?.trim().slice(0, 30) ??
              "",
            width: Math.round(width),
            height: Math.round(height),
          };
        })
        .filter((box) => box.width > 0 && (box.width < 44 || box.height < 44)),
    );
  expect(small).toEqual([]);
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

    test(`lista: typography roles and touch targets`, async ({ page }) => {
      await page.goto("/");
      await settle(page);
      await page.getByRole("button", { name: texts.header.menu }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await settle(page);
      await expectTypographyRoles(page);
      await expectTouchTargets(page);
    });

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
    // Motion aplica el estado final en el siguiente frame: se espera con poll.
    await expect
      .poll(async () => {
        const transforms = await welcome
          .locator("li")
          .evaluateAll((items) =>
            items.map((item) => getComputedStyle(item).transform),
          );
        return (
          transforms.length > 0 &&
          transforms.every((transform) =>
            ["none", "matrix(1, 0, 0, 1, 0, 0)"].includes(transform),
          )
        );
      })
      .toBe(true);
    await capture(page, testInfo, "welcome-reduced-motion");
    // Con movimiento reducido no hay cierre automático: sigue abierta mucho
    // después de los 2.6 s del cierre normal, hasta que la persona actúa.
    await page.waitForTimeout(3500);
    await expect(welcome).toBeVisible();
    await welcome.getByRole("button", { name: texts.welcome.cta }).click();
    await expect(welcome).toHaveCount(0);
  });
});
