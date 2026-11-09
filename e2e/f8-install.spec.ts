import { expect, test, type Page } from "@playwright/test";
import { INSTALL_KEY } from "../src/lib/install";
import { texts } from "../src/lib/texts";
import { SCHEMES, menuSheet } from "./sharing";
import {
  captureViewport,
  checkbox,
  emptyAction,
  field,
  openAndCreateList,
  row,
  pending,
  waitHydrated,
} from "./two-members";

/**
 * docs/improvements.md, F-8: the invitation to install the app, end to end at
 * 375px in light and dark. Chromium never offers an installation to a test,
 * so `beforeinstallprompt` is faked (a plain event with `prompt` and
 * `userChoice`, as Chrome's has), and `appinstalled` with it. The invitation
 * waits for a trip finished in an earlier visit: storage is seeded for the
 * most of the tests, and one of them finishes a trip for real.
 */

const t = texts.install;

declare global {
  interface Window {
    __installPrompts?: number;
  }
}

/** This device has finished `trips` trips and said "Ahora no" `dismissals`. */
async function seedMemory(
  page: Page,
  memory: { trips: number; dismissals?: number; dismissedAt?: number },
) {
  await page.addInitScript(
    ([key, value]) => {
      // Once: a reload keeps what the page itself wrote since.
      if (!window.localStorage.getItem(key)) {
        window.localStorage.setItem(key, value);
      }
    },
    [
      INSTALL_KEY,
      JSON.stringify({ dismissals: 0, dismissedAt: 0, ...memory }),
    ] as const,
  );
}

/** What Chrome does when the app is installable. */
async function offerInstall(
  page: Page,
  outcome: "accepted" | "dismissed" = "accepted",
) {
  await page.evaluate((choice) => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        window.__installPrompts = (window.__installPrompts ?? 0) + 1;
      },
      userChoice: Promise.resolve({ outcome: choice }),
    });
    window.dispatchEvent(event);
  }, outcome);
}

function notice(page: Page) {
  return page.getByTestId("install-notice");
}

async function openMenu(page: Page) {
  await page
    .getByRole("button", { name: texts.header.menu, exact: true })
    .click();
  await expect(menuSheet(page)).toBeVisible();
}

/**
 * The offer was heard (the menu has the entry) and yet the notice does not
 * show: the entry first, so "absent" cannot mean "never listened".
 */
async function expectEntryButNoNotice(page: Page) {
  await openMenu(page);
  await expect(menuEntry(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menuSheet(page)).toHaveCount(0);
  await expect(notice(page)).toHaveCount(0);
}

function menuEntry(page: Page) {
  return menuSheet(page).getByTestId("install-entry");
}

/** Adds a product, checks it and empties the cart: the moment is up. */
async function emptyOneProduct(page: Page) {
  await field(page).fill("Pan");
  await field(page).press("Enter");
  await expect(row(pending(page), "Pan")).toBeVisible();
  await checkbox(page, "Pan").click();
  await expect(emptyAction(page)).toBeVisible();
  await emptyAction(page).click();
  await expect(
    page.getByRole("group", { name: texts.moments.cartEmptied.eyebrow }),
  ).toBeVisible();
}

for (const scheme of SCHEMES) {
  test.describe(`F-8, install the app (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({ colorScheme: scheme, viewport: { width: 375, height: 812 } });

    test("Android: after a trip it asks and installs through the browser's prompt", async ({
      page,
    }, testInfo) => {
      await seedMemory(page, { trips: 1 });
      await openAndCreateList(page);
      await offerInstall(page);

      await expect(notice(page)).toBeVisible();
      await expect(notice(page)).toContainText(t.notice.title);
      await captureViewport(page, testInfo, `f8-notice-${scheme}`);

      await notice(page)
        .getByRole("button", { name: t.notice.install, exact: true })
        .click();
      await expect
        .poll(() => page.evaluate(() => window.__installPrompts))
        .toBe(1);
      // The browser said yes: the offer is spent and the notice is gone.
      await expect(notice(page)).toHaveCount(0);
    });

    test("appinstalled takes the notice and the menu entry away", async ({
      page,
    }) => {
      await seedMemory(page, { trips: 1 });
      await openAndCreateList(page);
      await offerInstall(page);
      await expect(notice(page)).toBeVisible();

      await page.evaluate(() =>
        window.dispatchEvent(new Event("appinstalled")),
      );
      await expect(notice(page)).toHaveCount(0);
      await openMenu(page);
      await expect(menuEntry(page)).toHaveCount(0);
    });

    test("never in the first use, but the menu always has the entry", async ({
      page,
    }) => {
      await seedMemory(page, { trips: 0 });
      await openAndCreateList(page);
      await offerInstall(page);
      await expectEntryButNoNotice(page);

      await openMenu(page);
      await expect(menuEntry(page)).toContainText(t.menu.title);
      await menuEntry(page)
        .getByRole("button", { name: t.menu.install, exact: true })
        .click();
      await expect
        .poll(() => page.evaluate(() => window.__installPrompts))
        .toBe(1);
    });

    test("'Ahora no' pauses it, and after two it never comes back by itself", async ({
      page,
    }) => {
      await seedMemory(page, { trips: 1 });
      await openAndCreateList(page);
      await offerInstall(page);
      await notice(page)
        .getByRole("button", { name: t.notice.later, exact: true })
        .click();
      await expect(notice(page)).toHaveCount(0);
      expect(
        await page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key) ?? "{}").dismissals,
          INSTALL_KEY,
        ),
      ).toBe(1);

      // Paused: not the next visit either, but the menu still offers it.
      await page.reload();
      await waitHydrated(page);
      await offerInstall(page);
      await expectEntryButNoNotice(page);
    });

    test("two dismissals are enough, and the pause ends before them", async ({
      page,
    }) => {
      const longAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      await seedMemory(page, { trips: 1, dismissals: 2, dismissedAt: longAgo });
      await openAndCreateList(page);
      await offerInstall(page);
      await expectEntryButNoNotice(page);
    });

    test("after one dismissal and the pause, it asks again", async ({
      page,
    }) => {
      const longAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      await seedMemory(page, { trips: 1, dismissals: 1, dismissedAt: longAgo });
      await openAndCreateList(page);
      await offerInstall(page);
      await expect(notice(page)).toBeVisible();
    });

    test("not while shopping", async ({ page }) => {
      await seedMemory(page, { trips: 1 });
      await openAndCreateList(page);
      await field(page).fill("Pan");
      await field(page).press("Enter");
      await expect(row(pending(page), "Pan")).toBeVisible();
      await offerInstall(page);
      await expect(notice(page)).toBeVisible();

      await page
        .getByRole("button", { name: texts.shopping.start, exact: true })
        .click();
      await expect(notice(page)).toHaveCount(0);
      await page
        .getByRole("button", { name: texts.shopping.exitAria, exact: true })
        .click();
      await expect(notice(page)).toBeVisible();
    });

    test("a trip finished here makes it ask on the next visit", async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await openAndCreateList(page);
      await offerInstall(page);
      await emptyOneProduct(page);
      // The first visit: the moment has the screen, and nothing else.
      await expectEntryButNoNotice(page);

      await page.reload();
      await waitHydrated(page);
      await offerInstall(page);
      await expect(notice(page)).toBeVisible();
    });

    test("never over the moment, and it comes once the moment is gone", async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await seedMemory(page, { trips: 1 });
      await openAndCreateList(page);
      await offerInstall(page);
      await expect(notice(page)).toBeVisible();

      await emptyOneProduct(page);
      await expect(notice(page)).toHaveCount(0);
      await page
        .getByRole("group", { name: texts.moments.cartEmptied.eyebrow })
        .getByRole("button", {
          name: texts.moments.cartEmptied.action,
          exact: true,
        })
        .click();
      await expect(notice(page)).toBeVisible();
    });

    test("an emptying put back is no trip", async ({ page }) => {
      test.setTimeout(60_000);
      await openAndCreateList(page);
      await emptyOneProduct(page);
      await page
        .getByRole("group", { name: texts.moments.cartEmptied.eyebrow })
        .getByRole("button", {
          name: texts.moments.cartEmptied.undo,
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("group", { name: texts.moments.cartEmptied.eyebrow }),
      ).toHaveCount(0);

      await page.reload();
      await waitHydrated(page);
      await offerInstall(page);
      await expectEntryButNoNotice(page);
    });

    test("already installed: nothing to invite to", async ({ page }) => {
      await seedMemory(page, { trips: 1 });
      await page.addInitScript(() => {
        const match = window.matchMedia.bind(window);
        window.matchMedia = (query: string) =>
          query === "(display-mode: standalone)"
            ? ({
                matches: true,
                media: query,
                addEventListener() {},
                removeEventListener() {},
              } as unknown as MediaQueryList)
            : match(query);
      });
      await openAndCreateList(page);
      await offerInstall(page);
      await page.waitForTimeout(500);
      await expect(notice(page)).toHaveCount(0);
      await openMenu(page);
      await expect(menuEntry(page)).toHaveCount(0);
    });
  });

  test.describe(`F-8, install on iOS Safari (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );
    test.use({
      colorScheme: scheme,
      viewport: { width: 375, height: 812 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    });

    test("there is no prompt: the notice and the menu show the steps", async ({
      page,
    }, testInfo) => {
      await seedMemory(page, { trips: 1 });
      await openAndCreateList(page);

      await expect(notice(page)).toBeVisible();
      await expect(notice(page)).toHaveAttribute("data-mode", "ios");
      await notice(page)
        .getByRole("button", { name: t.notice.how, exact: true })
        .click();
      const sheet = page.getByRole("dialog", { name: t.steps.title });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByTestId("install-steps")).toContainText(
        t.steps.add,
      );
      await captureViewport(page, testInfo, `f8-steps-${scheme}`);
      await sheet
        .getByRole("button", { name: t.steps.close, exact: true })
        .click();
      await expect(sheet).toHaveCount(0);

      // The menu unfolds them in place: never a sheet over a sheet.
      await notice(page)
        .getByRole("button", { name: t.notice.later, exact: true })
        .click();
      await openMenu(page);
      await menuEntry(page)
        .getByRole("button", { name: t.menu.how, exact: true })
        .click();
      await expect(menuEntry(page).getByTestId("install-steps")).toBeVisible();
      await menuEntry(page).scrollIntoViewIfNeeded();
      await captureViewport(page, testInfo, `f8-menu-${scheme}`);
    });
  });
}
