import { expect, test, type Page } from "@playwright/test";
import { texts } from "../src/lib/texts";
import {
  addMember,
  adminClient,
  categoryIds,
  deleteList,
  setCategory,
} from "./supabase-admin";
import {
  CHANGE_MS,
  PULSE_END_MS,
  captureViewport,
  clearLogs,
  editor,
  field,
  newPlayer,
  openAndCreateList,
  pending,
  reloadJoined,
  removeButton,
  reportSteps,
  row,
  rowName,
  stepper,
  type Step,
} from "./two-members";

/**
 * Phase 3, part (a), two members: what one does to the route and to the
 * category of an item reaches the other in under a second, as phase-2b does
 * for the rows (the criteria are the stepper's: the pulse only where it
 * should, the actor's own rows untouched, one sentence for the other's screen
 * reader and none for the actor's). Then the catalog following a remote
 * change, and two moves at the same moment.
 */

const t = texts;

function routeButton(page: Page) {
  return pending(page).getByRole("button", { name: t.route.open, exact: true });
}

function routeSheet(page: Page) {
  return page.getByRole("dialog", { name: t.route.title });
}

function arrow(page: Page, direction: "up" | "down", name: string) {
  return routeSheet(page).getByRole("button", {
    name: direction === "up" ? t.route.up(name) : t.route.down(name),
    exact: true,
  });
}

/** The route as the open sheet shows it, top to bottom. */
function routeOrder(page: Page) {
  return routeSheet(page)
    .locator('[data-slot="route-row"]')
    .evaluateAll((rows) =>
      rows.map((row) => row.querySelector(".text-row")?.textContent),
    );
}

/** The names of the category groups of Pendientes, top to bottom. */
function groupTitles(page: Page) {
  return pending(page)
    .locator("h3")
    .evaluateAll((titles) =>
      titles.map((title) => title.querySelector("span.truncate")?.textContent),
    );
}

function group(page: Page, name: string) {
  return pending(page)
    .locator("section")
    .filter({
      has: page.locator("h3 span.truncate", {
        hasText: new RegExp(`^${name}$`),
      }),
    });
}

async function openRoute(page: Page) {
  await routeButton(page).click();
  await expect(routeSheet(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function closeSheet(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/**
 * Records, frame by frame, the vertical transforms each group of Pendientes
 * goes through. A slide is an interpolation: two or more different
 * translations of the same group. A jump with reduced motion may show one
 * frame at the old place (Motion's instant layout animation) and is not one.
 */
async function recordSlides(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __slid: Map<string, Set<string>>;
      __stop: boolean;
    };
    w.__slid = new Map();
    w.__stop = false;
    const tick = () => {
      for (const title of document.querySelectorAll("#pending h3")) {
        const wrapper = title.closest("section")?.parentElement;
        const transform = wrapper ? getComputedStyle(wrapper).transform : "";
        if (/matrix\(1, 0, 0, 1, [^,]+, (?!0\))/.test(transform)) {
          const name = title.querySelector("span.truncate")?.textContent ?? "";
          const seen = w.__slid.get(name) ?? new Set<string>();
          w.__slid.set(name, seen.add(transform));
        }
      }
      if (!w.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** The groups that slid (two or more different translations). */
async function stopSlides(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      __slid: Map<string, Set<string>>;
      __stop: boolean;
    };
    w.__stop = true;
    return [...w.__slid]
      .filter(([, transforms]) => transforms.size >= 2)
      .map(([name]) => name);
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`phase 3a, route and category, two members (${colorScheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );

    test("a reorder and a category change reach the other member in under a second", async ({
      browser,
    }, testInfo) => {
      test.setTimeout(120_000);
      const alice = await newPlayer(browser, testInfo, colorScheme);
      const bob = await newPlayer(browser, testInfo, colorScheme);
      const a = alice.page;
      const b = bob.page;
      const steps: Step[] = [];

      try {
        // Setup as phase-2b: each gets a list; B becomes a member of A's and
        // loses their own. A's list first gets four items, in four categories
        // (the service role puts them there), Almacén and Bebidas being
        // neighbours in the default route.
        const listA = await openAndCreateList(a);
        const listB = await openAndCreateList(b);
        const ids = await categoryIds(listA.id);
        for (const [name, category] of [
          ["Tomates", "Frutas y verduras"],
          ["Leche", "Fiambres y lácteos"],
          ["Yerba", "Almacén"],
          ["Agua", "Bebidas"],
        ]) {
          await field(a).fill(name);
          await field(a).press("Enter");
          await expect(row(pending(a), name)).toBeVisible();
          const itemId = await row(pending(a), name).getAttribute(
            "data-item-id",
          );
          await setCategory(itemId ?? "", ids.get(category) ?? "");
        }
        await addMember(listA.id, listB.created_by);
        await deleteList(listB.id);
        const [readA, readB] = await Promise.all([
          reloadJoined(a),
          reloadJoined(b),
        ]);
        expect(readA).toBe(listA.id);
        expect(readB).toBe(listA.id);
        const initial = [
          "Frutas y verduras",
          "Fiambres y lácteos",
          "Almacén",
          "Bebidas",
        ];
        for (const page of [a, b]) {
          await expect.poll(() => groupTitles(page)).toEqual(initial);
        }

        // The service role's category changes were committed just before the
        // channels joined, and Realtime still delivers them to both ("Cambiaron
        // 4 productos", with the pulses): let that burst end, so the steps
        // below start from a quiet page.
        await Promise.all(
          [a, b].map((page) =>
            page
              .waitForFunction(
                () => (window.__said ?? []).length > 0,
                undefined,
                {
                  timeout: 4000,
                },
              )
              .catch(() => {}),
          ),
        );
        await a.waitForTimeout(PULSE_END_MS);

        const step = stepper(steps);

        // 1. A moves Bebidas up past Almacén, in the route sheet: B's groups
        // follow and slide, nothing pulses (no row changed), B is told the
        // route changed, and A's own rows are not touched at all.
        await openRoute(a);
        const bebidasUp = arrow(a, "up", "Bebidas");
        await bebidasUp.hover();
        await recordSlides(b);
        await step(
          "1 A moves Bebidas up",
          a,
          b,
          [],
          [],
          t.remoteChanges.reordered,
          () => bebidasUp.click(),
          async () => {
            await b.waitForFunction(
              () => {
                const titles = [
                  ...document.querySelectorAll("#pending h3 span.truncate"),
                ].map((title) => title.textContent);
                return (
                  titles.indexOf("Bebidas") !== -1 &&
                  titles.indexOf("Bebidas") < titles.indexOf("Almacén")
                );
              },
              undefined,
              { polling: "raf", timeout: CHANGE_MS },
            );
          },
        );
        expect(await groupTitles(b)).toEqual([
          "Frutas y verduras",
          "Fiambres y lácteos",
          "Bebidas",
          "Almacén",
        ]);
        expect(await groupTitles(a)).toEqual(await groupTitles(b));
        // The two groups that swapped slid on B (a transform, no flicker).
        const slid = await stopSlides(b);
        expect(slid).toEqual(expect.arrayContaining(["Bebidas", "Almacén"]));
        await captureViewport(b, testInfo, `b-after-reorder-${colorScheme}`);
        await closeSheet(a);

        // 2. B moves Yerba to Limpieza in the edit sheet: A shows it in the
        // new group with a pulse on that row only, and is told it changed.
        // The catalog of A is read again because of it (step 3 needs that).
        const catalogOfA = a.waitForResponse(
          (response) =>
            response.url().includes("/rest/v1/catalog") &&
            response.request().method() === "GET",
        );
        await rowName(pending(b), "Yerba").click();
        await expect(editor(b)).toBeVisible();
        await editor(b)
          .getByRole("group", { name: t.editItem.category })
          .getByRole("button", { name: "Limpieza", exact: true })
          .click();
        const save = editor(b).getByRole("button", {
          name: t.editItem.save,
          exact: true,
        });
        await save.hover();
        await step(
          "2 B moves Yerba to Limpieza",
          b,
          a,
          ["Yerba"],
          // The row leaves its group and the one in the new group mounts
          // (the group of Almacén goes with it): a move between groups is
          // one unmount and one mount, and the row never comes back.
          ["unmount Yerba pending", "mount Yerba pending"],
          t.remoteChanges.one.edited("Yerba"),
          () => save.click(),
          () =>
            group(a, "Limpieza")
              .getByRole("checkbox", { name: "Yerba", exact: true })
              .waitFor({ timeout: CHANGE_MS }),
        );
        await expect(editor(b)).toBeHidden();
        await expect(group(a, "Almacén")).toHaveCount(0);
        expect(await groupTitles(a)).toEqual(await groupTitles(b));

        // 3. Not measured: A deletes Yerba and types it again. A's catalog
        // followed B's change through Realtime, so it lands in Limpieza, with
        // no reload.
        await catalogOfA;
        await rowName(pending(a), "Yerba").click();
        await expect(editor(a)).toBeVisible();
        const remove = removeButton(a);
        await remove.click();
        await expect(remove).toHaveAttribute("data-armed", "true");
        await remove.click();
        await expect(row(pending(a), "Yerba")).toHaveCount(0);
        await field(a).fill("Yerba");
        await field(a).press("Enter");
        await expect(
          group(a, "Limpieza").getByRole("checkbox", {
            name: "Yerba",
            exact: true,
          }),
        ).toBeVisible();
        await expect(group(a, "Almacén")).toHaveCount(0);

        // 4. Both move a category at the same moment, on different ones: A
        // moves Higiene up (past Limpieza), B moves Frutas y verduras down
        // (past Carnes y pescados). Within 2 s both screens show the same
        // route with both moves, and the server holds positions 0..9 once
        // each.
        await Promise.all([openRoute(a), openRoute(b)]);
        const expected = [
          "Carnes y pescados",
          "Frutas y verduras",
          "Fiambres y lácteos",
          "Panadería",
          "Bebidas",
          "Almacén",
          "Congelados",
          "Higiene",
          "Limpieza",
          "Otros",
        ];
        const higieneUp = arrow(a, "up", "Higiene");
        const verdurasDown = arrow(b, "down", "Frutas y verduras");
        await Promise.all([higieneUp.hover(), verdurasDown.hover()]);
        await Promise.all([clearLogs(a), clearLogs(b)]);
        const start = Date.now();
        await Promise.all([higieneUp.click(), verdurasDown.click()]);
        const settled = async (page: Page) => {
          await expect
            .poll(() => routeOrder(page), { timeout: 2000, intervals: [25] })
            .toEqual(expected);
          return Date.now();
        };
        const [endA, endB] = await Promise.all([settled(a), settled(b)]);
        const [gestureA, gestureB] = await Promise.all(
          [a, b].map((page) => page.evaluate(() => window.__gestureAt ?? 0)),
        );
        steps.push(
          {
            label: "4 own gesture → both moves, A",
            ms: endA - start,
            fromGesture: endA - gestureA,
          },
          {
            label: "4 own gesture → both moves, B",
            ms: endB - start,
            fromGesture: endB - gestureB,
          },
        );
        expect(Math.max(endA - gestureA, endB - gestureB)).toBeLessThan(2000);
        // Let the answers and the reads that follow settle, then check the
        // same on both and on the server.
        await a.waitForTimeout(1500);
        expect(await routeOrder(a)).toEqual(expected);
        expect(await routeOrder(b)).toEqual(expected);
        const { data, error } = await adminClient()
          .from("categories")
          .select("name, position")
          .eq("list_id", listA.id)
          .is("deleted_at", null)
          .order("position", { ascending: true });
        expect(error).toBeNull();
        expect(data?.map((category) => category.position)).toEqual([
          0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
        ]);
        expect(data?.map((category) => category.name)).toEqual(expected);
        await closeSheet(a);
        await closeSheet(b);
        expect(await groupTitles(a)).toEqual(await groupTitles(b));
        await captureViewport(a, testInfo, `a-after-both-${colorScheme}`);
      } finally {
        reportSteps(steps, testInfo, "phase-3a-members");
        await Promise.all([alice.context.close(), bob.context.close()]);
      }
    });
  });
}
