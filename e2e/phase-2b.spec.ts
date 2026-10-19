import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { texts } from "../src/lib/texts";
import { addMember, deleteList } from "./supabase-admin";

/**
 * Phase 2b, end to end against the local Supabase stack: two people in two
 * browser contexts share one list, and what one does reaches the other in
 * under a second, with the pulse of DESIGN_DIRECTION.md section 8 on the rows
 * the other member added, edited or checked, and never on the rows of the one
 * who made the change.
 *
 * The helpers repeat those of phase-2a.spec.ts (the reference).
 */

const CHANGE_MS = 1000;
/** The pulse stays lit 400 ms and fades over 600 ms; this lets it all end. */
const PULSE_END_MS = 1300;

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

function emptyAction(page: Page) {
  return cart(page).getByRole("button", {
    name: texts.list.cart.emptyAction,
    exact: true,
  });
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
  await page.waitForFunction(() => {
    const input = document.querySelector("form input");
    return (
      input !== null &&
      Object.keys(input).some((key) => key.startsWith("__reactProps$"))
    );
  });
}

type CreatedList = { id: string; created_by: string };

/** First use: the app creates the list; its id and owner come from the POST. */
async function openAndCreateList(page: Page): Promise<CreatedList> {
  const created = page.waitForResponse(
    (response) =>
      response.url().includes("/rest/v1/lists") &&
      response.request().method() === "POST",
  );
  const catalog = catalogLoaded(page);
  await page.goto("/");
  await expect(field(page)).toBeVisible();
  await expect(pending(page).getByText(texts.list.pending.empty)).toBeVisible();
  await waitHydrated(page);
  await catalog;
  const body = (await (await created).json()) as CreatedList | CreatedList[];
  return Array.isArray(body) ? body[0] : body;
}

/**
 * Resolves with the `list_id` the page reads its items with, once the page
 * has read them a second time. After the first load the list is read again
 * about 100 ms after the channel joined (SUBSCRIBED), so the second read means
 * the channel is listening. Call it before the navigation.
 */
function channelJoined(page: Page): Promise<string> {
  let reads = 0;
  return new Promise((resolve) => {
    const onResponse = (response: {
      url(): string;
      request(): { method(): string };
    }) => {
      if (
        response.request().method() !== "GET" ||
        !/\/rest\/v1\/items\?/.test(response.url())
      ) {
        return;
      }
      if (++reads < 2) return;
      page.off("response", onResponse);
      const listId = /list_id=eq\.([0-9a-f-]+)/.exec(response.url())?.[1];
      resolve(listId ?? "");
    };
    page.on("response", onResponse);
  });
}

async function reloadJoined(page: Page): Promise<string> {
  const joined = channelJoined(page);
  await page.reload();
  await expect(field(page)).toBeVisible();
  await waitHydrated(page);
  return joined;
}

type Pulse = { name: string; t: number };

declare global {
  interface Window {
    __pulses?: Pulse[];
    __rows?: string[];
    __gestureAt?: number;
  }
}

/**
 * Two logs per page, both by the name on the row's checkbox.
 *
 * `__pulses`: every row that gets `data-highlighted` (the pulse); a row
 * mounted already lit (it was added or moved by the change) counts the same
 * as one that lights up where it is.
 *
 * `__rows`: what happens to the rows themselves, as strings, in order:
 * `mount <name> <pending|cart>` and `unmount <name> <pending|cart>` for each
 * `[data-item-id]` element that enters or leaves the DOM (with its group, if
 * the group goes too), `checked <name> <old>><new>` when its `data-checked`
 * changes where it stands, and `note <name> <text>` when the note under its
 * name changes. A row that flickers (gone and back, back to its old place or
 * state, a note that shows and disappears) leaves more here than the change
 * it should have made.
 */
async function recordPulses(context: BrowserContext) {
  await context.addInitScript(() => {
    const log: Pulse[] = [];
    const rows: string[] = [];
    window.__pulses = log;
    window.__rows = rows;
    // When the page itself saw the last tap or key: Playwright's click waits
    // for the target to be stable first, and that wait is not the app's.
    for (const type of ["click", "keydown"]) {
      document.addEventListener(
        type,
        () => {
          window.__gestureAt = Date.now();
        },
        true,
      );
    }
    const lit = (node: Node) => {
      if (!(node instanceof Element)) return;
      const rows = node.matches("[data-highlighted]")
        ? [node]
        : Array.from(node.querySelectorAll("[data-highlighted]"));
      for (const element of rows) {
        const name = element
          .closest("[data-item-id]")
          ?.querySelector('[role="checkbox"]')
          ?.getAttribute("aria-label");
        log.push({ name: name ?? "?", t: Date.now() });
      }
    };
    const nameOf = (row: Element) =>
      row.querySelector('[role="checkbox"]')?.getAttribute("aria-label") ?? "?";
    const noteOf = (row: Element) =>
      row
        .querySelector('[data-slot="list-row-name"] .eyebrow')
        ?.textContent?.trim() ?? "";
    const rowsIn = (node: Node) => {
      if (!(node instanceof Element)) return [];
      return [
        ...(node.matches("[data-item-id]") ? [node] : []),
        ...Array.from(node.querySelectorAll("[data-item-id]")),
      ];
    };
    // The last note seen on each row, by item id: only changes are logged.
    const notes = new Map<string, string>();
    // The section a row is in. A row removed with its whole section (the
    // cart gives way to the moment when emptied) still finds it in the
    // detached subtree; a row removed on its own, in the parent it left.
    const place = (row: Element, parent: Node) =>
      (
        row.closest("#pending, #cart") ??
        (parent instanceof Element ? parent : parent.parentElement)?.closest(
          "#pending, #cart",
        )
      )?.id ?? "?";
    new MutationObserver((mutations) => {
      const touched = new Set<Element>();
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const target = mutation.target as Element;
          if (mutation.attributeName === "data-highlighted") lit(target);
          else if (target.matches('[data-slot="list-row"]')) {
            // (The check circle inside has its own data-checked.)
            const row = target.closest("[data-item-id]");
            if (row) {
              rows.push(
                `checked ${nameOf(row)} ${mutation.oldValue}>${target.getAttribute("data-checked")}`,
              );
            }
          }
        } else if (mutation.type === "childList") {
          mutation.addedNodes.forEach(lit);
          for (const node of mutation.addedNodes) {
            for (const row of rowsIn(node)) {
              rows.push(`mount ${nameOf(row)} ${place(row, mutation.target)}`);
              notes.set(row.getAttribute("data-item-id")!, noteOf(row));
            }
          }
          for (const node of mutation.removedNodes) {
            for (const row of rowsIn(node)) {
              rows.push(
                `unmount ${nameOf(row)} ${place(row, mutation.target)}`,
              );
              notes.delete(row.getAttribute("data-item-id")!);
            }
          }
          const inRow = (mutation.target as Element).closest?.(
            "[data-item-id]",
          );
          if (inRow) touched.add(inRow);
        } else {
          const row = mutation.target.parentElement?.closest("[data-item-id]");
          if (row) touched.add(row);
        }
      }
      for (const row of touched) {
        const id = row.getAttribute("data-item-id")!;
        if (!row.isConnected || !notes.has(id)) continue;
        const note = noteOf(row);
        if (notes.get(id) === note) continue;
        notes.set(id, note);
        rows.push(`note ${nameOf(row)} ${note}`);
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["data-highlighted", "data-checked"],
    });
  });
}

function pulsesOf(page: Page) {
  return page.evaluate(() => window.__pulses ?? []);
}

async function clearLogs(page: Page) {
  await page.evaluate(() => {
    window.__pulses?.splice(0);
    window.__rows?.splice(0);
  });
}

function rowEventsOf(page: Page) {
  return page.evaluate(() => window.__rows ?? []);
}

/** Names that pulsed since the last clear, once each, in order. */
async function pulsedNames(page: Page) {
  return [...new Set((await pulsesOf(page)).map((pulse) => pulse.name))];
}

async function newPlayer(
  browser: Browser,
  testInfo: TestInfo,
  colorScheme: "light" | "dark",
) {
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    viewport: { width: 375, height: 812 },
    colorScheme,
    storageState: testInfo.project.use.storageState,
  });
  await recordPulses(context);
  return { context, page: await context.newPage() };
}

type Step = { label: string; ms: number; fromGesture: number };

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

        /**
         * One step: `gesture` is the action in `actor`; `outcome` is what the
         * `other` must show, and it returns when it does. The time runs from
         * just before the gesture to there, the pulses in `pulses` included.
         * The pulse logs are cleared first and read once the pulse is over:
         * whatever is in them belongs to this step. The actor's own rows never
         * pulse; the other's pulse only on the rows in `pulses`. Nor do they
         * flicker: the actor's row log is exactly `ownRows`, the one change
         * the step makes to its own rows and nothing else. `whileLit` runs
         * once the time is taken, with the pulse still on.
         */
        async function step(
          label: string,
          actor: Page,
          other: Page,
          pulses: string[],
          ownRows: string[],
          gesture: () => Promise<void>,
          outcome: () => Promise<void>,
          whileLit?: () => Promise<void>,
        ) {
          await Promise.all([clearLogs(actor), clearLogs(other)]);
          const start = Date.now();
          await gesture();
          await outcome();
          for (const name of pulses) {
            // Polled on every frame: expect.poll would round up to its steps.
            await other.waitForFunction(
              (pulsed) =>
                (window.__pulses ?? []).some((pulse) => pulse.name === pulsed),
              name,
              { polling: "raf", timeout: CHANGE_MS },
            );
          }
          const end = Date.now();
          const ms = end - start;
          const gestureAt = await actor.evaluate(() => window.__gestureAt ?? 0);
          steps.push({ label, ms, fromGesture: end - gestureAt });
          expect(ms, `${label} took ${ms} ms`).toBeLessThan(CHANGE_MS);
          await whileLit?.();

          await other.waitForTimeout(PULSE_END_MS);
          expect(await pulsedNames(actor), `${label}: actor pulsed`).toEqual(
            [],
          );
          expect(await pulsedNames(other), `${label}: observer pulsed`).toEqual(
            pulses,
          );
          expect(await rowEventsOf(actor), `${label}: actor's rows`).toEqual(
            ownRows,
          );
        }

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
          () => remove.click(),
          () =>
            row(pending(b), "Pan").waitFor({
              state: "detached",
              timeout: CHANGE_MS,
            }),
        );
        await expect(editor(a)).toBeHidden();

        // 6. A empties the cart: B's cart is empty, and nothing pulses.
        await step(
          "6 A empties the cart",
          a,
          b,
          [],
          ["unmount Leche cart"],
          () => emptyAction(a).click(),
          () =>
            cart(b)
              .getByText(texts.list.cart.empty)
              .waitFor({ timeout: CHANGE_MS }),
        );

        await expect(checkbox(b, "Leche")).toHaveCount(0);

        // At the end both show the same list: nothing left in either.
        for (const page of [a, b]) {
          await expect(pending(page).locator("li")).toHaveCount(0);
          await expect(cart(page).locator("li")).toHaveCount(0);
        }
        // And the server agrees: a read from scratch finds the same.
        expect(await reloadJoined(b)).toBe(listA.id);
        await expect(
          pending(b).getByText(texts.list.pending.empty),
        ).toBeVisible();
        await expect(cart(b).getByText(texts.list.cart.empty)).toBeVisible();
      } finally {
        const lines = steps.map(
          (s) =>
            `${s.label.padEnd(24)} ${s.ms} ms (${s.fromGesture} ms from the page's own click or key)`,
        );
        for (const s of steps) {
          testInfo.annotations.push({
            type: "timing",
            description: `${s.label}: ${s.ms} ms (${s.fromGesture} ms from the gesture)`,
          });
        }
        console.log(
          `[phase-2b timing ${colorScheme} r${testInfo.repeatEachIndex}]\n${lines.join("\n")}`,
        );
        await alice.context.close();
        await bob.context.close();
      }
    });
  });
}
