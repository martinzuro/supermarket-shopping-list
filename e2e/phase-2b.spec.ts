import { expect, test } from "@playwright/test";
import { texts } from "../src/lib/texts";
import { addMember, deleteList } from "./supabase-admin";
import {
  CHANGE_MS,
  PULSE_END_MS,
  cart,
  checkbox,
  clearLogs,
  editor,
  editorField,
  emptyAction,
  field,
  namesIn,
  newPlayer,
  openAndCreateList,
  pending,
  pulsedNames,
  reloadJoined,
  reportSteps,
  row,
  rowEventsFor,
  rowName,
  removeButton,
  saidOf,
  stepper,
  waitForPulse,
  waitForSaid,
  type Step,
} from "./two-members";

/**
 * Phase 2b, end to end against the local Supabase stack: two people in two
 * browser contexts share one list, and what one does reaches the other in
 * under a second, with the pulse of DESIGN_DIRECTION.md section 8 on the rows
 * the other member added, edited or checked, and never on the rows of the one
 * who made the change.
 *
 * The helpers live in two-members.ts (they were this file's); the membership
 * is put by the service role here, and phase-2c.spec.ts does it through the
 * invitation.
 */

for (const colorScheme of ["light", "dark"] as const) {
  // This needs the local stack: `npm run db:start` locally; the CI E2E job starts it.
  test.describe(`phase 2b, two members (${colorScheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );

    test("what one member does reaches the other in under a second", async ({
      browser,
    }, testInfo) => {
      test.setTimeout(90_000);
      const alice = await newPlayer(browser, testInfo, colorScheme);
      const bob = await newPlayer(browser, testInfo, colorScheme);
      const a = alice.page;
      const b = bob.page;
      const steps: Step[] = [];

      try {
        // Setup, with no sharing in the app yet (that is phase 2c): each opens
        // the app and gets a list of their own; the service role then makes
        // B a member of A's list and deletes B's own, and B reads again.
        const listA = await openAndCreateList(a);
        const listB = await openAndCreateList(b);
        expect(listA.created_by).not.toBe(listB.created_by);
        await addMember(listA.id, listB.created_by);
        await deleteList(listB.id);
        const [readA, readB] = await Promise.all([
          reloadJoined(a),
          reloadJoined(b),
        ]);
        expect(readA).toBe(listA.id);
        expect(readB).toBe(listA.id);
        await expect(
          pending(b).getByText(texts.list.pending.empty),
        ).toBeVisible();

        const step = stepper(steps);

        await field(a).fill("Leche");
        await field(b).fill("Pan");

        // 1. A adds "Leche": B shows it with a pulse. A screenshot of B is
        // taken while the pulse is on.
        await step(
          "1 A adds Leche",
          a,
          b,
          ["Leche"],
          ["mount Leche pending"],
          texts.remoteChanges.one.added("Leche"),
          () => field(a).press("Enter"),
          () => row(pending(b), "Leche").waitFor({ timeout: CHANGE_MS }),
          async () => {
            const path = testInfo.outputPath(`pulse-${colorScheme}.png`);
            const background = await b
              .locator("[data-highlighted]")
              .first()
              .evaluate((element) => getComputedStyle(element).backgroundColor);
            await b.screenshot({ path });
            await testInfo.attach(`pulse-${colorScheme}`, {
              path,
              contentType: "image/png",
            });
            testInfo.annotations.push({
              type: "pulse background",
              description: background,
            });
          },
        );

        // 2. B checks it: it travels to "En el carro" on A, with a pulse.
        await step(
          "2 B checks Leche",
          b,
          a,
          ["Leche"],
          // It is marked where it stands (strike and check play for 320 ms),
          // then travels: the row in #pending leaves and the one in #cart
          // enters in the same commit (shared layoutId), and no row comes
          // back.
          [
            "checked Leche false>true",
            "unmount Leche pending",
            "mount Leche cart",
          ],
          texts.remoteChanges.one.checked("Leche"),
          () => checkbox(b, "Leche").click(),
          () => row(cart(a), "Leche").waitFor({ timeout: CHANGE_MS }),
        );
        await expect(row(pending(a), "Leche")).toHaveCount(0);

        // 3. A edits it (a note, in the sheet): B shows the note, with a pulse.
        await rowName(cart(a), "Leche").click();
        await expect(editor(a)).toBeVisible();
        await editorField(a, texts.editItem.note).fill("Entera");
        // The sheet is still sliding in: Playwright's click would wait for it
        // to settle inside the measured time. Hovering waits for it first.
        const save = editor(a).getByRole("button", {
          name: texts.editItem.save,
          exact: true,
        });
        await save.hover();
        await step(
          "3 A edits Leche",
          a,
          b,
          ["Leche"],
          // The row stays and the note shows once: it never goes away again
          // (the server's answer and the echo change nothing).
          ["note Leche Entera"],
          texts.remoteChanges.one.edited("Leche"),
          () => save.click(),
          () =>
            row(cart(b), "Leche")
              .filter({ hasText: "Entera" })
              .waitFor({ timeout: CHANGE_MS }),
        );
        await expect(editor(a)).toBeHidden();

        // 4. B adds "Pan": A shows it with a pulse.
        await step(
          "4 B adds Pan",
          b,
          a,
          ["Pan"],
          ["mount Pan pending"],
          texts.remoteChanges.one.added("Pan"),
          () => field(b).press("Enter"),
          () => row(pending(a), "Pan").waitFor({ timeout: CHANGE_MS }),
        );

        // 5. A deletes "Pan" (two taps): it leaves B's list, and nothing pulses.
        await rowName(pending(a), "Pan").click();
        await expect(editor(a)).toBeVisible();
        const remove = removeButton(a);
        await remove.click();
        await expect(remove).toHaveText(texts.editItem.confirmRemove);
        await expect(remove).toHaveAttribute("data-armed", "true");
        await step(
          "5 A deletes Pan",
          a,
          b,
          [],
          ["unmount Pan pending"],
          texts.remoteChanges.one.removed("Pan"),
          () => remove.click(),
          () =>
            row(pending(b), "Pan").waitFor({
              state: "detached",
              timeout: CHANGE_MS,
            }),
        );
        await expect(editor(a)).toBeHidden();

        // 6. Writes queued while the other member writes. A adds "Huevos" and
        // checks it at once, so its add and its check are both queued in A's
        // list; B adds "Yerba" at the same time. Nothing is lost or reordered:
        // both end with Huevos in the cart and Yerba pending, A's own row goes
        // through exactly add, check and move, B's has one mount, and each
        // pulses only on the other side.
        // A's writes are slowed (the add 150 ms, the check 300 ms), so they
        // are still queued when B's insert arrives over Realtime (about 100 ms
        // after it commits): that interleaving is what this step is about.
        // Without the delay A's settle read could bring Yerba in before its
        // event; the row then still pulses when the event comes, but the step
        // would no longer cover writes queued during a remote change.
        const slow = { POST: 150, PATCH: 300 } as Record<string, number>;
        const itemsApi = /\/rest\/v1\/items\?/;
        await a.route(itemsApi, async (route) => {
          const delay = slow[route.request().method()];
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          await route.continue();
        });
        await field(a).fill("Huevos");
        await field(b).fill("Yerba");
        await Promise.all([clearLogs(a), clearLogs(b)]);
        const queuedStart = Date.now();
        const reachedB = (async () => {
          await row(cart(b), "Huevos").waitFor({ timeout: CHANGE_MS * 2 });
          await waitForPulse(b, "Huevos");
          return Date.now();
        })();
        const reachedA = (async () => {
          await row(pending(a), "Yerba").waitFor({ timeout: CHANGE_MS * 2 });
          await waitForPulse(a, "Yerba");
          return Date.now();
        })();
        await Promise.all([
          (async () => {
            await field(a).press("Enter");
            // At once, as a quick second tap: no wait for the row to settle.
            await checkbox(a, "Huevos").dispatchEvent("click");
          })(),
          field(b).press("Enter"),
        ]);
        const [endB, endA] = await Promise.all([reachedB, reachedA]);
        const [gestureA, gestureB] = await Promise.all(
          [a, b].map((page) => page.evaluate(() => window.__gestureAt ?? 0)),
        );
        // A's writes were slowed on purpose by `slow` (150 ms for the add, 300
        // ms for the check, one after the other): that time is the test's, so
        // it is taken off A's budget. Both figures are logged.
        const slowedMs = slow.POST + slow.PATCH;
        const queued = [
          {
            label: "6 A adds+checks Huevos",
            ms: endB - queuedStart,
            from: endB - gestureA,
            budget: endB - gestureA - slowedMs,
          },
          {
            label: "6 B adds Yerba",
            ms: endA - queuedStart,
            from: endA - gestureB,
            budget: endA - gestureB,
          },
        ];
        for (const { label, ms, from, budget } of queued) {
          steps.push({ label, ms, fromGesture: from });
          expect(
            budget,
            `${label} took ${from} ms from the gesture (${budget} ms without the slowdown)`,
          ).toBeLessThan(CHANGE_MS);
        }
        await a.waitForTimeout(PULSE_END_MS);
        await Promise.all([
          waitForSaid(a, "queued A"),
          waitForSaid(b, "queued B"),
        ]);
        await a.unroute(itemsApi);
        // Each hears the other's change, one sentence, and nothing of its
        // own. B's Huevos was added and checked within one burst: it is told
        // as an add.
        expect(await saidOf(a), "queued: A hears").toEqual([
          texts.remoteChanges.one.added("Yerba"),
        ]);
        expect(await saidOf(b), "queued: B hears").toEqual([
          texts.remoteChanges.one.added("Huevos"),
        ]);
        expect(await pulsedNames(a), "queued: A pulsed").toEqual(["Yerba"]);
        expect(await pulsedNames(b), "queued: B pulsed").toEqual(["Huevos"]);
        // A's row: the add, the check where it stands, then the move.
        expect(await rowEventsFor(a, "Huevos"), "queued: A's Huevos").toEqual([
          "mount Huevos pending",
          "checked Huevos false>true",
          "unmount Huevos pending",
          "mount Huevos cart",
        ]);
        expect(await rowEventsFor(b, "Yerba"), "queued: B's Yerba").toEqual([
          "mount Yerba pending",
        ]);
        // Each side shows the other's row once.
        expect(await rowEventsFor(a, "Yerba"), "queued: A's Yerba").toEqual([
          "mount Yerba pending",
        ]);
        for (const page of [a, b]) {
          await expect(row(cart(page), "Huevos")).toHaveCount(1);
          await expect(row(pending(page), "Yerba")).toHaveCount(1);
          await expect(row(pending(page), "Huevos")).toHaveCount(0);
          await expect(row(cart(page), "Yerba")).toHaveCount(0);
        }
        // Same order in both, and the server's order after a fresh read.
        const cartA = await namesIn(cart(a));
        expect(cartA).toEqual(["Leche", "Huevos"]);
        expect(await namesIn(cart(b))).toEqual(cartA);
        expect(await namesIn(pending(b))).toEqual(await namesIn(pending(a)));
        expect(await reloadJoined(b)).toBe(listA.id);
        await expect(row(cart(b), "Huevos")).toBeVisible();
        expect(await namesIn(cart(b))).toEqual(cartA);
        expect(await namesIn(pending(b))).toEqual(await namesIn(pending(a)));

        // 7. A empties the cart: both rows in it go, B's cart is empty and
        // nothing pulses. Yerba stays pending in both.
        await step(
          "7 A empties the cart",
          a,
          b,
          [],
          ["unmount Leche cart", "unmount Huevos cart"],
          texts.remoteChanges.many.removed(2),
          () => emptyAction(a).click(),
          () =>
            cart(b)
              .getByText(texts.list.cart.empty)
              .waitFor({ timeout: CHANGE_MS }),
        );

        await expect(checkbox(b, "Leche")).toHaveCount(0);
        await expect(checkbox(b, "Huevos")).toHaveCount(0);

        // At the end both show the same list: only Yerba is left, pending.
        for (const page of [a, b]) {
          await expect(cart(page).locator("li")).toHaveCount(0);
          expect(await namesIn(pending(page))).toEqual(["Yerba"]);
        }
        // And the server agrees: a read from scratch finds the same.
        expect(await reloadJoined(b)).toBe(listA.id);
        await expect(cart(b).getByText(texts.list.cart.empty)).toBeVisible();
        expect(await namesIn(pending(b))).toEqual(["Yerba"]);
      } finally {
        reportSteps(steps, testInfo, `phase-2b timing ${colorScheme}`);
        await alice.context.close();
        await bob.context.close();
      }
    });
  });
}
