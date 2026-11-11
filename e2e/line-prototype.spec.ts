import { expect, test, type Page } from "@playwright/test";
import { texts } from "../src/lib/texts";

/**
 * The "línea del súper" prototype (/design/linea): sample data, no stack
 * needed. It starts mid-trip at the meat counter, with the bakery and the
 * greengrocer behind.
 */

const t = texts.design.line;
const names = texts.design.categories.names;

const board = (page: Page) => page.locator("[data-slot=line-board]");
const next = (page: Page) => page.locator("[data-slot=line-next]");
const node = (page: Page, stop: string) =>
  page.locator(`[data-slot=line-rail] button[data-stop=${stop}]`);

test.describe("la línea del súper", () => {
  test("the button says what comes next and waits for the tap", async ({
    page,
  }) => {
    await page.goto("/design/linea");
    await expect(board(page)).toHaveAttribute("data-stop", "carnes");
    await expect(next(page)).toHaveText(t.next(names.almacen));
    await expect(next(page)).toHaveAttribute("data-ready", "false");

    await page.getByRole("checkbox", { name: "Carne picada" }).click();
    await page.getByRole("checkbox", { name: "Pechugas" }).click();
    // Everything checked: it fills, and nothing moves on its own.
    await expect(next(page)).toHaveAttribute("data-ready", "true");
    await expect(board(page)).toHaveAttribute("data-stop", "carnes");

    await next(page).click();
    await expect(board(page)).toHaveAttribute("data-stop", "almacen");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      names.almacen,
    );
    await expect(page.locator("[data-slot=line-announcement]")).toHaveText(
      t.arrived(names.almacen, 4, 7),
    );
    await expect(node(page, "carnes")).toHaveAttribute("data-kind", "passed");
    await expect(node(page, "almacen")).toHaveAttribute("aria-current", "step");
  });

  test("a node of the rail takes you there, and what was skipped stays behind", async ({
    page,
  }) => {
    await page.goto("/design/linea");
    await node(page, "bebidas").click();
    await expect(board(page)).toHaveAttribute("data-stop", "bebidas");
    await expect(node(page, "almacen")).toHaveAttribute("data-kind", "passed");
    // Four products of the pantry were left: its branch says so.
    await expect(
      node(page, "almacen").locator("[data-slot=line-behind]"),
    ).toHaveText(t.behindTag(4));
  });

  test("sliding along the rail shows each stop and lands on the last one", async ({
    page,
  }) => {
    await page.goto("/design/linea");
    const rail = page.locator("[data-slot=line-rail]");
    const box = (await rail.boundingBox())!;
    const target = (await node(page, "lacteos").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, target.y + target.height / 2, {
      steps: 5,
    });
    await expect(page.locator("[data-slot=line-scrub]")).toHaveText(
      names.lacteos,
    );
    await page.mouse.up();
    await expect(board(page)).toHaveAttribute("data-stop", "lacteos");
    await expect(page.locator("[data-slot=line-scrub]")).toHaveCount(0);
  });

  test("a product added behind you says so, and you can go back", async ({
    page,
  }) => {
    await page.goto("/design/linea");
    await page.getByRole("button", { name: t.controls.late }).click();

    const notice = page.locator("[data-slot=line-late]");
    await expect(notice).toHaveText(
      new RegExp(
        t.late.byOther(t.sample.late.name, t.sample.lateBy, names.panaderia),
      ),
    );
    await expect(
      node(page, "panaderia").locator("[data-slot=line-behind]"),
    ).toHaveText(t.behindTag(1));

    await notice.getByRole("button", { name: t.late.back }).click();
    await expect(board(page)).toHaveAttribute("data-stop", "panaderia");
    await expect(notice).toHaveCount(0);

    // Done there, the button skips what is finished and takes you back.
    await page.getByRole("checkbox", { name: t.sample.late.name }).click();
    await expect(next(page)).toHaveText(t.next(names.carnes));
    await next(page).click();
    await expect(board(page)).toHaveAttribute("data-stop", "carnes");
  });

  test("the checkout prints the trip as a ticket, with what was not found", async ({
    page,
  }) => {
    await page.goto("/design/linea");
    await node(page, "caja").click();
    await expect(board(page)).toHaveAttribute("data-stop", "caja");
    const ticket = page.locator("[data-slot=line-ticket]");
    await expect(ticket).toContainText(t.ticket.count(7, 19));
    // Meat 2, pantry 4, dairy 3, drinks 1, cleaning 2.
    const stub = ticket.locator("[data-slot=line-stub]");
    await expect(stub.getByRole("listitem")).toHaveCount(5);
    await expect(stub).toContainText(t.ticket.missingCount(4));

    await page.getByRole("button", { name: t.restart }).click();
    await expect(board(page)).toHaveAttribute("data-stop", "carnes");
  });

  test("a list without categories is one station and the rail measures the cart", async ({
    page,
  }) => {
    await page.goto("/design/linea");
    await page.getByRole("button", { name: t.controls.useSimple }).click();
    await expect(board(page)).toHaveAttribute("data-stop", "lista");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      t.simple,
    );
    // The whole list in one place, and only the checkout ahead.
    await expect(
      page.locator("[data-slot=line-rows]").getByRole("checkbox"),
    ).toHaveCount(19);
    await expect(page.locator("[data-slot=line-rail] button")).toHaveCount(2);
    await expect(next(page)).toHaveText(t.toCheckout);

    await next(page).click();
    await expect(page.locator("[data-slot=line-ticket]")).toContainText(
      t.ticket.count(7, 19),
    );
  });

  test("the list's own order starts the line elsewhere", async ({ page }) => {
    await page.goto("/design/linea");
    await page.getByRole("button", { name: t.controls.useList }).click();
    // Fruit and meat done; the bakery waits after the dairy.
    await expect(board(page)).toHaveAttribute("data-stop", "lacteos");
    await expect(page.getByText(t.listOrder)).toBeVisible();
    await expect(node(page, "panaderia")).toHaveAttribute(
      "data-kind",
      "upcoming",
    );
  });
});
