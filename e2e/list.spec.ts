import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { texts } from "../src/lib/texts";

/**
 * Lista: agregar y marcar ítems contra el stack local de Supabase. Cada test
 * corre en un contexto nuevo: usuario anónimo nuevo y lista vacía.
 *
 * Criterio de salida de la fase: cada acción se ve en menos de 2 s.
 */

const ITEMS_API = "**/rest/v1/items*";
const ACTION_MS = 2000;

const REJECTION = {
  code: "42501",
  message: "new row violates row-level security policy",
  details: null,
  hint: null,
};

function pending(page: Page) {
  return page.locator("#pending");
}

function cart(page: Page) {
  return page.locator("#cart");
}

function field(page: Page) {
  return page.getByRole("textbox", { name: texts.addItem.label });
}

function row(section: Locator, name: string) {
  return section.locator("li").filter({
    has: section.page().getByRole("checkbox", { name, exact: true }),
  });
}

function checkbox(page: Page, name: string) {
  return page.getByRole("checkbox", { name, exact: true });
}

/** El aviso de error; Next también tiene un role="alert" (route announcer). */
function banner(page: Page) {
  return page.locator('[data-slot="banner"][role="alert"]');
}

function count(section: Locator) {
  return section.locator("h2 [data-numeric]");
}

/** Agrega con Enter y espera a que la fila esté a la vista y el campo listo. */
async function addWithEnter(page: Page, text: string, name: string) {
  const input = field(page);
  await input.fill(text);
  await input.press("Enter");
  await expect(row(pending(page), name)).toBeVisible({ timeout: ACTION_MS });
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
}

/**
 * page.route no ve las peticiones que hace un service worker; la página corre
 * como en un navegador sin ellos (Serwist entonces no se registra).
 */
async function withoutServiceWorker(page: Page) {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Navigator.prototype, "serviceWorker");
  });
}

/** Rechaza con 403 los pedidos de `method` a la API de ítems. */
async function rejectItems(page: Page, method: "POST" | "PATCH") {
  await page.route(ITEMS_API, (route) => {
    if (route.request().method() !== method) return route.continue();
    return route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify(REJECTION),
    });
  });
}

/**
 * Promesa de la respuesta a un `method` sobre ítems, opcionalmente el que
 * lleva `name` en el cuerpo. Las escrituras de una lista van en cola, así
 * que la del último cambio respondida implica todas las anteriores.
 */
function nextWrite(page: Page, method: "POST" | "PATCH", name?: string) {
  return page.waitForResponse(
    (response) =>
      response.url().includes("/rest/v1/items") &&
      response.request().method() === method &&
      (name === undefined ||
        (response.request().postData() ?? "").includes(`"${name}"`)),
  );
}

async function openList(page: Page) {
  await page.goto("/");
  await expect(field(page)).toBeVisible();
  // La lista se crea en el primer uso: sin ella el campo no puede agregar.
  await expect(pending(page).getByText(texts.list.pending.empty)).toBeVisible();
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  // Entradas coreografiadas y reacomodo de filas: terminan en menos de 1 s.
  await page.waitForTimeout(700);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

// CI has no Supabase: these run only against the local stack.
test.describe("list with the local Supabase stack", () => {
  test.skip(
    process.env.E2E_SUPABASE !== "1",
    "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
  );

  test("adding keeps the field focused and shows each row at once", async ({
    page,
  }) => {
    await openList(page);
    const input = field(page);

    await addWithEnter(page, "2 kg de tomates", "tomates");
    const tomatoes = row(pending(page), "tomates");
    await expect(tomatoes).toContainText("2 kg");
    await expect(tomatoes.locator("[data-numeric]")).toHaveText("2 kg");
    await expect(count(pending(page))).toHaveText("1");

    await addWithEnter(page, "Leche x3", "Leche");
    const milk = row(pending(page), "Leche");
    await expect(milk.locator("[data-numeric]")).toHaveText("3");
    await expect(count(pending(page))).toHaveText("2");

    await addWithEnter(page, "Pan", "Pan");
    await expect(
      row(pending(page), "Pan").locator("[data-numeric]"),
    ).toHaveCount(0);
    await expect(count(pending(page))).toHaveText("3");
    await expect(pending(page).locator("li")).toHaveCount(3);

    // Con el botón (toque) el foco tampoco sale del campo.
    await input.fill("Yerba");
    await page.getByRole("button", { name: texts.addItem.submit }).tap();
    await expect(row(pending(page), "Yerba")).toBeVisible({
      timeout: ACTION_MS,
    });
    await expect(input).toHaveValue("");
    await expect(input).toBeFocused();
    await expect(count(pending(page))).toHaveText("4");
    await expect(cart(page).locator("li")).toHaveCount(0);
  });

  test("the items persist after a reload", async ({ page }) => {
    await withoutServiceWorker(page);
    await openList(page);
    await addWithEnter(page, "2 kg de tomates", "tomates");
    await addWithEnter(page, "Leche x3", "Leche");
    const saved = nextWrite(page, "POST", "Pan");
    await addWithEnter(page, "Pan", "Pan");

    // Que el servidor ya los tenga: el reload no puede depender de la caché.
    await expect(count(pending(page))).toHaveText("3");
    await saved;
    await page.reload();

    await expect(pending(page).locator("li")).toHaveCount(3);
    await expect(count(pending(page))).toHaveText("3");
    await expect(
      row(pending(page), "tomates").locator("[data-numeric]"),
    ).toHaveText("2 kg");
    await expect(
      row(pending(page), "Leche").locator("[data-numeric]"),
    ).toHaveText("3");
    await expect(row(pending(page), "Pan")).toBeVisible();
    await expect(
      row(pending(page), "Pan").locator("[data-numeric]"),
    ).toHaveCount(0);
  });

  test("checking moves a row to the cart and unchecking brings it back", async ({
    page,
  }) => {
    await withoutServiceWorker(page);
    await openList(page);
    await addWithEnter(page, "2 kg de tomates", "tomates");
    await addWithEnter(page, "Pan", "Pan");

    const checked = nextWrite(page, "PATCH");
    await checkbox(page, "tomates").click();
    await expect(row(cart(page), "tomates")).toBeVisible({
      timeout: ACTION_MS,
    });
    await expect(checkbox(page, "tomates")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(row(pending(page), "tomates")).toHaveCount(0);
    await expect(count(pending(page))).toHaveText("1");
    await expect(count(cart(page))).toHaveText("1");
    await expect(
      row(cart(page), "tomates").locator("[data-numeric]"),
    ).toHaveText("2 kg");

    // El servidor lo guardó: sigue en el carro tras recargar.
    await checked;
    await page.reload();
    await expect(row(cart(page), "tomates")).toBeVisible();
    await expect(checkbox(page, "tomates")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(row(pending(page), "Pan")).toBeVisible();
    await expect(count(pending(page))).toHaveText("1");
    await expect(count(cart(page))).toHaveText("1");

    await checkbox(page, "tomates").click();
    await expect(row(pending(page), "tomates")).toBeVisible({
      timeout: ACTION_MS,
    });
    await expect(checkbox(page, "tomates")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(row(cart(page), "tomates")).toHaveCount(0);
    await expect(count(pending(page))).toHaveText("2");
    await expect(count(cart(page))).toHaveCount(0);
  });

  test.describe("when the server rejects a write", () => {
    test.beforeEach(async ({ page }) => {
      await withoutServiceWorker(page);
    });

    test("a rejected insert drops the row, restores the text and warns", async ({
      page,
    }) => {
      await openList(page);
      await rejectItems(page, "POST");
      const input = field(page);

      await input.fill("2 kg de tomates");
      await input.press("Enter");

      const notice = banner(page);
      await expect(notice).toContainText(texts.itemErrors.add("tomates"));
      await expect(notice).toContainText(texts.itemErrors.addRestored);
      await expect(row(pending(page), "tomates")).toHaveCount(0);
      await expect(pending(page).locator("li")).toHaveCount(0);
      await expect(
        pending(page).getByText(texts.list.pending.empty),
      ).toBeVisible();
      await expect(input).toHaveValue("2 kg de tomates");

      await notice
        .getByRole("button", { name: texts.itemErrors.dismiss })
        .click();
      await expect(banner(page)).toHaveCount(0);
    });

    test("a rejected toggle puts the row back and warns", async ({ page }) => {
      await openList(page);
      const saved = nextWrite(page, "POST");
      await addWithEnter(page, "Leche x3", "Leche");
      await saved;
      await rejectItems(page, "PATCH");

      await checkbox(page, "Leche").click();

      const notice = banner(page);
      await expect(notice).toContainText(texts.itemErrors.check("Leche"));
      await expect(notice).toContainText(texts.itemErrors.toggleBody);
      await expect(row(pending(page), "Leche")).toBeVisible();
      await expect(row(cart(page), "Leche")).toHaveCount(0);
      await expect(checkbox(page, "Leche")).toHaveAttribute(
        "aria-checked",
        "false",
      );
      await expect(count(pending(page))).toHaveText("1");
      await expect(count(cart(page))).toHaveCount(0);

      await notice
        .getByRole("button", { name: texts.itemErrors.dismiss })
        .click();
      await expect(banner(page)).toHaveCount(0);
    });
  });

  for (const mode of ["light", "dark"] as const) {
    test.describe(`${mode} mode at 375px`, () => {
      test.use({ colorScheme: mode, viewport: { width: 375, height: 812 } });

      test("the list with pending and cart items", async ({
        page,
      }, testInfo) => {
        await openList(page);
        await addWithEnter(page, "2 kg de tomates", "tomates");
        await addWithEnter(page, "Leche x3", "Leche");
        await addWithEnter(page, "Pan", "Pan");
        await addWithEnter(
          page,
          "1,5 L de aceite de girasol",
          "aceite de girasol",
        );
        await checkbox(page, "Pan").click();
        await expect(row(cart(page), "Pan")).toBeVisible({
          timeout: ACTION_MS,
        });
        await checkbox(page, "Leche").click();
        await expect(row(cart(page), "Leche")).toBeVisible({
          timeout: ACTION_MS,
        });
        await expect(count(pending(page))).toHaveText("2");
        await expect(count(cart(page))).toHaveText("2");

        await settle(page);
        await expectNoHorizontalOverflow(page);
        await capture(page, testInfo, `list-${mode}`);
      });

      test("the rejection notice", async ({ page }, testInfo) => {
        await withoutServiceWorker(page);
        await openList(page);
        const saved = nextWrite(page, "POST");
        await addWithEnter(page, "Leche x3", "Leche");
        await saved;
        await rejectItems(page, "POST");

        await field(page).fill("Tomates con un nombre bastante largo, 2 kg");
        await field(page).press("Enter");
        await expect(banner(page)).toContainText(texts.itemErrors.addRestored);

        await settle(page);
        await expectNoHorizontalOverflow(page);
        await capture(page, testInfo, `list-rejection-${mode}`);
      });
    });
  }
});
