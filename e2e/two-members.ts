import {
  devices,
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { texts } from "../src/lib/texts";

/**
 * What the two-member e2e share (phase-2b.spec.ts and phase-2c.spec.ts): the
 * locators of the list, the logs a page keeps of what happens to its rows
 * (pulses, row mounts, what the screen readers' live region is told), and
 * the measured step: one member does something and the other must show it
 * in under a second, with the pulse on the other's rows only and no flicker
 * on the actor's own. Extracted from phase-2b.spec.ts, the reference.
 */

export const CHANGE_MS = 1000;
/** The pulse stays lit 400 ms and fades over 600 ms; this lets it all end. */
export const PULSE_END_MS = 1300;

export function pending(page: Page) {
  return page.locator("#pending");
}

export function cart(page: Page) {
  return page.locator("#cart");
}

export function field(page: Page) {
  return page.getByRole("textbox", { name: texts.addItem.label });
}

export function row(section: Locator, name: string) {
  return section.locator("li").filter({
    has: section.page().getByRole("checkbox", { name, exact: true }),
  });
}

export function checkbox(page: Page, name: string) {
  return page.getByRole("checkbox", { name, exact: true });
}

export function rowName(section: Locator, name: string) {
  return row(section, name).locator('[data-slot="list-row-name"]');
}

export function editor(page: Page) {
  return page.getByRole("dialog", { name: texts.editItem.title });
}

export function editorField(page: Page, label: string) {
  return editor(page).getByRole("textbox", { name: label, exact: true });
}

export function removeButton(page: Page) {
  return editor(page).getByRole("button", {
    name: new RegExp(
      `^(${texts.editItem.remove}|${texts.editItem.confirmRemove})$`,
    ),
  });
}

export function emptyAction(page: Page) {
  return cart(page).getByRole("button", {
    name: texts.list.cart.emptyAction,
    exact: true,
  });
}

/** The first answer of the catalog: the add bar needs it to pick a category. */
export function catalogLoaded(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.url().includes("/rest/v1/catalog") &&
      response.request().method() === "GET",
  );
}

export async function waitHydrated(page: Page) {
  await page.waitForFunction(() => {
    const input = document.querySelector("form input");
    return (
      input !== null &&
      Object.keys(input).some((key) => key.startsWith("__reactProps$"))
    );
  });
}

export type CreatedList = { id: string; created_by: string };

/** First use: the app creates the list; its id and owner come from the POST. */
export async function openAndCreateList(page: Page): Promise<CreatedList> {
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
/** Topic, event and payload of a Realtime frame, or null if it is not one. */
function parseFrame(
  payload: string | Buffer,
): { topic: string; event: string; body: unknown } | null {
  let message: unknown;
  try {
    message = JSON.parse(payload.toString());
  } catch {
    return null;
  }
  // Protocol 1: an object; protocol 2: [join_ref, ref, topic, event, payload].
  const [topic, event, body] = Array.isArray(message)
    ? [message[2], message[3], message[4]]
    : [
        (message as { topic?: string }).topic,
        (message as { event?: string }).event,
        (message as { payload?: unknown }).payload,
      ];
  return { topic: String(topic), event: String(event), body };
}

export function channelJoined(page: Page): Promise<string> {
  let joined: string | undefined;
  return new Promise((resolve) => {
    page.on("websocket", (socket) => {
      if (!socket.url().includes("/realtime/")) return;
      socket.on("framereceived", ({ payload }) => {
        const frame = parseFrame(payload);
        if (!frame) return;
        const { topic, event, body } = frame;
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

export type RealtimeFrame = {
  /** Sent by the page (true) or received from the server. */
  sent: boolean;
  topic: string;
  event: string;
  t: number;
};

/**
 * Every Realtime frame the page sends or receives, with its topic and event,
 * as it happens. Like channelJoined, only sockets opened after the call are
 * heard: call it before the page navigates.
 */
export function recordRealtime(page: Page): RealtimeFrame[] {
  const frames: RealtimeFrame[] = [];
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/realtime/")) return;
    const record =
      (sent: boolean) =>
      ({ payload }: { payload: string | Buffer }) => {
        const frame = parseFrame(payload);
        if (frame) {
          frames.push({
            sent,
            topic: frame.topic,
            event: frame.event,
            t: Date.now(),
          });
        }
      };
    socket.on("framesent", record(true));
    socket.on("framereceived", record(false));
  });
  return frames;
}

/** Frames of the app's channel for a list (any of its openings). */
export function framesOfList(frames: RealtimeFrame[], listId: string) {
  return frames.filter((frame) =>
    frame.topic.startsWith(`realtime:list:${listId}:`),
  );
}

export async function reloadJoined(page: Page): Promise<string> {
  const joined = channelJoined(page);
  await page.reload();
  await expect(field(page)).toBeVisible();
  await waitHydrated(page);
  return joined;
}

export type Pulse = { name: string; t: number };

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
export async function recordPulses(context: BrowserContext) {
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

export function pulsesOf(page: Page) {
  return page.evaluate(() => window.__pulses ?? []);
}

export async function clearLogs(page: Page) {
  await page.evaluate(() => {
    window.__pulses?.splice(0);
    window.__rows?.splice(0);
    window.__said?.splice(0);
    window.__gestureAt = undefined;
  });
}

export function saidOf(page: Page) {
  return page.evaluate(() => window.__said ?? []);
}

/**
 * Waits until the region has taken a sentence (it is told 700 ms after the
 * burst starts), so a slow answer fails here with a clear message and the
 * step's sleeps do not have to grow.
 */
export async function waitForSaid(page: Page, label: string) {
  await page
    .waitForFunction(() => (window.__said ?? []).length > 0, undefined, {
      timeout: 3000,
    })
    .catch(() => {
      throw new Error(`${label}: nothing was announced`);
    });
}

export function rowEventsOf(page: Page) {
  return page.evaluate(() => window.__rows ?? []);
}

/** Waits, polling on every frame (expect.poll would round up), for a pulse. */
export function waitForPulse(page: Page, name: string) {
  return page.waitForFunction(
    (pulsed) => (window.__pulses ?? []).some((pulse) => pulse.name === pulsed),
    name,
    { polling: "raf", timeout: CHANGE_MS },
  );
}

/** What happened to one row, from `rowEventsOf`. */
export async function rowEventsFor(page: Page, name: string) {
  return (await rowEventsOf(page)).filter((event) => {
    const [, rowName] = event.split(" ");
    return rowName === name;
  });
}

/** Names in a section, top to bottom. */
export function namesIn(section: Locator) {
  return section
    .locator('[role="checkbox"]')
    .evaluateAll((boxes) => boxes.map((box) => box.getAttribute("aria-label")));
}

/** Names that pulsed since the last clear, once each, in order. */
export async function pulsedNames(page: Page) {
  return [...new Set((await pulsesOf(page)).map((pulse) => pulse.name))];
}

/**
 * A member: a browser context at 375px (Pixel 7) with the logs installed.
 * Every context starts as a device that already saw the welcome screen
 * (playwright.config.ts), unless `welcomeSeen` is false: a person arriving
 * by an invitation on a device that never opened the app.
 */
export async function newPlayer(
  browser: Browser,
  testInfo: TestInfo,
  colorScheme: "light" | "dark",
  { welcomeSeen = true }: { welcomeSeen?: boolean } = {},
) {
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    viewport: { width: 375, height: 812 },
    colorScheme,
    storageState: welcomeSeen
      ? testInfo.project.use.storageState
      : { cookies: [], origins: [] },
  });
  await recordPulses(context);
  // So page.route sees every request (a service worker's are invisible to it).
  await context.addInitScript(() => {
    Reflect.deleteProperty(Navigator.prototype, "serviceWorker");
  });
  return { context, page: await context.newPage() };
}

export type Step = { label: string; ms: number; fromGesture: number };

/**
 * The measured step, recorded in `steps`. `gesture` is the action in
 * `actor`; `outcome` is what the `other` must show, and it returns when it
 * does. The time runs from just before the gesture to there, the pulses in
 * `pulses` included. The pulse logs are cleared first and read once the pulse
 * is over: whatever is in them belongs to this step. The actor's own rows
 * never pulse; the other's pulse only on the rows in `pulses`. Nor do they
 * flicker: the actor's row log is exactly `ownRows`, the one change the step
 * makes to its own rows and nothing else. `whileLit` runs once the time is
 * taken, with the pulse still on. The other's screen reader is told exactly
 * `heard`, one sentence (a removal does not pulse, but it is told), and the
 * actor's is told nothing.
 */
export function stepper(steps: Step[]) {
  return async function step(
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
    expect(await saidOf(other), `${label}: observer hears`).toEqual([heard]);
    expect(await saidOf(actor), `${label}: actor hears`).toEqual([]);
    expect(await pulsedNames(actor), `${label}: actor pulsed`).toEqual([]);
    expect(await pulsedNames(other), `${label}: observer pulsed`).toEqual(
      pulses,
    );
    expect(await rowEventsOf(actor), `${label}: actor's rows`).toEqual(ownRows);
  };
}

/** Annotates the test with every step's time and prints them, whatever happened. */
export function reportSteps(steps: Step[], testInfo: TestInfo, tag: string) {
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
  console.log(`[${tag} r${testInfo.repeatEachIndex}]\n${lines.join("\n")}`);
}
