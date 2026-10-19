import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { texts } from "../src/lib/texts";
import { archiveItem, categoryIds, setCategory } from "./supabase-admin";

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

/**
 * La fila con la hoja abierta: Radix oculta el resto a los roles de
 * accesibilidad (aria-hidden), así que se la busca por atributos.
 */
function rowBehind(section: Locator, name: string) {
  return section.locator("li").filter({
    has: section.page().locator(`[role="checkbox"][aria-label="${name}"]`),
  });
}

function rowName(section: Locator, name: string) {
  return row(section, name).locator('[data-slot="list-row-name"]');
}

function editor(page: Page) {
  return page.getByRole("dialog", { name: texts.editItem.title });
}

function editorField(page: Page, label: string) {
  return editor(page).getByRole("textbox", { name: label, exact: true });
}

/** Abre la hoja de edición tocando el nombre de la fila. */
async function openEditor(page: Page, name: string) {
  await rowName(pending(page), name).click();
  await expect(editor(page)).toBeVisible();
  await expect(editorField(page, texts.editItem.name)).toHaveValue(name);
}

async function save(page: Page) {
  await editor(page)
    .getByRole("button", { name: texts.editItem.save, exact: true })
    .click();
}

function removeButton(page: Page) {
  return editor(page).getByRole("button", {
    name: new RegExp(
      `^(${texts.editItem.remove}|${texts.editItem.confirmRemove})$`,
    ),
  });
}

/** Agrega y espera a que el servidor haya respondido al alta. */
async function addAndSync(page: Page, text: string, name: string) {
  const saved = nextWrite(page, "POST", name);
  await addWithEnter(page, text, name);
  await saved;
}

/** The first answer of the catalog: the add bar needs it to pick a category. */
function catalogLoaded(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.url().includes("/rest/v1/catalog") &&
      response.request().method() === "GET",
  );
}

async function waitHydrated(page: Page) {
  // El HTML del servidor ya trae el campo: un Enter antes de la hidratación
  // se pierde. React marca sus elementos hidratados con `__reactProps$…`.
  await page.waitForFunction(() => {
    const input = document.querySelector("form input");
    return (
      input !== null &&
      Object.keys(input).some((key) => key.startsWith("__reactProps$"))
    );
  });
}

async function openList(page: Page) {
  const catalog = catalogLoaded(page);
  await page.goto("/");
  await expect(field(page)).toBeVisible();
  // La lista se crea en el primer uso: el vacío aparece recién cuando el
  // servidor la tiene y el campo ya puede agregar.
  await expect(pending(page).getByText(texts.list.pending.empty)).toBeVisible();
  await waitHydrated(page);
  // Sin el catálogo el campo todavía ignora el Enter (no sabe la categoría).
  await catalog;
}

/** Recarga una lista que ya tiene datos y espera a que el campo pueda agregar. */
async function reloadList(page: Page) {
  const catalog = catalogLoaded(page);
  await page.reload();
  await expect(field(page)).toBeVisible();
  await waitHydrated(page);
  await catalog;
}

/** Agrega y devuelve el cuerpo del alta que mandó la página. */
async function addAndPost(page: Page, text: string, name: string) {
  const saved = nextWrite(page, "POST", name);
  await addWithEnter(page, text, name);
  const body = (await saved).request().postDataJSON() as
    PostedItem | PostedItem[];
  return Array.isArray(body) ? body[0] : body;
}

type PostedItem = { id: string; list_id: string; category_id: string | null };

type Seed = { text: string; name: string; category?: string };

/**
 * Agrega los ítems, los deja en las categorías pedidas (todavía no hay
 * selector: se escribe por la API local) y recarga. Devuelve los ids de las
 * categorías y de los ítems.
 */
async function seedList(page: Page, seeds: Seed[]) {
  const itemIds = new Map<string, string>();
  let listId = "";
  for (const seed of seeds) {
    const posted = await addAndPost(page, seed.text, seed.name);
    itemIds.set(seed.name, posted.id);
    listId = posted.list_id;
  }
  const categories = await categoryIds(listId);
  for (const seed of seeds) {
    if (!seed.category) continue;
    const categoryId = categories.get(seed.category);
    if (!categoryId) throw new Error(`No category ${seed.category}`);
    await setCategory(itemIds.get(seed.name)!, categoryId);
  }
  await reloadList(page);
  return { categories, itemIds };
}

/** El grupo de una categoría dentro de "Pendientes". */
function group(page: Page, title: string) {
  return pending(page)
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        level: 3,
        name: new RegExp(`^${title}\\s*\\d*$`),
      }),
    });
}

function groupTitles(page: Page) {
  return pending(page).locator("h3 .truncate");
}

function groupCounts(page: Page) {
  return pending(page).locator("h3 [data-numeric]");
}

function moment(page: Page) {
  return page.locator('[data-slot="moment"]');
}

function momentAction(page: Page) {
  return moment(page).getByRole("button", {
    name: texts.moments.cartEmptied.action,
    exact: true,
  });
}

function emptyAction(page: Page) {
  return cart(page).getByRole("button", {
    name: texts.list.cart.emptyAction,
    exact: true,
  });
}

/** La respuesta al PATCH del vaciado (el único que lleva `id=in.(…)`). */
function emptyCartWrite(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().includes("/rest/v1/items") &&
      decodeURIComponent(response.url()).includes("id=in."),
  );
}

/** Marca el ítem y espera a que el servidor haya respondido. */
async function checkAndSync(page: Page, name: string) {
  const checked = nextWrite(page, "PATCH");
  await checkbox(page, name).click();
  await expect(row(cart(page), name)).toBeVisible({ timeout: ACTION_MS });
  await checked;
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

  test.describe("editing and deleting", () => {
    test.beforeEach(async ({ page }) => {
      await withoutServiceWorker(page);
    });

    test("editing saves at once, closes the sheet and persists", async ({
      page,
    }) => {
      await openList(page);
      await addAndSync(page, "Pan", "Pan");

      await openEditor(page, "Pan");
      await editorField(page, texts.editItem.name).fill("Pan integral");
      await editorField(page, texts.editItem.quantity).fill("1,5");
      await editorField(page, texts.editItem.unit).fill("L");
      await editorField(page, texts.editItem.note).fill("Marca Bimbo");

      const saved = nextWrite(page, "PATCH");
      await save(page);

      const edited = row(pending(page), "Pan integral");
      await expect(edited).toBeVisible({ timeout: ACTION_MS });
      await expect(edited.locator("[data-numeric]")).toHaveText("1,5 L");
      await expect(edited).toContainText("Marca Bimbo");
      await expect(row(pending(page), "Pan")).toHaveCount(0);
      await expect(editor(page)).toBeHidden({ timeout: ACTION_MS });
      await expect(rowName(pending(page), "Pan integral")).toBeFocused();
      await expect(count(pending(page))).toHaveText("1");

      await saved;
      await page.reload();
      const reloaded = row(pending(page), "Pan integral");
      await expect(reloaded).toBeVisible();
      await expect(reloaded.locator("[data-numeric]")).toHaveText("1,5 L");
      await expect(reloaded).toContainText("Marca Bimbo");
      await expect(pending(page).locator("li")).toHaveCount(1);
    });

    test("an empty name or a bad quantity keeps the sheet open and sends nothing", async ({
      page,
    }) => {
      await openList(page);
      await addAndSync(page, "2 kg de tomates", "tomates");

      let patches = 0;
      page.on("request", (request) => {
        if (
          request.method() === "PATCH" &&
          request.url().includes("/rest/v1/items")
        ) {
          patches += 1;
        }
      });

      await openEditor(page, "tomates");
      const alert = editor(page).getByRole("alert");

      await editorField(page, texts.editItem.name).fill("");
      await save(page);
      await expect(alert).toHaveText(texts.editItem.errors.name);
      await expect(editor(page)).toBeVisible();

      await editorField(page, texts.editItem.name).fill("tomates");
      await expect(alert).toHaveCount(0);

      for (const bad of ["0", "abc"]) {
        await editorField(page, texts.editItem.quantity).fill(bad);
        await save(page);
        await expect(alert).toHaveText(texts.editItem.errors.quantity);
        await expect(editor(page)).toBeVisible();
      }

      expect(patches).toBe(0);
      await expect(rowBehind(pending(page), "tomates")).toBeVisible();
      await expect(
        rowBehind(pending(page), "tomates").locator("[data-numeric]"),
      ).toHaveText("2 kg");
    });

    test("deleting needs a second tap, then the row is gone for good", async ({
      page,
    }) => {
      await openList(page);
      await addAndSync(page, "Leche x3", "Leche");
      await addAndSync(page, "Pan", "Pan");

      await openEditor(page, "Leche");
      const remove = removeButton(page);
      await expect(remove).toHaveText(texts.editItem.remove);
      await remove.click();
      await expect(remove).toHaveText(texts.editItem.confirmRemove);
      await expect(editor(page)).toBeVisible();
      await expect(rowBehind(pending(page), "Leche")).toBeVisible();

      const saved = nextWrite(page, "PATCH");
      // Un segundo toque inmediato es un doble toque: se espera al botón armado.
      await expect(remove).toHaveAttribute("data-armed", "true");
      await remove.click();

      await expect(editor(page)).toBeHidden({ timeout: ACTION_MS });
      await expect(row(pending(page), "Leche")).toHaveCount(0);
      await expect(field(page)).toBeFocused();
      await expect(count(pending(page))).toHaveText("1");

      await saved;
      await page.reload();
      await expect(row(pending(page), "Pan")).toBeVisible();
      await expect(row(pending(page), "Leche")).toHaveCount(0);
      await expect(pending(page).locator("li")).toHaveCount(1);
    });

    test("the delete confirmation resets after a few seconds", async ({
      page,
    }) => {
      await openList(page);
      await addAndSync(page, "Pan", "Pan");

      await openEditor(page, "Pan");
      const remove = removeButton(page);
      await remove.click();
      await expect(remove).toHaveText(texts.editItem.confirmRemove);

      await expect(remove).toHaveText(texts.editItem.remove, { timeout: 6000 });
      await expect(editor(page)).toBeVisible();
      await expect(rowBehind(pending(page), "Pan")).toBeVisible();
    });

    test("a rejected edit restores the old name and warns", async ({
      page,
    }) => {
      await openList(page);
      await addAndSync(page, "2 kg de tomates", "tomates");
      await rejectItems(page, "PATCH");

      await openEditor(page, "tomates");
      await editorField(page, texts.editItem.name).fill("tomates perita");
      await save(page);

      const notice = banner(page);
      await expect(notice).toContainText(texts.itemErrors.edit("tomates"));
      await expect(notice).toContainText(texts.itemErrors.editBody);
      await expect(row(pending(page), "tomates")).toBeVisible();
      await expect(row(pending(page), "tomates perita")).toHaveCount(0);
      await expect(
        row(pending(page), "tomates").locator("[data-numeric]"),
      ).toHaveText("2 kg");
      await expect(editor(page)).toBeHidden();

      await notice
        .getByRole("button", { name: texts.itemErrors.dismiss })
        .click();
      await expect(banner(page)).toHaveCount(0);
    });

    test("a rejected delete brings the row back and warns", async ({
      page,
    }) => {
      await openList(page);
      await addAndSync(page, "Leche x3", "Leche");
      await rejectItems(page, "PATCH");

      await openEditor(page, "Leche");
      await removeButton(page).click();
      await expect(removeButton(page)).toHaveAttribute("data-armed", "true");
      await removeButton(page).click();

      const notice = banner(page);
      await expect(notice).toContainText(texts.itemErrors.remove("Leche"));
      await expect(notice).toContainText(texts.itemErrors.removeBody);
      await expect(row(pending(page), "Leche")).toBeVisible();
      await expect(count(pending(page))).toHaveText("1");
      await expect(editor(page)).toBeHidden();

      await notice
        .getByRole("button", { name: texts.itemErrors.dismiss })
        .click();
      await expect(banner(page)).toHaveCount(0);
    });
  });

  test.describe("categories and emptying the cart", () => {
    test.beforeEach(async ({ page }) => {
      await withoutServiceWorker(page);
    });

    test("a fresh user's items go to the Otros group", async ({ page }) => {
      await openList(page);
      const posted = await addAndPost(page, "Pan", "Pan");
      await addWithEnter(page, "Leche x3", "Leche");

      // The insert carries the list's own "Otros".
      const categories = await categoryIds(posted.list_id);
      expect(posted.category_id).toBe(categories.get("Otros"));

      await expect(groupTitles(page)).toHaveText([
        texts.list.pending.uncategorized,
      ]);
      await expect(groupCounts(page)).toHaveText(["2"]);
      const otros = group(page, texts.list.pending.uncategorized);
      await expect(row(otros, "Pan")).toBeVisible();
      await expect(row(otros, "Leche")).toBeVisible();
      await expect(count(pending(page))).toHaveText("2");
      await expect(pending(page).locator("h2")).toHaveCount(1);
    });

    test("pending items are grouped in route order and groups come and go", async ({
      page,
    }) => {
      await openList(page);
      await seedList(page, [
        { text: "Lavandina", name: "Lavandina", category: "Limpieza" },
        {
          text: "Yogur natural x4",
          name: "Yogur natural",
          category: "Fiambres y lácteos",
        },
        {
          text: "2 kg de tomates",
          name: "tomates",
          category: "Frutas y verduras",
        },
        { text: "Pan", name: "Pan" },
        { text: "Leche 2 L", name: "Leche", category: "Fiambres y lácteos" },
        { text: "Lechuga", name: "Lechuga", category: "Frutas y verduras" },
      ]);

      await expect(groupTitles(page)).toHaveText([
        "Frutas y verduras",
        "Fiambres y lácteos",
        "Limpieza",
        "Otros",
      ]);
      await expect(groupCounts(page)).toHaveText(["2", "2", "1", "1"]);
      await expect(count(pending(page))).toHaveText("6");
      // The categories with nothing to buy are not shown.
      await expect(pending(page).locator("h3")).toHaveCount(4);
      await expect(group(page, "Carnes y pescados")).toHaveCount(0);

      for (const [title, names] of [
        ["Frutas y verduras", ["tomates", "Lechuga"]],
        ["Fiambres y lácteos", ["Yogur natural", "Leche"]],
        ["Limpieza", ["Lavandina"]],
        ["Otros", ["Pan"]],
      ] as const) {
        for (const name of names) {
          await expect(row(group(page, title), name)).toBeVisible();
        }
        await expect(group(page, title).locator("li")).toHaveCount(
          names.length,
        );
      }

      // Checking a row sends it to the cart and the group's count drops.
      await checkbox(page, "Leche").click();
      await expect(row(cart(page), "Leche")).toBeVisible({
        timeout: ACTION_MS,
      });
      await expect(row(group(page, "Fiambres y lácteos"), "Leche")).toHaveCount(
        0,
      );
      await expect(
        group(page, "Fiambres y lácteos").locator("h3 [data-numeric]"),
      ).toHaveText("1");
      await expect(count(pending(page))).toHaveText("5");

      // The last row of a group leaves with its group, the others stay.
      await checkbox(page, "Lavandina").click();
      await expect(row(cart(page), "Lavandina")).toBeVisible({
        timeout: ACTION_MS,
      });
      await expect(group(page, "Limpieza")).toHaveCount(0, {
        timeout: ACTION_MS,
      });
      await expect(groupTitles(page)).toHaveText([
        "Frutas y verduras",
        "Fiambres y lácteos",
        "Otros",
      ]);
      await expect(groupCounts(page)).toHaveText(["2", "1", "1"]);
      await expect(count(pending(page))).toHaveText("4");
      // The cart is not grouped.
      await expect(cart(page).locator("h3")).toHaveCount(0);
      await expect(count(cart(page))).toHaveText("2");
    });

    test("a new item goes to the category the catalog remembers", async ({
      page,
    }) => {
      await openList(page);
      const { categories, itemIds } = await seedList(page, [
        { text: "Lechuga", name: "Lechuga", category: "Frutas y verduras" },
      ]);
      // Gone from the list, remembered by the catalog.
      await archiveItem(itemIds.get("Lechuga")!);
      await reloadList(page);
      await expect(
        pending(page).getByText(texts.list.pending.empty),
      ).toBeVisible();
      await expect(pending(page).locator("h3")).toHaveCount(0);

      // The insert is held: the row must already be in its group before the
      // server answers.
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route(ITEMS_API, async (route) => {
        if (route.request().method() === "POST") await held;
        await route.continue();
      });
      const request = page.waitForRequest(
        (r) => r.method() === "POST" && r.url().includes("/rest/v1/items"),
      );
      const input = field(page);
      await input.fill("lechuga");
      await input.press("Enter");

      const fruits = group(page, "Frutas y verduras");
      await expect(row(fruits, "lechuga")).toBeVisible({ timeout: ACTION_MS });
      await expect(group(page, texts.list.pending.uncategorized)).toHaveCount(
        0,
      );
      await expect(groupTitles(page)).toHaveText(["Frutas y verduras"]);

      const posted = (await request).postDataJSON() as PostedItem;
      expect(posted.category_id).toBe(categories.get("Frutas y verduras"));
      const saved = nextWrite(page, "POST", "lechuga");
      release();
      await saved;
      await expect(row(fruits, "lechuga")).toBeVisible();
    });

    test("emptying the cart archives its rows and shows the moment once", async ({
      page,
    }) => {
      await openList(page);
      for (const [text, name] of [
        ["Pan", "Pan"],
        ["Leche x3", "Leche"],
        ["Yerba", "Yerba"],
        ["Fideos", "Fideos"],
      ]) {
        await addAndSync(page, text, name);
      }
      for (const name of ["Pan", "Leche", "Yerba"]) {
        await checkAndSync(page, name);
      }
      await expect(count(cart(page))).toHaveText("3");
      await expect(emptyAction(page)).toBeVisible();

      const archived = emptyCartWrite(page);
      await emptyAction(page).click();

      for (const name of ["Pan", "Leche", "Yerba"]) {
        await expect(checkbox(page, name)).toHaveCount(0, {
          timeout: ACTION_MS,
        });
      }
      await expect(cart(page)).toHaveCount(0);
      await expect(moment(page)).toBeVisible({ timeout: ACTION_MS });
      await expect(moment(page)).toContainText(
        texts.moments.cartEmptied.eyebrow,
      );
      await expect(moment(page)).toContainText(
        `${texts.moments.cartEmptied.lead} ${texts.moments.cartEmptied.em}`,
      );
      await expect(moment(page).locator("em")).toHaveText(
        texts.moments.cartEmptied.em,
      );
      await expect(moment(page)).toContainText(texts.moments.cartEmptied.body);
      await expect(momentAction(page)).toBeFocused();
      await expect(emptyAction(page)).toHaveCount(0);
      // What was not bought stays.
      await expect(row(pending(page), "Fideos")).toBeVisible();

      // The server archived them, and the moment stays until it is dismissed.
      await archived;
      await expect(moment(page)).toBeVisible();

      await reloadList(page);
      await expect(cart(page).getByText(texts.list.cart.empty)).toBeVisible();
      await expect(cart(page).locator("li")).toHaveCount(0);
      await expect(moment(page)).toHaveCount(0);
      await expect(emptyAction(page)).toHaveCount(0);
      await expect(pending(page).locator("li")).toHaveCount(1);
      await expect(row(pending(page), "Fideos")).toBeVisible();
      for (const name of ["Pan", "Leche", "Yerba"]) {
        await expect(checkbox(page, name)).toHaveCount(0);
      }
    });

    test("dismissing the moment brings the empty cart back and focuses the field", async ({
      page,
    }) => {
      await openList(page);
      await addAndSync(page, "Pan", "Pan");
      await checkAndSync(page, "Pan");

      const archived = emptyCartWrite(page);
      await emptyAction(page).click();
      await expect(moment(page)).toBeVisible({ timeout: ACTION_MS });
      await expect(momentAction(page)).toBeFocused();

      await momentAction(page).click();
      await expect(moment(page)).toHaveCount(0);
      await expect(cart(page).getByText(texts.list.cart.empty)).toBeVisible();
      await expect(count(cart(page))).toHaveCount(0);
      await expect(emptyAction(page)).toHaveCount(0);
      await expect(field(page)).toBeFocused();

      // It does not come back when the server answers and the list refreshes.
      await archived;
      await expect(moment(page)).toHaveCount(0);
      await expect(cart(page).getByText(texts.list.cart.empty)).toBeVisible();
      await expect(checkbox(page, "Pan")).toHaveCount(0);
    });

    test("a rejected emptying brings the rows back and warns", async ({
      page,
    }) => {
      await openList(page);
      await addAndSync(page, "Pan", "Pan");
      await addAndSync(page, "Leche x3", "Leche");
      await checkAndSync(page, "Pan");
      await checkAndSync(page, "Leche");
      await expect(count(cart(page))).toHaveText("2");
      await rejectItems(page, "PATCH");

      await emptyAction(page).click();

      const notice = banner(page);
      await expect(notice).toContainText(texts.itemErrors.emptyCart);
      await expect(notice).toContainText(texts.itemErrors.emptyCartBody);
      await expect(moment(page)).toHaveCount(0);
      await expect(row(cart(page), "Pan")).toBeVisible();
      await expect(row(cart(page), "Leche")).toBeVisible();
      await expect(checkbox(page, "Pan")).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await expect(count(cart(page))).toHaveText("2");
      await expect(emptyAction(page)).toBeVisible();
      await expect(
        pending(page).getByText(texts.list.pending.empty),
      ).toBeVisible();

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

      test("the grouped list", async ({ page }, testInfo) => {
        await withoutServiceWorker(page);
        await openList(page);
        await seedList(page, [
          {
            text: "2 kg de tomates",
            name: "tomates",
            category: "Frutas y verduras",
          },
          { text: "Lechuga", name: "Lechuga", category: "Frutas y verduras" },
          {
            text: "Yogur natural x4",
            name: "Yogur natural",
            category: "Fiambres y lácteos",
          },
          { text: "Leche 2 L", name: "Leche", category: "Fiambres y lácteos" },
          { text: "Lavandina", name: "Lavandina", category: "Limpieza" },
          { text: "Pan de campo", name: "Pan de campo", category: "Panadería" },
          { text: "Fideos 2 paquetes", name: "Fideos" },
        ]);
        await checkAndSync(page, "Lechuga");
        await expect(groupTitles(page)).toHaveText([
          "Frutas y verduras",
          "Fiambres y lácteos",
          "Panadería",
          "Limpieza",
          "Otros",
        ]);
        await expect(groupCounts(page)).toHaveText(["1", "2", "1", "1", "1"]);

        await settle(page);
        await expectNoHorizontalOverflow(page);
        await capture(page, testInfo, `list-grouped-${mode}`);
      });

      test("the emptied cart moment", async ({ page }, testInfo) => {
        await withoutServiceWorker(page);
        await openList(page);
        await addAndSync(page, "Pan", "Pan");
        await addAndSync(page, "Leche x3", "Leche");
        await addAndSync(page, "Yerba", "Yerba");
        await checkAndSync(page, "Pan");
        await checkAndSync(page, "Leche");
        await emptyAction(page).click();
        await expect(moment(page)).toBeVisible({ timeout: ACTION_MS });
        await expect(momentAction(page)).toBeFocused();

        await settle(page);
        await expectNoHorizontalOverflow(page);
        await capture(page, testInfo, `moment-${mode}`);
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

      test("the edit sheet and the delete confirmation", async ({
        page,
      }, testInfo) => {
        await withoutServiceWorker(page);
        await openList(page);
        await addAndSync(
          page,
          "1,5 L de aceite de girasol",
          "aceite de girasol",
        );
        await addWithEnter(page, "Pan", "Pan");

        // Una nota para que la hoja se vea completa.
        await openEditor(page, "aceite de girasol");
        await editorField(page, texts.editItem.note).fill("Marca Optimo");
        await save(page);
        await expect(editor(page)).toBeHidden({ timeout: ACTION_MS });
        await expect(row(pending(page), "aceite de girasol")).toContainText(
          "Marca Optimo",
        );

        await openEditor(page, "aceite de girasol");
        await expect(editorField(page, texts.editItem.quantity)).toHaveValue(
          "1,5",
        );
        await expect(editorField(page, texts.editItem.unit)).toHaveValue("L");
        await expect(editorField(page, texts.editItem.note)).toHaveValue(
          "Marca Optimo",
        );
        await settle(page);
        await expectNoHorizontalOverflow(page);
        await capture(page, testInfo, `edit-sheet-${mode}`);

        await removeButton(page).click();
        await expect(removeButton(page)).toHaveText(
          texts.editItem.confirmRemove,
        );
        await settle(page);
        await expectNoHorizontalOverflow(page);
        await capture(page, testInfo, `edit-sheet-confirm-${mode}`);
      });
    });
  }
});
