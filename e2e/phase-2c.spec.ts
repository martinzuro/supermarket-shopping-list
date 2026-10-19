import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { palette } from "../src/lib/design/tokens";
import { texts } from "../src/lib/texts";
import {
  SCHEMES,
  becomeAccountAndGetLink,
  capture,
  collectPageErrors,
  inviteLink,
  inviteScreen,
  membersButton,
  membersSheet,
  memberRows,
  readLink,
  shareButton,
  shareSheet,
  tokenOf,
  waitForOtherLink,
} from "./sharing";
import { expireInvite } from "./supabase-admin";
import {
  CHANGE_MS,
  cart,
  channelJoined,
  checkbox,
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
 * Phase 2c, part (b), end to end against the local Supabase stack: one
 * person shares the list from the app (converting the account with the code
 * Auth mails to Mailpit), another opens the link on a device that never saw
 * the app and joins, and what each does reaches the other in under a second
 * (the criteria of phase-2b.spec.ts). Then the ways a link can fail, and the
 * share actions. No membership is put by the service role: the invitation is
 * the only way in. The service role only ages an invite (expireInvite).
 */

function rgb(hex: string) {
  const value = parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

/** What the invitation screen must keep at 375px, on the ink surface. */
async function expectInviteScreenInvariants(page: Page) {
  await expect(page.locator("h1")).toHaveCount(1);
  const { overflow, background, small } = await page.evaluate(() => {
    const screen = document.querySelector('[data-testid="invite-screen"]');
    return {
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      background: screen ? getComputedStyle(screen).backgroundColor : "",
      small: Array.from(
        document.querySelectorAll("button, a[href], input, [role=checkbox]"),
      )
        .filter((element) => !element.closest("nextjs-portal"))
        .map((element) => {
          const { width, height } = element.getBoundingClientRect();
          return {
            label: element.textContent?.trim().slice(0, 30),
            width: Math.round(width),
            height: Math.round(height),
          };
        })
        .filter((box) => box.width > 0 && (box.width < 44 || box.height < 44)),
    };
  });
  expect(overflow).toBeLessThanOrEqual(0);
  // The same ink in both schemes: the surface does not follow the mode.
  expect(background).toBe(rgb(palette.light["inverse-bg"]));
  expect(small).toEqual([]);
}

/** What the screen says in a state: its tag, the italic word and a way back. */
async function expectInviteState(
  page: Page,
  state: string,
  copy: { em: string },
  way: string,
) {
  await expect(inviteScreen(page)).toHaveAttribute("data-state", state);
  const heading = page.locator("h1");
  await expect(heading).toContainText(copy.em);
  await expect(heading.locator("em")).toHaveText(copy.em);
  await expect(page.getByRole("link", { name: way })).toBeVisible();
}

async function stubWebShare(context: BrowserContext) {
  await context.addInitScript(() => {
    const shared: unknown[] = [];
    Object.assign(window, { __shared: shared, __shareMode: "ok" });
    Object.defineProperty(Navigator.prototype, "share", {
      configurable: true,
      value: async (data: unknown) => {
        shared.push(data);
        const mode = (window as unknown as { __shareMode: string }).__shareMode;
        if (mode === "abort") throw new DOMException("closed", "AbortError");
        if (mode === "fail")
          throw new DOMException("denied", "NotAllowedError");
      },
    });
  });
}

function clipboardOf(page: Page) {
  return page.evaluate(() => navigator.clipboard.readText());
}

async function grantClipboard(context: BrowserContext, page: Page) {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  });
}

for (const scheme of SCHEMES) {
  // This needs the local stack: `npm run db:start` locally; the CI E2E job starts it.
  test.describe(`phase 2c, invite and accept (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );

    test("one person shares the list, another joins by the link, and changes reach both ways", async ({
      browser,
    }, testInfo) => {
      test.setTimeout(150_000);
      const alice = await newPlayer(browser, testInfo, scheme);
      // B has never opened the app: the welcome is pending on this device.
      const bob = await newPlayer(browser, testInfo, scheme, {
        welcomeSeen: false,
      });
      const carol = await newPlayer(browser, testInfo, scheme);
      await stubWebShare(alice.context);
      const [a, b, c] = [alice.page, bob.page, carol.page];
      const errors = [a, b, c].map(collectPageErrors);
      const steps: Step[] = [];
      const step = stepper(steps);

      try {
        // A opens the app for the first time and adds an item.
        const listA = await openAndCreateList(a);
        await field(a).fill("Leche");
        await field(a).press("Enter");
        await expect(pending(a).getByText("Leche")).toBeVisible();

        // A shares: first an account (email and the code from Mailpit), then
        // the link. Only the owner of the list is offered the button.
        const { email, link } = await becomeAccountAndGetLink(
          a,
          testInfo,
          scheme,
          true,
        );
        expect(link).toMatch(/^http:\/\/localhost:3000\/invite\/\S{16,}$/);
        await expect(shareSheet(a)).toContainText(texts.share.card.note);
        await expect(
          shareSheet(a).getByText(texts.share.card.eyebrow).first(),
        ).toBeVisible();

        // The share actions. Web Share is stubbed: the link goes to it with
        // the title and the text; closing the sheet says nothing; a failure
        // falls back to the copy.
        const sheetA = shareSheet(a);
        await grantClipboard(alice.context, a);
        await sheetA
          .getByRole("button", { name: texts.share.actions.share })
          .click();
        const shared = () =>
          a.evaluate(
            () => (window as unknown as { __shared: unknown[] }).__shared,
          );
        expect(await shared()).toEqual([
          {
            title: texts.share.message.title,
            text: texts.share.message.text,
            url: link,
          },
        ]);

        await a.evaluate(() => {
          (window as unknown as { __shareMode: string }).__shareMode = "abort";
        });
        await sheetA
          .getByRole("button", { name: texts.share.actions.share })
          .click();
        await expect.poll(async () => (await shared()).length).toBe(2);
        await expect(sheetA.getByRole("alert")).toHaveCount(0);
        await expect(sheetA.getByText(texts.share.copyFailed)).toHaveCount(0);
        await expect(
          sheetA.getByRole("button", { name: texts.share.actions.copied }),
        ).toHaveCount(0);

        await a.evaluate(() => {
          (window as unknown as { __shareMode: string }).__shareMode = "fail";
        });
        await sheetA
          .getByRole("button", { name: texts.share.actions.share })
          .click();
        await expect(
          sheetA
            .getByRole("status")
            .filter({ hasText: texts.share.actions.copied }),
        ).toHaveCount(1);
        expect(await clipboardOf(a)).toBe(link);

        // The copy action: the link lands in the clipboard and "copied" is
        // told in a live region.
        await a.evaluate(() => navigator.clipboard.writeText(""));
        await expect(
          sheetA.getByRole("button", { name: texts.share.actions.copy }),
        ).toBeVisible({ timeout: 4000 });
        await sheetA
          .getByRole("button", { name: texts.share.actions.copy })
          .click();
        await expect(
          sheetA.getByRole("button", { name: texts.share.actions.copied }),
        ).toBeVisible();
        expect(await clipboardOf(a)).toBe(link);

        // And when the clipboard refuses, the link is selected to copy by hand.
        await a.evaluate(() => {
          navigator.clipboard.writeText = () =>
            Promise.reject(new Error("denied"));
        });
        await expect(
          sheetA.getByRole("button", { name: texts.share.actions.copy }),
        ).toBeVisible({ timeout: 4000 });
        await sheetA
          .getByRole("button", { name: texts.share.actions.copy })
          .click();
        await expect(
          sheetA.getByText(texts.share.copyFailed).first(),
        ).toBeVisible();
        expect(await a.evaluate(() => window.getSelection()?.toString())).toBe(
          link,
        );
        await a.keyboard.press("Escape");
        await expect(sheetA).toBeHidden();

        // B opens the link, signed in as nobody yet: the invitation shows,
        // with A's email, and the target sizes and surface are the system's.
        const joinedB = channelJoined(b);
        await b.goto(link);
        await expect(inviteScreen(b)).toHaveAttribute("data-state", "valid");
        await expect(b.getByTestId("invite-inviter")).toHaveText(email);
        await expect(b.locator("h1 em")).toHaveText(texts.invite.valid.em);
        await expect(b.locator("h1")).toBeFocused();
        await expect(
          b.getByRole("link", { name: texts.invite.actions.later }),
        ).toBeVisible();
        await expectInviteScreenInvariants(b);
        await capture(b, testInfo, "invite-valid", scheme);

        // Joining fails once (the server answers with an error that is not
        // the link's fault): the screen stays, says so and offers to retry.
        await b.route("**/rest/v1/rpc/accept_invite", (route) =>
          route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ code: "XX000", message: "boom" }),
          }),
        );
        await b
          .getByRole("button", { name: texts.invite.actions.join })
          .click();
        await expect(inviteScreen(b).getByRole("alert")).toHaveText(
          texts.invite.errors.unknown,
        );
        await expect(inviteScreen(b)).toHaveAttribute("data-state", "valid");
        await b.unroute("**/rest/v1/rpc/accept_invite");

        // B joins: it lands on "/" with A's item, with no welcome screen
        // even though this device never saw it.
        await b
          .getByRole("button", { name: texts.invite.actions.retryJoin })
          .click();
        await expect(b).toHaveURL("/");
        await expect(field(b)).toBeVisible();
        await expect(pending(b).getByText("Leche")).toBeVisible();
        await expect(b.getByTestId("welcome")).toHaveCount(0);
        expect(await joinedB).toBe(listA.id);
        expect(
          await b.evaluate(() => localStorage.getItem("lista:welcome-seen")),
        ).not.toBeNull();
        // A member that is not the owner cannot invite: no share button,
        // and the sheet of who shares has no invitation in it.
        await expect(shareButton(b)).toHaveCount(0);
        await membersButton(b).click();
        await expect(membersSheet(b)).toBeVisible();
        await expect(memberRows(b)).toHaveCount(2);
        await expect(membersSheet(b).getByTestId("share-invite")).toHaveCount(
          0,
        );
        await b.keyboard.press("Escape");
        await expect(membersSheet(b)).toBeHidden();
        expect(await reloadJoined(a)).toBe(listA.id);
        await expect(shareButton(a)).toBeVisible();

        // Changes go both ways in under a second, with the pulse on the
        // other's rows only (phase-2b.spec.ts has the criteria).
        await field(a).fill("Pan");
        await field(b).fill("Yerba");

        await step(
          "1 A adds Pan",
          a,
          b,
          ["Pan"],
          ["mount Pan pending"],
          texts.remoteChanges.one.added("Pan"),
          () => field(a).press("Enter"),
          () => row(pending(b), "Pan").waitFor({ timeout: CHANGE_MS }),
        );

        await step(
          "2 B adds Yerba",
          b,
          a,
          ["Yerba"],
          ["mount Yerba pending"],
          texts.remoteChanges.one.added("Yerba"),
          () => field(b).press("Enter"),
          () => row(pending(a), "Yerba").waitFor({ timeout: CHANGE_MS }),
        );

        await step(
          "3 B checks Pan",
          b,
          a,
          ["Pan"],
          ["checked Pan false>true", "unmount Pan pending", "mount Pan cart"],
          texts.remoteChanges.one.checked("Pan"),
          () => checkbox(b, "Pan").click(),
          () => row(cart(a), "Pan").waitFor({ timeout: CHANGE_MS }),
        );

        await step(
          "4 A checks Yerba",
          a,
          b,
          ["Yerba"],
          [
            "checked Yerba false>true",
            "unmount Yerba pending",
            "mount Yerba cart",
          ],
          texts.remoteChanges.one.checked("Yerba"),
          () => checkbox(a, "Yerba").click(),
          () => row(cart(b), "Yerba").waitFor({ timeout: CHANGE_MS }),
        );

        // The server agrees: B reads the same list from scratch.
        expect(await reloadJoined(b)).toBe(listA.id);
        await expect(row(cart(b), "Pan")).toBeVisible();
        await expect(row(cart(b), "Yerba")).toBeVisible();
        await expect(pending(b).getByText("Leche")).toBeVisible();
        await expect(b.getByTestId("welcome")).toHaveCount(0);

        // The link was used once: a third person finds it spent, and the
        // same link for B (a member) says they are in already.
        await c.goto(link);
        await expectInviteState(
          c,
          "used",
          texts.invite.used,
          texts.invite.actions.goToMyList,
        );
        await expectInviteScreenInvariants(c);
        await capture(c, testInfo, "invite-used", scheme);
        await c
          .getByRole("link", { name: texts.invite.actions.goToMyList })
          .click();
        await expect(c).toHaveURL("/");
        await expect(field(c)).toBeVisible();

        await b.goto(link);
        await expectInviteState(
          b,
          "member",
          texts.invite.member,
          texts.invite.actions.goToList,
        );
        await b
          .getByRole("link", { name: texts.invite.actions.goToList })
          .click();
        await expect(b).toHaveURL("/");
        await expect(pending(b).getByText("Leche")).toBeVisible();

        // A asks for another link (a new invite), opens it themself ("this
        // link is yours"), and then it ages past its seven days for C.
        // Opening the sheet again makes a fresh invite (the first is spent),
        // and "another link" makes one more.
        await shareButton(a).click();
        await expect(inviteLink(a)).toHaveText(/\/invite\/\S+$/);
        const reopened = await readLink(a);
        expect(reopened).not.toBe(link);
        await shareSheet(a)
          .getByRole("button", { name: texts.share.actions.another })
          .click();
        await waitForOtherLink(a, reopened);
        const second = await readLink(a);
        expect([link, reopened]).not.toContain(second);

        await a.goto(second);
        await expectInviteState(
          a,
          "own",
          texts.invite.own,
          texts.invite.actions.goToMyList,
        );
        await a
          .getByRole("link", { name: texts.invite.actions.goToMyList })
          .click();
        await expect(a).toHaveURL("/");
        await expect(pending(a).getByText("Leche")).toBeVisible();

        await expireInvite(tokenOf(second));
        await c.goto(second);
        await expectInviteState(
          c,
          "expired",
          texts.invite.expired,
          texts.invite.actions.goToMyList,
        );
        await expectInviteScreenInvariants(c);

        // A link that never existed.
        await c.goto(`/invite/${"x".repeat(32)}`);
        await expectInviteState(
          c,
          "not_found",
          texts.invite.notFound,
          texts.invite.actions.goToMyList,
        );
        await expectInviteScreenInvariants(c);

        for (const found of errors) expect(found).toEqual([]);
      } finally {
        reportSteps(steps, testInfo, `phase-2c timing ${scheme}`);
        await alice.context.close();
        await bob.context.close();
        await carol.context.close();
      }
    });
  });
}

test.describe("phase 2c, share without Web Share", () => {
  test.skip(
    process.env.E2E_SUPABASE !== "1",
    "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
  );

  test("the link is copied when the browser cannot share", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(60_000);
    const owner = await newPlayer(browser, testInfo, "light");
    await owner.context.addInitScript(() => {
      Reflect.deleteProperty(Navigator.prototype, "share");
    });
    const page = owner.page;
    try {
      await openAndCreateList(page);
      const { link } = await becomeAccountAndGetLink(page, testInfo, "light");
      await grantClipboard(owner.context, page);
      const sheet = shareSheet(page);
      // No share button: copying is the main action.
      await expect(
        sheet.getByRole("button", { name: texts.share.actions.share }),
      ).toHaveCount(0);
      await sheet
        .getByRole("button", { name: texts.share.actions.copy })
        .click();
      await expect(
        sheet.getByRole("button", { name: texts.share.actions.copied }),
      ).toBeVisible();
      expect(await clipboardOf(page)).toBe(link);
    } finally {
      await owner.context.close();
    }
  });
});
