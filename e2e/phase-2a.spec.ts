import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { texts } from "../src/lib/texts";

/**
 * Criterio de salida de la Fase 2a, de punta a punta contra el stack local de
 * Supabase: una persona añade diez ítems, marca seis, edita dos, borra uno y
 * vacía el carro, todo en menos de dos segundos por acción, sin perder el foco
 * del campo al añadir, y ve el momento "Buena compra" una vez.
 *
 * Los helpers repiten los de list.spec.ts (que sigue siendo la referencia).
 */

const ACTION_MS = 2000;

function pending(page: Page) {
  return page.locator("#pending");
}

function cart(page: Page) {
  return page.locator("#cart");
}

function field(page: Page) {
  return page.getByRole("combobox", { name: texts.addItem.label });
}

function row(section: Locator, name: string) {
  return section.locator("li").filter({
    has: section.page().getByRole("checkbox", { name, exact: true }),
  });
}

function checkbox(page: Page, name: string) {
  return page.getByRole("checkbox", { name, exact: true });
}

function count(section: Locator) {
  return section.locator("h2 [data-numeric]");
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

function removeButton(page: Page) {
  return editor(page).getByRole("button", {
    name: new RegExp(
      `^(${texts.editItem.remove}|${texts.editItem.confirmRemove})$`,
    ),
  });
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

/** La respuesta al vaciado: la RPC que archiva y guarda la compra (F-4). */
function emptyCartWrite(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/rest/v1/rpc/empty_cart",
  );
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
  await expect(pending(page).getByText(texts.list.pending.empty)).toBeVisible();
  await waitHydrated(page);
  await catalog;
}

async function reloadList(page: Page) {
  const catalog = catalogLoaded(page);
  await page.reload();
  await expect(field(page)).toBeVisible();
  await waitHydrated(page);
  await catalog;
}

/** Sin service worker las peticiones pasan por la página, como en un navegador sin ellos. */
async function withoutServiceWorker(page: Page) {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Navigator.prototype, "serviceWorker");
  });
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

type Kind = "add" | "check" | "edit" | "delete" | "empty";

const KINDS: Kind[] = ["add", "check", "edit", "delete", "empty"];

/**
 * Mide una acción: desde justo antes del gesto (clic o tecla) hasta que las
 * aserciones de la interfaz pasan. Incluye la espera de actionability de
 * Playwright y la pausa de 320 ms de la fila al marcar.
 */
function timer() {
  const samples = new Map<Kind, { label: string; ms: number }[]>();

  async function measure(
    kind: Kind,
    label: string,
    gesture: () => Promise<void>,
    outcome: () => Promise<void>,
  ) {
    const start = Date.now();
    await gesture();
    await outcome();
    const ms = Date.now() - start;
    samples.set(kind, [...(samples.get(kind) ?? []), { label, ms }]);
    expect(ms, `${kind} "${label}" took ${ms} ms`).toBeLessThan(ACTION_MS);
  }

  function report(testInfo: TestInfo) {
    const lines: string[] = [];
    for (const kind of KINDS) {
      const all = samples.get(kind) ?? [];
      if (all.length === 0) continue;
      const slowest = all.reduce((a, b) => (b.ms > a.ms ? b : a));
      const mean = Math.round(
        all.reduce((sum, s) => sum + s.ms, 0) / all.length,
      );
      const line = `${kind.padEnd(6)} n=${all.length} max=${slowest.ms} ms (${slowest.label}) mean=${mean} ms`;
      lines.push(line);
      testInfo.annotations.push({ type: `timing ${kind}`, description: line });
    }
    console.log(
      `[phase-2a timing r${testInfo.repeatEachIndex}]\n${lines.join("\n")}`,
    );
    console.log(
      `[phase-2a max] ${JSON.stringify(
        Object.fromEntries(
          KINDS.map((kind) => [
            kind,
            Math.max(0, ...(samples.get(kind) ?? []).map((s) => s.ms)),
          ]),
        ),
      )}`,
    );
  }

  return { measure, report };
}

type Added = { text: string; name: string; quantity?: string };

const ITEMS: Added[] = [
  { text: "Pan", name: "Pan" },
  { text: "2 kg de tomates", name: "Tomates", quantity: "2 kg" },
  { text: "Leche x3", name: "Leche", quantity: "3" },
  { text: "Yerba", name: "Yerba" },
  { text: "Fideos 2 paquetes", name: "Fideos", quantity: "2 paquetes" },
  {
    text: "1,5 L de aceite de girasol",
    name: "Aceite de girasol",
    quantity: "1,5 L",
  },
  { text: "Lechuga", name: "Lechuga" },
  { text: "Yogur natural x4", name: "Yogur natural", quantity: "4" },
  { text: "Arroz", name: "Arroz" },
  { text: "Lavandina", name: "Lavandina" },
];

const CHECKED = [
  "Pan",
  "Tomates",
  "Leche",
  "Yerba",
  "Fideos",
  "Aceite de girasol",
];

// This needs the local stack: `npm run db:start` locally; the CI E2E job starts it.
test.describe("phase 2a exit criterion", () => {
  test.skip(
    process.env.E2E_SUPABASE !== "1",
    "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
  );

  test.use({ colorScheme: "light", viewport: { width: 375, height: 812 } });

  test("add ten, check six, edit two, delete one and empty the cart", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    await withoutServiceWorker(page);
    const { measure, report } = timer();
    try {
      await openList(page);
      const input = field(page);

      // 1. Add ten, with Enter. The focus never leaves the field.
      for (const [index, item] of ITEMS.entries()) {
        await input.fill(item.text);
        await measure(
          "add",
          item.name,
          () => input.press("Enter"),
          async () => {
            const added = row(pending(page), item.name);
            await expect(added).toBeVisible({ timeout: ACTION_MS });
            await expect(input).toHaveValue("", { timeout: ACTION_MS });
            await expect(input).toBeFocused({ timeout: ACTION_MS });
            await expect(count(pending(page))).toHaveText(String(index + 1), {
              timeout: ACTION_MS,
            });
            if (item.quantity) {
              await expect(added.locator("[data-numeric]")).toHaveText(
                item.quantity,
                { timeout: ACTION_MS },
              );
            } else {
              await expect(added.locator("[data-numeric]")).toHaveCount(0);
            }
          },
        );
      }
      await expect(pending(page).locator("li")).toHaveCount(10);
      await expect(count(pending(page))).toHaveText("10");
      await expect(cart(page).locator("li")).toHaveCount(0);

      // 2. Check six: each lands in the cart within the budget, the 320 ms
      // hold of the strike included.
      for (const [index, name] of CHECKED.entries()) {
        await measure(
          "check",
          name,
          () => checkbox(page, name).click(),
          async () => {
            await expect(row(cart(page), name)).toBeVisible({
              timeout: ACTION_MS,
            });
            await expect(row(pending(page), name)).toHaveCount(0, {
              timeout: ACTION_MS,
            });
            await expect(checkbox(page, name)).toHaveAttribute(
              "aria-checked",
              "true",
              { timeout: ACTION_MS },
            );
            await expect(count(pending(page))).toHaveText(
              String(10 - (index + 1)),
              { timeout: ACTION_MS },
            );
            await expect(count(cart(page))).toHaveText(String(index + 1), {
              timeout: ACTION_MS,
            });
          },
        );
      }
      await expect(count(pending(page))).toHaveText("4");
      await expect(count(cart(page))).toHaveText("6");

      // 3. Edit two: a rename with a note, and a new quantity.
      await rowName(pending(page), "Lechuga").click();
      await expect(editor(page)).toBeVisible();
      await expect(editorField(page, texts.editItem.name)).toHaveValue(
        "Lechuga",
      );
      await editorField(page, texts.editItem.name).fill("Lechuga criolla");
      await editorField(page, texts.editItem.note).fill("Bien verde");
      await measure(
        "edit",
        "Lechuga criolla",
        () =>
          editor(page)
            .getByRole("button", { name: texts.editItem.save, exact: true })
            .click(),
        async () => {
          const edited = row(pending(page), "Lechuga criolla");
          await expect(edited).toBeVisible({ timeout: ACTION_MS });
          await expect(edited).toContainText("Bien verde", {
            timeout: ACTION_MS,
          });
          await expect(row(pending(page), "Lechuga")).toHaveCount(0, {
            timeout: ACTION_MS,
          });
          await expect(editor(page)).toBeHidden({ timeout: ACTION_MS });
          await expect(rowName(pending(page), "Lechuga criolla")).toBeFocused({
            timeout: ACTION_MS,
          });
        },
      );

      await rowName(pending(page), "Yogur natural").click();
      await expect(editor(page)).toBeVisible();
      await expect(editorField(page, texts.editItem.quantity)).toHaveValue("4");
      await editorField(page, texts.editItem.quantity).fill("6");
      await measure(
        "edit",
        "Yogur natural",
        () =>
          editor(page)
            .getByRole("button", { name: texts.editItem.save, exact: true })
            .click(),
        async () => {
          await expect(
            row(pending(page), "Yogur natural").locator("[data-numeric]"),
          ).toHaveText("6", { timeout: ACTION_MS });
          await expect(editor(page)).toBeHidden({ timeout: ACTION_MS });
          await expect(rowName(pending(page), "Yogur natural")).toBeFocused({
            timeout: ACTION_MS,
          });
        },
      );
      await expect(count(pending(page))).toHaveText("4");

      // 4. Delete one: two taps, the second once the button is armed.
      await rowName(pending(page), "Lavandina").click();
      await expect(editor(page)).toBeVisible();
      const remove = removeButton(page);
      await remove.click();
      await expect(remove).toHaveText(texts.editItem.confirmRemove);
      // Un segundo toque inmediato es un doble toque: se espera al botón armado.
      await expect(remove).toHaveAttribute("data-armed", "true");
      await measure(
        "delete",
        "Lavandina",
        () => remove.click(),
        async () => {
          await expect(editor(page)).toBeHidden({ timeout: ACTION_MS });
          await expect(row(pending(page), "Lavandina")).toHaveCount(0, {
            timeout: ACTION_MS,
          });
          await expect(field(page)).toBeFocused({ timeout: ACTION_MS });
          await expect(count(pending(page))).toHaveText("3", {
            timeout: ACTION_MS,
          });
        },
      );

      // 5. Empty the cart: the moment shows once and takes the focus.
      await expect(emptyAction(page)).toBeVisible();
      const archived = emptyCartWrite(page);
      await measure(
        "empty",
        "cart",
        () => emptyAction(page).click(),
        async () => {
          for (const name of CHECKED) {
            await expect(checkbox(page, name)).toHaveCount(0, {
              timeout: ACTION_MS,
            });
          }
          await expect(cart(page)).toHaveCount(0, { timeout: ACTION_MS });
          await expect(moment(page)).toBeVisible({ timeout: ACTION_MS });
          await expect(momentAction(page)).toBeFocused({ timeout: ACTION_MS });
        },
      );
      await expect(moment(page)).toHaveCount(1);
      await expect(moment(page)).toContainText(
        texts.moments.cartEmptied.eyebrow,
      );
      await expect(moment(page)).toContainText(texts.moments.cartEmptied.body);
      await expect(emptyAction(page)).toHaveCount(0);
      await expect(count(pending(page))).toHaveText("3");

      // Dismiss it: the empty cart is back, the focus goes to the add field
      // and the moment does not come back, not even when the server answers
      // the emptying and the list refreshes.
      await momentAction(page).click();
      await expect(moment(page)).toHaveCount(0);
      await expect(cart(page).getByText(texts.list.cart.empty)).toBeVisible();
      await expect(field(page)).toBeFocused();
      await archived;
      await page.waitForTimeout(1000);
      await expect(moment(page)).toHaveCount(0);
      await expect(cart(page).getByText(texts.list.cart.empty)).toBeVisible();

      await settle(page);
      await capture(page, testInfo, "phase-2a-final");

      // Reload: no moment, empty cart, the three that were left with the two
      // edits, and the deleted one gone for good.
      await reloadList(page);
      await expect(moment(page)).toHaveCount(0);
      await expect(cart(page).getByText(texts.list.cart.empty)).toBeVisible();
      await expect(cart(page).locator("li")).toHaveCount(0);
      await expect(emptyAction(page)).toHaveCount(0);
      await expect(pending(page).locator("li")).toHaveCount(3);
      await expect(count(pending(page))).toHaveText("3");
      const lettuce = row(pending(page), "Lechuga criolla");
      await expect(lettuce).toBeVisible();
      await expect(lettuce).toContainText("Bien verde");
      await expect(
        row(pending(page), "Yogur natural").locator("[data-numeric]"),
      ).toHaveText("6");
      await expect(row(pending(page), "Arroz")).toBeVisible();
      for (const name of [...CHECKED, "Lechuga", "Lavandina"]) {
        await expect(checkbox(page, name)).toHaveCount(0);
      }
      await expect(moment(page)).toHaveCount(0);
    } finally {
      report(testInfo);
    }
  });
});
