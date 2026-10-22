import { expect, test, type Page, type Request } from "@playwright/test";
import { texts } from "../src/lib/texts";
import { SCHEMES } from "./sharing";
import { adminClient, seedCatalog } from "./supabase-admin";
import {
  captureViewport,
  catalogLoaded,
  checkbox,
  editor,
  editorField,
  field,
  openAndCreateList,
  pending,
  row,
  rowName,
  waitHydrated,
} from "./two-members";

/**
 * docs/improvements.md, M-6, end to end against the local Supabase stack at
 * 375px in light and dark: the name's first letter goes in capitals when a
 * product is added and when an edit is saved, and only that letter. What the
 * catalog remembers follows the name written last (its trigger copies it),
 * and the normalized name does not change. The list is read from the page;
 * the catalog is read with the service role.
 */

function recordWrites(page: Page, method: "POST" | "PATCH") {
  const bodies: Record<string, unknown>[] = [];
  page.on("request", (request: Request) => {
    if (
      new URL(request.url()).pathname === "/rest/v1/items" &&
      request.method() === method
    ) {
      bodies.push(request.postDataJSON() as Record<string, unknown>);
    }
  });
  return bodies;
}

/** What the catalog remembers of the list, by normalized name. */
async function catalogNames(listId: string) {
  const { data, error } = await adminClient()
    .from("catalog")
    .select("name_normalized, display_name")
    .eq("list_id", listId);
  if (error) throw error;
  return Object.fromEntries(
    data.map((entry) => [entry.name_normalized, entry.display_name]),
  );
}

async function reloadWithCatalog(page: Page) {
  const catalog = catalogLoaded(page);
  await page.reload();
  await expect(field(page)).toBeVisible();
  await waitHydrated(page);
  await catalog;
}

for (const scheme of SCHEMES) {
  test.describe(`M-6, names with a capital (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("a name typed in lowercase is saved with a capital, and so is its edit", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      const list = await openAndCreateList(page);
      const posts = recordWrites(page, "POST");
      const patches = recordWrites(page, "PATCH");

      const saved = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/rest/v1/items" &&
          response.request().method() === "POST",
      );
      await field(page).fill("papel higiénico");
      await field(page).press("Enter");
      expect((await saved).ok()).toBe(true);

      // On the list, in the request and in the catalog: one capital, and the
      // normalized name as ever.
      await expect(row(pending(page), "Papel higiénico")).toBeVisible();
      await expect(checkbox(page, "papel higiénico")).toHaveCount(0);
      expect(posts.map((body) => body.name)).toEqual(["Papel higiénico"]);
      await expect
        .poll(() => catalogNames(list.id))
        .toEqual({ "papel higienico": "Papel higiénico" });

      // The edit follows the same rule: only the first letter changes.
      await rowName(pending(page), "Papel higiénico").click();
      await expect(editor(page)).toBeVisible();
      await expect(editorField(page, texts.editItem.name)).toHaveValue(
        "Papel higiénico",
      );
      await editorField(page, texts.editItem.name).fill(
        "  papel higiénico Suave ",
      );
      await editor(page)
        .getByRole("button", { name: texts.editItem.save, exact: true })
        .click();

      await expect(editor(page)).toHaveCount(0);
      await expect(row(pending(page), "Papel higiénico Suave")).toBeVisible();
      await expect.poll(() => patches.length).toBe(1);
      expect(patches[0]).toEqual({ name: "Papel higiénico Suave" });
      await expect
        .poll(() => catalogNames(list.id))
        .toMatchObject({ "papel higienico suave": "Papel higiénico Suave" });

      await captureViewport(page, testInfo, `m6-list-${scheme}`);
    });

    test("a product the catalog remembers in lowercase comes back with a capital", async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      const list = await openAndCreateList(page);
      await seedCatalog(list.id, [
        { name: "yerba mate", times: 4 },
        { name: "pan", times: 3 },
      ]);
      await reloadWithCatalog(page);
      const posts = recordWrites(page, "POST");
      const chip = page
        .getByRole("group", { name: texts.addItem.frequents })
        .getByRole("button", {
          name: texts.addItem.addProduct("yerba mate"),
          exact: true,
        });
      // What the catalog has is shown as it has it; what is saved changes.
      await expect(chip).toBeVisible();
      await captureViewport(page, testInfo, `m6-frequents-${scheme}`);

      await chip.tap();

      await expect(row(pending(page), "Yerba mate")).toBeVisible();
      // The row is on screen before its request leaves.
      await expect
        .poll(() => posts.map((body) => body.name))
        .toEqual(["Yerba mate"]);
      // The catalog follows the name written last.
      await expect
        .poll(() => catalogNames(list.id))
        .toEqual({ "yerba mate": "Yerba mate", pan: "pan" });
    });
  });
}
