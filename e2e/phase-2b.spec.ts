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
 * Resolves with the id of the list whose channel the page has joined. It
 * listens on the Realtime websocket for the join's reply: `phx_reply` with
 * status ok, for the topic `realtime:list:<listId>:<n>` (the app's own),
 * carrying the ids of the postgres_changes bindings it asked for. With
 * `postgres_changes_options.wait` that reply is sent once the changes are
 * flowing. Only sockets opened after the call are heard, so it cannot pick
 * up a frame of the previous document: call it before the navigation.
 *
 * The join also makes the app read the items again (a moment later, to catch
 * up with whatever came with no event). That read is waited for too: one that
 * lands between a change and its event would show the change with no pulse
 * (refetches never pulse), so a step must not start while it is in flight.
 */
function channelJoined(page: Page): Promise<string> {
  let joined: string | undefined;
  return new Promise((resolve) => {
    page.on("websocket", (socket) => {
      if (!socket.url().includes("/realtime/")) return;
      socket.on("framereceived", ({ payload }) => {
        let message: unknown;
        try {
          message = JSON.parse(payload.toString());
        } catch {
          return;
        }
        // Protocol 1: an object; protocol 2: [join_ref, ref, topic, event, payload].
        const [topic, event, body] = Array.isArray(message)
          ? [message[2], message[3], message[4]]
          : [
              (message as { topic?: string }).topic,
              (message as { event?: string }).event,
              (message as { payload?: unknown }).payload,
            ];
        const reply = body as {
          status?: string;
          response?: { postgres_changes?: { table?: string }[] };
        };
        const listId = /^realtime:list:([0-9a-f-]{36}):\d+$/.exec(
          String(topic),
        )?.[1];
        if (
          event === "phx_reply" &&
          reply?.status === "ok" &&
          listId &&
          reply.response?.postgres_changes?.some(
            (change) => change.table === "items",
          )
        ) {
          joined = listId;
        }
      });
    });
    // The first read that starts after the join is the catch-up one.
    page.on("request", async (request) => {
      if (
        joined === undefined ||
        request.method() !== "GET" ||
        !/\/rest\/v1\/items\?/.test(request.url())
      ) {
        return;
      }
      const listId = joined;
      joined = undefined;
      await request.response().catch(() => null);
      resolve(listId);
    });
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
    __said?: string[];
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
 *
 * `__said`: every non-empty text the screen readers' live region of remote
 * changes (`[data-slot="remote-announcement"]`) takes, once per time it is set
 * (the sentence cleared 5 s later is not logged).
 */
async function recordPulses(context: BrowserContext) {
  await context.addInitScript(() => {
    const log: Pulse[] = [];
    const rows: string[] = [];
    window.__pulses = log;
    window.__rows = rows;
    const said: string[] = [];
    window.__said = said;
    // When the page itself saw the first tap or key since the last clear: Playwright's click waits
    // for the target to be stable first, and that wait is not the app's.
    for (const type of ["click", "keydown"]) {
      document.addEventListener(
        type,
        () => {
          window.__gestureAt ??= Date.now();
        },
        true,
      );
    }
    new MutationObserver((mutations) => {
      const regions = new Set<Element>();
      for (const mutation of mutations) {
        const node = mutation.target;
        const region = (
          node instanceof Element ? node : node.parentElement
        )?.closest('[data-slot="remote-announcement"]');
        if (region) regions.add(region);
      }
      for (const region of regions) {
        const text = region.textContent?.trim();
        if (text) said.push(text);
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
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
    window.__said?.splice(0);
    window.__gestureAt = undefined;
  });
}

function saidOf(page: Page) {
  return page.evaluate(() => window.__said ?? []);
}

/**
 * Waits until the region has taken a sentence (it is told 700 ms after the
 * burst starts), so a slow answer fails here with a clear message and the
 * step's sleeps do not have to grow.
 */
async function waitForSaid(page: Page, label: string) {
  await page
    .waitForFunction(() => (window.__said ?? []).length > 0, undefined, {
      timeout: 3000,
    })
    .catch(() => {
      throw new Error(`${label}: nothing was announced`);
    });
}

function rowEventsOf(page: Page) {
  return page.evaluate(() => window.__rows ?? []);
}

/** Waits, polling on every frame (expect.poll would round up), for a pulse. */
function waitForPulse(page: Page, name: string) {
  return page.waitForFunction(
    (pulsed) => (window.__pulses ?? []).some((pulse) => pulse.name === pulsed),
    name,
    { polling: "raf", timeout: CHANGE_MS },
  );
}

/** What happened to one row, from `rowEventsOf`. */
async function rowEventsFor(page: Page, name: string) {
  return (await rowEventsOf(page)).filter((event) => {
    const [, rowName] = event.split(" ");
    return rowName === name;
  });
}

/** Names in a section, top to bottom. */
function namesIn(section: Locator) {
  return section
    .locator('[role="checkbox"]')
    .evaluateAll((boxes) => boxes.map((box) => box.getAttribute("aria-label")));
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
  // So page.route sees every request (a service worker's are invisible to it).
  await context.addInitScript(() => {
    Reflect.deleteProperty(Navigator.prototype, "serviceWorker");
  });
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
         * once the time is taken, with the pulse still on. The other's
         * screen reader is told exactly `heard`, one sentence (a removal
         * does not pulse, but it is told), and the actor's is told nothing.
         */
        async function step(
          label: string,
          actor: Page,
          other: Page,
          pulses: string[],
          ownRows: string[],
          heard: string,
          gesture: () => Promise<void>,
          outcome: () => Promise<void>,
          whileLit?: () => Promise<void>,
        ) {
          await Promise.all([clearLogs(actor), clearLogs(other)]);
          const start = Date.now();
          await gesture();
          await outcome();
          for (const name of pulses) {
            await waitForPulse(other, name);
          }
          const end = Date.now();
          const ms = end - start;
          const gestureAt = await actor.evaluate(() => window.__gestureAt ?? 0);
          const fromGesture = end - gestureAt;
          steps.push({ label, ms, fromGesture });
          // The criterion is what the user sees after tapping: the page's own
          // click or key, not Playwright's wait for the target to be ready.
          expect(
            fromGesture,
            `${label} took ${fromGesture} ms from the gesture (${ms} ms in all)`,
          ).toBeLessThan(CHANGE_MS);
          await whileLit?.();

          await other.waitForTimeout(PULSE_END_MS);
          await waitForSaid(other, label);
          expect(await saidOf(other), `${label}: observer hears`).toEqual([
            heard,
          ]);
          expect(await saidOf(actor), `${label}: actor hears`).toEqual([]);
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
