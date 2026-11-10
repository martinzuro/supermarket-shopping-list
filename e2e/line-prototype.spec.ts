import { expect, test, type Page } from "@playwright/test";
import { REFLOW_IDLE_MS } from "../src/components/list/deferred-reflow";
import { texts } from "../src/lib/texts";

/**
 * The "línea del súper" prototype (/design/linea): sample data, no stack
 * needed. It starts mid-trip at the meat counter, with the bakery and the
 * greengrocer behind.
 */

const t = texts.design.line;
const names = texts.design.categories.names;

const stop = (page: Page) =>
  page.locator("[data-slot=line] > li[aria-current=step]");

test.describe("la línea del súper", () => {
  test("finishing a station sends you to the next one", async ({ page }) => {
    await page.goto("/design/linea");
    await expect(stop(page)).toHaveAttribute("data-stop", "carnes");

    await page.getByRole("checkbox", { name: "Carne picada" }).click();
    await page.getByRole("checkbox", { name: "Pechugas" }).click();
    // Everything checked: it says what comes, and waits.
    await expect(stop(page).getByText(t.ready(names.almacen))).toBeVisible();

    await expect(stop(page)).toHaveAttribute("data-stop", "almacen");
    await expect(page.locator("[data-slot=line-board]")).toContainText(
      names.almacen,
    );
    await expect(page.locator("[data-slot=line-announcement]")).toHaveText(
      t.arrived(names.almacen, 4, 7),
    );
    // The checkbox went with its station: the focus is where you are now.
    await expect(page.locator("#line-current")).toBeFocused();
    await expect(page.locator("[data-stop=carnes]")).toHaveAttribute(
      "data-kind",
      "passed",
    );
  });

  test("a check undone in time keeps you at the station", async ({ page }) => {
    await page.goto("/design/linea");
    await page.getByRole("checkbox", { name: "Carne picada" }).click();
    await page.getByRole("checkbox", { name: "Pechugas" }).click();
    await page.getByRole("checkbox", { name: "Pechugas" }).click();
    await page.waitForTimeout(REFLOW_IDLE_MS + 500);
    await expect(stop(page)).toHaveAttribute("data-stop", "carnes");
  });

  test("a finished station you go back to waits for you", async ({ page }) => {
    await page.goto("/design/linea");
    await page
      .getByRole("button", {
        name: new RegExp(`^${t.goBack}${names.panaderia}`),
      })
      .click();
    await expect(stop(page)).toHaveAttribute("data-stop", "panaderia");
    // Everything there is checked, but nothing was checked there yet.
    await page.waitForTimeout(REFLOW_IDLE_MS + 500);
    await expect(stop(page)).toHaveAttribute("data-stop", "panaderia");
    await expect(stop(page).getByText(t.here(1, 7))).toBeVisible();
  });

  test("the list's own order starts the line elsewhere", async ({ page }) => {
    await page.goto("/design/linea");
    await page.getByRole("button", { name: t.controls.useList }).click();
    // Fruit and meat done; the bakery waits after the dairy.
    await expect(stop(page)).toHaveAttribute("data-stop", "lacteos");
    await expect(page.getByText(t.listOrder)).toBeVisible();
    await expect(page.locator("[data-stop=panaderia]")).toHaveAttribute(
      "data-kind",
      "upcoming",
    );
  });

  test("a product added behind you says so, and you can go back", async ({
    page,
  }) => {
    await page.goto("/design/linea");
    await page.getByRole("button", { name: t.controls.late }).click();

    const notice = page.getByText(t.late.title(t.sample.late.name));
    await expect(notice).toBeVisible();
    await expect(
      page.getByText(t.late.byOther(t.sample.lateBy, names.panaderia)),
    ).toBeVisible();

    await page.getByRole("button", { name: t.late.back, exact: true }).click();
    await expect(stop(page)).toHaveAttribute("data-stop", "panaderia");
    await expect(notice).toHaveCount(0);

    // Done there, the line skips what is finished and takes you back.
    await page.getByRole("checkbox", { name: t.sample.late.name }).click();
    await expect(stop(page)).toHaveAttribute("data-stop", "carnes");
  });

  test("going ahead leaves what was skipped behind, up to the checkout", async ({
    page,
  }) => {
    await page.goto("/design/linea");
    await page
      .getByRole("button", { name: new RegExp(`^${t.goTo}${names.bebidas}`) })
      .click();
    await expect(stop(page)).toHaveAttribute("data-stop", "bebidas");
    await expect(page.locator("[data-stop=almacen]")).toHaveAttribute(
      "data-kind",
      "passed",
    );

    await page.getByRole("button", { name: texts.shopping.finish }).click();
    await expect(stop(page)).toHaveAttribute("data-stop", "caja");
    // Meat 2, pantry 4, dairy 3, drinks 1, cleaning 2.
    await expect(
      page.getByText(
        t.leftBehind(12, [
          names.carnes,
          names.almacen,
          names.lacteos,
          names.bebidas,
          names.limpieza,
        ]),
      ),
    ).toBeVisible();
  });
});
