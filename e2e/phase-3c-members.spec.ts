import { expect, test, type Page } from "@playwright/test";
import { texts } from "../src/lib/texts";
import { addMember, deleteList, seedCatalog } from "./supabase-admin";
import {
  PULSE_END_MS,
  captureViewport,
  field,
  newPlayer,
  openAndCreateList,
  pending,
  reloadJoined,
  reportSteps,
  row,
  stepper,
  type Step,
} from "./two-members";

/**
 * Phase 3, part (c), two members: "Lo de siempre" is one write of several
 * rows, and what the other member sees of it meets the criteria of
 * phase-2b (the stepper's): under a second from the tap, the pulse only on
 * the other's rows, one sentence for the other's screen reader ("Agregaron
 * N productos") and none for the one who tapped, and the tapper's own rows
 * exactly the N that came in, with nothing flickering. Then Deshacer, the
 * same, the other way round ("Sacaron N productos de la lista").
 */

const t = texts;

const HISTORY = [
  { name: "Leche", times: 5, category: "Fiambres y lácteos", price: 45 },
  { name: "Tomates", times: 4, category: "Frutas y verduras", price: 90 },
  { name: "Arroz", times: 6, category: "Almacén", price: 62 },
  { name: "Pan", times: 3, category: "Panadería" },
  { name: "Yerba", times: 2, category: "Almacén", price: 210 },
];
const USUALS = ["Arroz", "Leche", "Tomates", "Pan"];

function usualsButton(page: Page, count: number) {
  return page
    .getByRole("group", { name: t.addItem.frequents })
    .getByRole("button", { name: t.addItem.usuals.aria(count), exact: true });
}

function undoButton(page: Page) {
  return page.getByRole("button", { name: t.addItem.usuals.undo, exact: true });
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`phase 3c, lo de siempre, two members (${colorScheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );

    test("the other member sees the usuals arrive and go in under a second", async ({
      browser,
    }, testInfo) => {
      test.setTimeout(120_000);
      const alice = await newPlayer(browser, testInfo, colorScheme);
      const bob = await newPlayer(browser, testInfo, colorScheme);
      const a = alice.page;
      const b = bob.page;
      const steps: Step[] = [];

      try {
        // Setup as phase-2b: B joins A's list; A's list has a history.
        const listA = await openAndCreateList(a);
        const listB = await openAndCreateList(b);
        await seedCatalog(listA.id, HISTORY);
        await addMember(listA.id, listB.created_by);
        await deleteList(listB.id);
        const [readA, readB] = await Promise.all([
          reloadJoined(a),
          reloadJoined(b),
        ]);
        expect(readA).toBe(listA.id);
        expect(readB).toBe(listA.id);
        await expect(usualsButton(a, 4)).toBeVisible();
        // B has no history on their screen: the catalog is the list's, and
        // B's bar shows the same row.
        await expect(usualsButton(b, 4)).toBeVisible();
        await a.waitForTimeout(500);

        const step = stepper(steps);
        const added = ["Tomates", "Leche", "Pan", "Arroz"];

        // 1. A taps "Lo de siempre": the four arrive on B in one burst.
        const tap = usualsButton(a, 4);
        await tap.hover();
        await step(
          "1 A taps Lo de siempre",
          a,
          b,
          USUALS,
          // One optimistic render: the rows mount once, by group.
          added.map((name) => `mount ${name} pending`),
          t.remoteChanges.many.added(4),
          () => tap.tap(),
          async () => {
            for (const name of USUALS) {
              await row(pending(b), name).waitFor({ timeout: 1000 });
            }
          },
          async () => {
            await captureViewport(b, testInfo, `b-after-usuals-${colorScheme}`);
          },
        );
        await expect(undoButton(a)).toBeVisible();

        // 2. A taps Deshacer (inside its 8 s): B shows them gone in under a
        // second, is told, and nothing pulses on B (a removal does not).
        const undo = undoButton(a);
        await undo.hover();
        await step(
          "2 A taps Deshacer",
          a,
          b,
          [],
          added.map((name) => `unmount ${name} pending`),
          t.remoteChanges.many.removed(4),
          () => undo.tap(),
          async () => {
            for (const name of USUALS) {
              await expect(row(pending(b), name)).toHaveCount(0, {
                timeout: 1000,
              });
            }
          },
        );
        await a.waitForTimeout(PULSE_END_MS);
        await expect(field(a)).toBeFocused();
      } finally {
        reportSteps(steps, testInfo, "phase-3c-members");
        await Promise.all([alice.context.close(), bob.context.close()]);
      }
    });
  });
}
