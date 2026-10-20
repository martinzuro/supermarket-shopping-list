import { expect, test, type Page } from "@playwright/test";
import { texts } from "../src/lib/texts";
import { SCHEMES } from "./sharing";
import {
  captureViewport,
  cart,
  catalogLoaded,
  checkbox,
  editor,
  field,
  openAndCreateList,
  pending,
  removeButton,
  row,
  rowName,
  waitHydrated,
} from "./two-members";

/**
 * Phase 3, part (b), end to end against the local Supabase stack, for one
 * member at 375px in light and dark: the estimated price in the edit sheet
 * (its label follows the unit, the currency, the line total as help, the
 * error), the line total on the row, the totals at the foot of Pendientes and
 * of the cart (one per currency, "de N de M" when some lack a price, nothing
 * when none has one), a checked item taking its amount to the cart, and the
 * catalog giving the last price and currency back to a product added again.
 */

const t = texts;
const e = t.editItem;
const PESOS = `${e.currency.uyu.symbol}, ${e.currency.uyu.name}`;
const DOLLARS = `${e.currency.usd.symbol}, ${e.currency.usd.name}`;

function priceField(page: Page, label: string) {
  return editor(page).getByRole("textbox", { name: label, exact: true });
}

function currency(page: Page, name: string) {
  return editor(page).getByRole("radio", { name, exact: true });
}

function lineTotal(page: Page, name: string, section = pending(page)) {
  return row(section, name).locator('[data-slot="list-row-total"]');
}

function estimate(section: ReturnType<typeof pending>) {
  return section.locator('[data-slot="estimate"]');
}

async function openEditor(page: Page, name: string) {
  await rowName(pending(page), name).click();
  await expect(editor(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function saveEditor(page: Page) {
  await editor(page).getByRole("button", { name: e.save, exact: true }).click();
  await expect(editor(page)).toBeHidden();
}

async function add(page: Page, text: string, name = text) {
  await field(page).fill(text);
  await field(page).press("Enter");
  await expect(row(pending(page), name)).toBeVisible();
}

async function reload(page: Page) {
  const catalog = catalogLoaded(page);
  await page.reload();
  await expect(field(page)).toBeVisible();
  await waitHydrated(page);
  await catalog;
}

/** Sets the price (and the currency) of an item in its sheet and saves. */
async function price(
  page: Page,
  name: string,
  label: string,
  amount: string,
  radio?: string,
) {
  await openEditor(page, name);
  await priceField(page, label).fill(amount);
  if (radio) await currency(page, radio).click();
  await saveEditor(page);
}

for (const scheme of SCHEMES) {
  test.describe(`phase 3b, price and totals (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("a price per kilo, in dollars, the totals, the cart and the catalog", async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000);
      await openAndCreateList(page);

      // Nothing has a price: no total line, never "$ 0".
      await add(page, "2 kg de tomates", "tomates");
      await expect(estimate(pending(page))).toHaveCount(0);
      await expect(lineTotal(page, "tomates")).toHaveCount(0);

      // 2 kg: the field is the price of a kilo, and the line says what two
      // cost, in mono, as it is typed.
      await openEditor(page, "tomates");
      const kilo = priceField(page, e.price.kg);
      await expect(kilo).toHaveAttribute("inputmode", "decimal");
      await expect(kilo).toHaveValue("");
      await expect(currency(page, PESOS)).toBeChecked();
      await expect(currency(page, DOLLARS)).not.toBeChecked();
      await kilo.fill("89,50");
      const help = editor(page).locator(
        "#" + (await kilo.getAttribute("id")) + "-help",
      );
      await expect(help).toHaveText("Total: $ 179");
      await expect(help.locator("span")).toHaveCSS(
        "font-family",
        /Geist Mono|geist_mono|monospace/i,
      );
      await captureViewport(page, testInfo, `edit-sheet-price-${scheme}`);
      await saveEditor(page);

      await expect(lineTotal(page, "tomates")).toHaveText("$ 179");
      await expect(estimate(pending(page))).toContainText(
        t.list.estimate.label,
      );
      await expect(estimate(pending(page))).toContainText("$ 179");
      // The only item has a price: no "de N de M".
      await expect(
        estimate(pending(page)).locator('[data-slot="estimate-covered"]'),
      ).toHaveCount(0);

      // An item without price does not add up, and the line says so.
      await add(page, "leche");
      await expect(lineTotal(page, "leche")).toHaveCount(0);
      await expect(estimate(pending(page))).toContainText("$ 179");
      await expect(estimate(pending(page))).toContainText(
        t.list.estimate.covered(1, 2),
      );

      // A product in dollars makes a second total. No quantity counts as 1.
      await add(page, "yerba");
      await price(page, "yerba", e.price.unit, "10", DOLLARS);
      await expect(lineTotal(page, "yerba")).toHaveText("US$ 10");
      await expect(estimate(pending(page))).toContainText("$ 179 · US$ 10");
      await expect(estimate(pending(page))).toContainText(
        t.list.estimate.covered(2, 3),
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await captureViewport(page, testInfo, `list-totals-${scheme}`);

      // The price of a litre follows the unit typed in the sheet, live.
      await openEditor(page, "leche");
      await expect(priceField(page, e.price.unit)).toBeVisible();
      await editor(page)
        .getByRole("textbox", { name: e.unit, exact: true })
        .fill("ml");
      await expect(priceField(page, e.price.L)).toBeVisible();
      await editor(page)
        .getByRole("textbox", { name: e.unit, exact: true })
        .fill("");
      await expect(priceField(page, e.price.unit)).toBeVisible();

      // An invalid price shows the error, takes the focus and keeps the sheet.
      await priceField(page, e.price.unit).fill("12,345");
      await editor(page)
        .getByRole("button", { name: e.save, exact: true })
        .click();
      await expect(editor(page)).toBeVisible();
      await expect(
        editor(page).getByText(e.errors.price, { exact: true }),
      ).toBeVisible();
      await expect(priceField(page, e.price.unit)).toBeFocused();
      await expect(priceField(page, e.price.unit)).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await captureViewport(page, testInfo, `edit-sheet-price-error-${scheme}`);
      await page.keyboard.press("Escape");
      await expect(editor(page)).toBeHidden();
      await expect(lineTotal(page, "leche")).toHaveCount(0);

      // Checking moves the amount from Pendientes to the cart.
      await checkbox(page, "tomates").click();
      await expect(row(cart(page), "tomates")).toBeVisible();
      await expect(lineTotal(page, "tomates", cart(page))).toHaveText("$ 179");
      await expect(estimate(cart(page))).toContainText("$ 179");
      await expect(
        estimate(cart(page)).locator('[data-slot="estimate-covered"]'),
      ).toHaveCount(0);
      await expect(estimate(pending(page))).toContainText("US$ 10");
      await expect(estimate(pending(page))).not.toContainText("$ 179");
      await expect(estimate(pending(page))).toContainText(
        t.list.estimate.covered(1, 2),
      );
      await cart(page).scrollIntoViewIfNeeded();
      await captureViewport(page, testInfo, `cart-total-${scheme}`);

      // A cart with nothing priced shows no total: the unchecked item goes
      // to the cart and Pendientes loses its line with its last priced item.
      await checkbox(page, "yerba").click();
      await expect(row(cart(page), "yerba")).toBeVisible();
      await expect(estimate(cart(page))).toContainText("$ 179 · US$ 10");
      await expect(estimate(pending(page))).toHaveCount(0);

      // Both survive a reload, and the catalog gives the last price and
      // currency back to a product that is deleted and added again.
      await reload(page);
      await expect(lineTotal(page, "yerba", cart(page))).toHaveText("US$ 10");
      await checkbox(page, "yerba").click();
      await expect(row(pending(page), "yerba")).toBeVisible();
      await openEditor(page, "yerba");
      const remove = removeButton(page);
      await remove.click();
      await expect(remove).toHaveAttribute("data-armed", "true");
      await remove.click();
      await expect(row(pending(page), "yerba")).toHaveCount(0);
      await expect(estimate(pending(page))).toHaveCount(0);
      await add(page, "yerba");
      await expect(lineTotal(page, "yerba")).toHaveText("US$ 10");
      await expect(estimate(pending(page))).toContainText("US$ 10");
      await openEditor(page, "yerba");
      await expect(priceField(page, e.price.unit)).toHaveValue("10");
      await expect(currency(page, DOLLARS)).toBeChecked();
      await page.keyboard.press("Escape");
      await expect(editor(page)).toBeHidden();
    });

    test("a long name still truncates, and nothing pushes the check target", async ({
      page,
    }, testInfo) => {
      test.setTimeout(60_000);
      await openAndCreateList(page);
      const long =
        "aceitunas rellenas con morrón importadas de España en frasco grande";
      await add(page, `12 un de ${long}`, long);
      await price(page, long, e.price.unit, "1.234,50", DOLLARS);
      await expect(lineTotal(page, long)).toHaveText("US$ 14.814");

      const item = row(pending(page), long);
      const name = item.locator('[data-slot="list-row-name"] .truncate');
      const figures = item.locator('[data-slot="list-row-figures"]');
      const box = checkbox(page, long);
      const [nameBox, figuresBox, checkBox, itemBox] = await Promise.all([
        name.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { right: r.right, truncated: el.scrollWidth > el.clientWidth };
        }),
        figures.boundingBox(),
        box.boundingBox(),
        item.boundingBox(),
      ]);
      expect(nameBox.truncated, "the long name is cut with an ellipsis").toBe(
        true,
      );
      expect(nameBox.right).toBeLessThanOrEqual(figuresBox!.x);
      expect(checkBox!.width).toBeGreaterThanOrEqual(44);
      expect(checkBox!.height).toBeGreaterThanOrEqual(44);
      expect(itemBox!.height).toBeGreaterThanOrEqual(56);
      expect(figuresBox!.x + figuresBox!.width).toBeLessThanOrEqual(375);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        "no horizontal overflow",
      ).toBe(true);
      await captureViewport(page, testInfo, `long-name-total-${scheme}`);
    });

    test("Guardar and Borrar stay in view while the form scrolls", async ({
      page,
    }, testInfo) => {
      test.setTimeout(60_000);
      await openAndCreateList(page);
      await add(page, "2 kg de tomates", "tomates");
      await openEditor(page, "tomates");
      const sheet = editor(page);
      const footer = sheet.locator('[data-slot="sheet-footer"]');
      const save = sheet.getByRole("button", { name: e.save, exact: true });
      const remove = removeButton(page);
      await page.waitForTimeout(500);

      // The form is taller than the sheet (it scrolls), and the footer is
      // inside the viewport at the top of the scroll anyway.
      const scrolls = await sheet.evaluate((el) => ({
        scrolls: el.scrollHeight > el.clientHeight + 40,
        top: el.scrollTop,
      }));
      expect(scrolls).toEqual({ scrolls: true, top: 0 });
      for (const button of [save, remove]) {
        const box = await button.boundingBox();
        expect(box!.y + box!.height).toBeLessThanOrEqual(812);
      }
      // On paper, a 1px rule on top, no shadow.
      await expect(footer).toHaveCSS("position", "sticky");
      await expect(footer).toHaveCSS("border-top-width", "1px");
      await expect(footer).toHaveCSS("box-shadow", "none");
      await captureViewport(page, testInfo, `edit-sheet-top-${scheme}`);

      // A field the footer would cover scrolls clear of it when focused.
      const note = sheet.getByRole("textbox", { name: e.note, exact: true });
      await note.focus();
      await page.waitForTimeout(300);
      const [noteBox, footerBox] = await Promise.all([
        note.boundingBox(),
        footer.boundingBox(),
      ]);
      expect(noteBox!.y + noteBox!.height).toBeLessThanOrEqual(footerBox!.y);

      // At the end of the scroll the footer is where it was.
      await sheet.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await page.waitForTimeout(300);
      const after = await save.boundingBox();
      expect(after!.y + after!.height).toBeLessThanOrEqual(812);
      await captureViewport(page, testInfo, `edit-sheet-end-${scheme}`);
    });
  });
}
