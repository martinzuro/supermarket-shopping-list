import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { texts } from "../src/lib/texts";
import {
  SCHEMES,
  addItems,
  bringOver,
  capture,
  collectPageErrors,
  becomeAccountAndGetLink,
  convertFromMenu,
  giveEmailAndCode,
  inviteLink,
  inviteScreen,
  memberRows,
  membersButton,
  membersSheet,
  membershipNotice,
  noticeDismiss,
  openSharedList,
  shareButton,
  shareSheet,
  signInFromMenu,
  menuSheet,
  type Scheme,
} from "./sharing";
import {
  CHANGE_MS,
  PULSE_END_MS,
  clearLogs,
  framesOfList,
  newPlayer,
  openAndCreateList,
  pending,
  pulsedNames,
  recordRealtime,
  reloadJoined,
  row,
  rowEventsOf,
  saidOf,
  waitForPulse,
  waitForSaid,
  type RealtimeFrame,
  type Step,
} from "./two-members";

/**
 * Phase 2c, part (c), end to end against the local Supabase stack: who
 * shares the list and the owner taking someone out, a member leaving, what
 * is asked about the list left behind after joining, and recovering an
 * account on another device with what that device had written before. All
 * through the real flows (the invitation, the sign-in code from Mailpit):
 * the service role puts nothing in place. Light and dark at 375px, with a
 * screenshot of each new state.
 */

const t = texts;

/**
 * The page left the list's channel in under a second from the gesture: the
 * leave it sends to Realtime. A channel left open would keep hearing the ids
 * of items deleted for good (Realtime does not check RLS on deletes), and
 * the screen alone cannot show that.
 */
async function expectChannelLeft(
  frames: RealtimeFrame[],
  listId: string,
  since: number,
) {
  const leave = () =>
    framesOfList(frames, listId).find(
      (frame) => frame.sent && frame.event === "phx_leave" && frame.t >= since,
    );
  await expect
    .poll(() => leave()?.t ?? null, { timeout: CHANGE_MS })
    .not.toBeNull();
  expect(leave()!.t - since).toBeLessThan(CHANGE_MS);
}

/** No change of the list reached the page after `since`. */
function expectNothingHeard(
  frames: RealtimeFrame[],
  listId: string,
  since: number,
) {
  expect(
    framesOfList(frames, listId).filter(
      (frame) =>
        !frame.sent && frame.event === "postgres_changes" && frame.t >= since,
    ),
  ).toEqual([]);
}

/** What a person leaving the screen of another must take, in under a second. */
async function measured(
  label: string,
  steps: Step[],
  actor: Page,
  gesture: () => Promise<void>,
  outcome: () => Promise<void>,
) {
  await clearLogs(actor);
  const start = Date.now();
  await gesture();
  await outcome();
  const end = Date.now();
  const gestureAt = await actor.evaluate(() => window.__gestureAt ?? 0);
  const fromGesture = end - gestureAt;
  steps.push({ label, ms: end - start, fromGesture });
  expect(
    fromGesture,
    `${label} took ${fromGesture} ms from the gesture (${end - start} ms in all)`,
  ).toBeLessThan(CHANGE_MS);
}

function report(steps: Step[], testInfo: TestInfo) {
  for (const s of steps) {
    testInfo.annotations.push({
      type: "timing",
      description: `${s.label}: ${s.ms} ms (${s.fromGesture} ms from the gesture)`,
    });
  }
  console.log(
    steps
      .map((s) => `${s.label}: ${s.ms} ms (${s.fromGesture} from the gesture)`)
      .join("\n"),
  );
}

/** The sentence a notice is read out as. */
function noticeSaid(page: Page) {
  return page
    .locator('[data-slot="membership-announcement"]')
    .evaluate((region) => region.textContent?.trim());
}

/** The removal button of the member in the row, asking or not. */
function removeButton(page: Page, index: number) {
  return memberRows(page)
    .nth(index)
    .getByRole("button", {
      name: new RegExp(
        `^(${t.members.remove.label(t.members.noAccountSpoken)}|${t.members.remove.confirmLabel(t.members.noAccountSpoken)})$`,
      ),
    });
}

function leaveButton(page: Page) {
  return membersSheet(page).getByRole("button", {
    name: new RegExp(
      `^(${t.members.leave.action}|${t.members.leave.confirm})$`,
    ),
  });
}

/** Both tap of the light confirmation: asks, waits for it to arm. */
async function ask(button: ReturnType<typeof leaveButton>) {
  await button.click();
  await expect(button).toHaveAttribute("data-armed", "true");
}

/** B's screen once it lost the list: the notice, the new list, no Leche. */
async function expectLostList(
  page: Page,
  kind: "left" | "removed",
  testInfo: TestInfo,
  scheme: Scheme,
) {
  const copy =
    kind === "left" ? t.membershipNotice.left : t.membershipNotice.removed;
  const notice = membershipNotice(page);
  await expect(notice).toHaveAttribute("data-kind", kind, {
    timeout: CHANGE_MS,
  });
  await expect(notice).toContainText(copy.title);
  await expect(notice).toContainText(copy.body);
  await expect(pending(page).getByText("Leche")).toHaveCount(0);
  expect(await noticeSaid(page)).toBe(`${copy.title}. ${copy.body}`);
  // The list the user lands on is their own: new, empty, and theirs to share.
  await expect(pending(page).getByText(t.list.pending.empty)).toBeVisible();
  await expect(shareButton(page)).toBeVisible();
  await capture(page, testInfo, `notice-${kind}`, scheme);
}

/**
 * The sheet the person acted from is gone with the list: the focus is on the
 * notice (its close button), not on <body>, and not left on the sheet's
 * trigger either.
 */
async function expectNoticeFocused(page: Page) {
  await expect(noticeDismiss(page)).toBeFocused();
}

async function dismissNotice(page: Page) {
  await membershipNotice(page)
    .getByRole("button", { name: t.membershipNotice.dismiss })
    .click();
  await expect(membershipNotice(page)).toHaveCount(0);
}

for (const scheme of SCHEMES) {
  test.describe(`phase 2c, members (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );

    test("the owner sees who shares and takes a member out; they lose the list at once", async ({
      browser,
    }, testInfo) => {
      test.setTimeout(150_000);
      const alice = await newPlayer(browser, testInfo, scheme);
      const bob = await newPlayer(browser, testInfo, scheme);
      const [a, b] = [alice.page, bob.page];
      const errors = [a, b].map(collectPageErrors);
      const steps: Step[] = [];

      try {
        const realtime = recordRealtime(b);
        const { list, email } = await openSharedList(a, b, testInfo, scheme);

        // A never reloaded: their sheet was open on the invitation when B
        // joined, and the members appeared by themselves. B is anonymous.
        await expect(memberRows(a)).toHaveCount(2);
        await expect(memberRows(a).nth(0)).toContainText(t.members.you);
        await expect(memberRows(a).nth(0)).toContainText(email);
        await expect(memberRows(a).nth(0)).toContainText(t.members.owner);
        await expect(memberRows(a).nth(1)).toContainText(t.members.noAccount);
        await expect(memberRows(a).nth(1)).not.toContainText(t.members.you);
        await expect(removeButton(a, 0)).toHaveCount(0);
        await capture(a, testInfo, "members-owner", scheme);

        // B sees the same two people, from the other side, and cannot
        // remove anyone or invite; they can leave.
        await membersButton(b).click();
        await expect(membersSheet(b)).toBeVisible();
        await expect(memberRows(b)).toHaveCount(2);
        await expect(memberRows(b).nth(0)).toContainText(email);
        await expect(memberRows(b).nth(0)).toContainText(t.members.owner);
        await expect(memberRows(b).nth(1)).toContainText(t.members.you);
        await expect(memberRows(b).nth(1)).toContainText(t.members.noAccount);
        await expect(
          membersSheet(b).getByRole("button", { name: /^Sacar a/ }),
        ).toHaveCount(0);
        await expect(leaveButton(b)).toBeVisible();
        await expect(membersSheet(b).getByTestId("share-invite")).toHaveCount(
          0,
        );
        await capture(b, testInfo, "members-member", scheme);
        await b.keyboard.press("Escape");
        await expect(membersSheet(b)).toBeHidden();

        // A asks first: nothing happens until the second tap.
        const remove = removeButton(a, 1);
        await remove.click();
        await expect(remove).toHaveAttribute("data-armed", "true");
        await expect(remove).toHaveText(t.members.remove.confirm);
        await expect(memberRows(a).nth(1)).toContainText(
          t.members.remove.consequence,
        );
        await expect(memberRows(a)).toHaveCount(2);
        await capture(a, testInfo, "members-remove-confirm", scheme);

        // The second tap: B leaves the list from A's gesture in under a
        // second, and A's members stop showing B at once.
        const removedAt = Date.now();
        await measured(
          "A removes B",
          steps,
          a,
          () => remove.click(),
          async () => {
            await expect(membershipNotice(b)).toHaveAttribute(
              "data-kind",
              "removed",
              { timeout: CHANGE_MS },
            );
            await expect(pending(b).getByText("Leche")).toHaveCount(0, {
              timeout: CHANGE_MS,
            });
          },
        );
        await expect(
          memberRows(a).filter({ hasText: t.members.noAccount }),
        ).toHaveCount(0);
        // Alone again: nothing left to list, only the invitation.
        await expect(a.getByTestId("members")).toHaveCount(0);
        await expect(shareSheet(a).getByTestId("share-invite")).toBeVisible();

        // And B stops listening to the list: its channel is left (Realtime
        // does not check RLS on deletes, so an open one would keep hearing).
        await expectChannelLeft(realtime, list.id, removedAt);

        // B is told, neutrally, and is on a list of their own.
        await expectLostList(b, "removed", testInfo, scheme);
        await expect(membershipNotice(b)).not.toContainText(/sacaron/i);
        await dismissNotice(b);

        // What A does next never reaches B, who is no longer in the list.
        await a.keyboard.press("Escape");
        await expect(shareSheet(a)).toBeHidden();
        const addedAt = Date.now();
        await addItems(a, ["Pan"]);
        await b.waitForTimeout(2500);
        await expect(pending(b).getByText("Pan")).toHaveCount(0);
        await expect(pending(b).getByText(t.list.pending.empty)).toBeVisible();
        expectNothingHeard(realtime, list.id, addedAt);

        // The server agrees. A has no members to show, B has their own list.
        expect(await reloadJoined(a)).toBe(list.id);
        await shareButton(a).click();
        await expect(shareSheet(a).getByTestId("share-invite")).toBeVisible();
        await expect(memberRows(a)).toHaveCount(0);
        const own = await reloadJoined(b);
        expect(own).not.toBe(list.id);
        await expect(pending(b).getByText("Pan")).toHaveCount(0);
        await expect(membershipNotice(b)).toHaveCount(0);

        for (const found of errors) expect(found).toEqual([]);
      } finally {
        report(steps, testInfo);
        await alice.context.close();
        await bob.context.close();
      }
    });

    test("a member leaves; the owner sees it without reloading and nothing reaches them", async ({
      browser,
    }, testInfo) => {
      test.setTimeout(150_000);
      const alice = await newPlayer(browser, testInfo, scheme);
      const bob = await newPlayer(browser, testInfo, scheme);
      const [a, b] = [alice.page, bob.page];
      const errors = [a, b].map(collectPageErrors);
      const steps: Step[] = [];

      try {
        const realtime = recordRealtime(b);
        const { list } = await openSharedList(a, b, testInfo, scheme);
        await expect(memberRows(a)).toHaveCount(2);

        await membersButton(b).click();
        await expect(membersSheet(b)).toBeVisible();
        const leave = leaveButton(b);
        await expect(leave).toHaveText(t.members.leave.action);
        await ask(leave);
        await expect(leave).toHaveText(t.members.leave.confirm);
        await expect(membersSheet(b)).toContainText(t.members.leave.hint);
        await capture(b, testInfo, "members-leave-confirm", scheme);

        // From B's second tap, A's members stop showing B in under a second
        // (A's sheet is open: nothing reloads).
        const leftAt = Date.now();
        await measured(
          "B leaves",
          steps,
          b,
          () => leave.click(),
          async () => {
            await expect(a.getByTestId("members")).toHaveCount(0, {
              timeout: CHANGE_MS,
            });
          },
        );
        await expect(membersSheet(b)).toBeHidden();
        await expectChannelLeft(realtime, list.id, leftAt);
        await expectLostList(b, "left", testInfo, scheme);
        await expectNoticeFocused(b);
        await dismissNotice(b);

        await a.keyboard.press("Escape");
        await expect(shareSheet(a)).toBeHidden();
        const addedAt = Date.now();
        await addItems(a, ["Pan"]);
        await b.waitForTimeout(2500);
        await expect(pending(b).getByText("Pan")).toHaveCount(0);
        expectNothingHeard(realtime, list.id, addedAt);
        expect(await reloadJoined(b)).not.toBe(list.id);
        await expect(membershipNotice(b)).toHaveCount(0);
        await expect(pending(b).getByText("Pan")).toHaveCount(0);

        for (const found of errors) expect(found).toEqual([]);
      } finally {
        report(steps, testInfo);
        await alice.context.close();
        await bob.context.close();
      }
    });

    test("a member removed while their sheet is open: the sheet closes and the focus goes to the notice", async ({
      browser,
    }, testInfo) => {
      test.setTimeout(150_000);
      const alice = await newPlayer(browser, testInfo, scheme);
      const bob = await newPlayer(browser, testInfo, scheme);
      const [a, b] = [alice.page, bob.page];
      const errors = [a, b].map(collectPageErrors);

      try {
        await openSharedList(a, b, testInfo, scheme);
        await expect(memberRows(a)).toHaveCount(2);

        await membersButton(b).click();
        await expect(membersSheet(b)).toBeVisible();
        await expect(memberRows(b)).toHaveCount(2);

        const remove = removeButton(a, 1);
        await ask(remove);
        await remove.click();

        // B's sheet was on screen the whole time: it does not vanish from
        // under them (no loading flash of a list that is gone), it closes
        // once B has a list of their own, and the focus follows the change.
        await expect(membershipNotice(b)).toHaveAttribute(
          "data-kind",
          "removed",
          { timeout: CHANGE_MS },
        );
        await expect(membersSheet(b)).toBeHidden();
        await expectNoticeFocused(b);
        await expect(pending(b).getByText(t.list.pending.empty)).toBeVisible();
        // The trigger is B's own now: an owner alone, who can invite.
        await expect(shareButton(b)).toBeVisible();
        await capture(b, testInfo, "removed-with-sheet-open", scheme);

        for (const found of errors) expect(found).toEqual([]);
      } finally {
        await alice.context.close();
        await bob.context.close();
      }
    });

    test("leaving that the server refuses: the list comes back, with a notice, and the focus is on it", async ({
      browser,
    }, testInfo) => {
      test.setTimeout(150_000);
      const alice = await newPlayer(browser, testInfo, scheme);
      const bob = await newPlayer(browser, testInfo, scheme);
      const [a, b] = [alice.page, bob.page];
      const errors = [a, b].map(collectPageErrors);

      try {
        await openSharedList(a, b, testInfo, scheme);
        await expect(memberRows(a)).toHaveCount(2);

        // The delete of the membership is refused, as RLS would; reads of
        // the lists and members go through.
        let refused = 0;
        await b.route("**/rest/v1/list_members*", (route) => {
          if (route.request().method() !== "DELETE") return route.fallback();
          refused += 1;
          return route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({
              code: "42501",
              message: "new row violates row-level security policy",
            }),
          });
        });

        await membersButton(b).click();
        await expect(membersSheet(b)).toBeVisible();
        const leave = leaveButton(b);
        await ask(leave);
        await leave.click();

        // It said it was refused: error tone, an alert, and still in the list.
        const notice = membershipNotice(b);
        await expect(notice).toHaveAttribute("data-kind", "leave_failed");
        await expect(notice).toContainText(
          t.membershipNotice.leaveFailed.title,
        );
        await expect(notice).toContainText(t.membershipNotice.leaveFailed.body);
        await expect(notice).toHaveAttribute("role", "alert");
        expect(refused).toBe(1);

        // The list is back on screen as it was, with its people, and the
        // sheet that closed did not leave the focus on <body>.
        await expect(row(pending(b), "Leche")).toBeVisible();
        await expect(membersSheet(b)).toBeHidden();
        await expect(membersButton(b)).toBeVisible();
        await expectNoticeFocused(b);
        await capture(b, testInfo, "notice-leave_failed", scheme);

        // Nothing of the server changed: A still has both in the list, and
        // B can look at them again.
        await expect(memberRows(a)).toHaveCount(2);
        await dismissNotice(b);
        await membersButton(b).click();
        await expect(memberRows(b)).toHaveCount(2);

        for (const found of errors) expect(found).toEqual([]);
      } finally {
        await alice.context.close();
        await bob.context.close();
      }
    });

    test("signing in from inside the share sheet keeps the sheet, with a calm loading state, and the feedback", async ({
      browser,
    }, testInfo) => {
      test.setTimeout(150_000);
      const device1 = await newPlayer(browser, testInfo, scheme);
      const device2 = await newPlayer(browser, testInfo, scheme);
      const [d1, d2] = [device1.page, device2.page];
      const errors = [d1, d2].map(collectPageErrors);

      try {
        // Device 1: an account with two things.
        await openAndCreateList(d1);
        await addItems(d1, ["Leche", "Pan"]);
        const email = await convertFromMenu(d1);

        // Device 2: no account, opens the share sheet and signs in to that
        // email from it. The new user's lists are held back, to see the
        // sheet while they load.
        await openAndCreateList(d2);
        await addItems(d2, ["Yerba"]);
        let hold = false;
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        await d2.route(
          /\/rest\/v1\/list_members\?select=role/,
          async (route) => {
            if (hold) await gate;
            await route.fallback();
          },
        );

        await shareButton(d2).click();
        const sheet = shareSheet(d2);
        await expect(sheet.getByTestId("share-guest")).toBeVisible();
        // Mark the very element: a sheet that unmounts and mounts again is
        // another node, and the mark is gone.
        const mark = "data-e2e-same-sheet";
        await sheet.evaluate(
          (node, name) => node.setAttribute(name, "1"),
          mark,
        );
        await giveEmailAndCode(sheet, email, async () => {
          hold = true;
        });

        // The user changed and their lists are loading: the sheet is still
        // there, same node, saying so, with the focus inside it.
        await expect(sheet.getByText(t.share.loading)).toBeVisible();
        await expect(sheet).toHaveAttribute(mark, "1");
        await expect(sheet.getByTestId("share-guest")).toHaveCount(0);
        // (Its trigger is behind the sheet, hidden from the accessibility
        // tree while the sheet is open: found by its label.)
        await expect(
          d2.locator(`button[aria-label="${t.share.open}"]`),
        ).toHaveCount(1);
        expect(
          await sheet.evaluate((node) => node.contains(document.activeElement)),
        ).toBe(true);
        await capture(d2, testInfo, "share-loading", scheme);

        // The account's list shows: the feedback is still there, with the
        // invitation of that list, in the same sheet.
        release();
        await expect(sheet.getByText(t.share.converted)).toBeVisible();
        await expect(inviteLink(d2)).toHaveText(/\/invite\/\S+$/);
        await expect(sheet).toHaveAttribute(mark, "1");
        await expect(sheet.getByText(t.share.loading)).toHaveCount(0);
        // The account's list is the one behind the sheet (by text: the rows
        // are hidden from the accessibility tree while the sheet is open).
        await expect(pending(d2).getByText("Leche")).toBeVisible();
        await expect(pending(d2).getByText("Yerba")).toHaveCount(0);
        await capture(d2, testInfo, "share-signed-in", scheme);

        // Closing it returns the focus to its trigger, as for any sheet.
        await d2.keyboard.press("Escape");
        await expect(sheet).toBeHidden();
        await expect(shareButton(d2)).toBeFocused();

        for (const found of errors) expect(found).toEqual([]);
      } finally {
        await device1.context.close();
        await device2.context.close();
      }
    });
  });

  test.describe(`phase 2c, invite when the user has a shared list (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );

    test("warns that their own list stays behind, offers it first, and still lets them join", async ({
      browser,
    }, testInfo) => {
      test.setTimeout(180_000);
      const alice = await newPlayer(browser, testInfo, scheme);
      const bob = await newPlayer(browser, testInfo, scheme);
      const carol = await newPlayer(browser, testInfo, scheme);
      const [a, b, c] = [alice.page, bob.page, carol.page];
      const errors = [a, b, c].map(collectPageErrors);

      try {
        // A owns a list B is in. C owns another one and makes a link.
        await openSharedList(a, b, testInfo, scheme);
        await a.keyboard.press("Escape");
        await expect(shareSheet(a)).toBeHidden();
        await openAndCreateList(c);
        await addItems(c, ["Yerba"]);
        const { link } = await becomeAccountAndGetLink(c, testInfo, scheme);

        // A opens it: the invitation, with what joining means for the list
        // they have, and their list as the main action.
        await a.goto(link);
        const screen = inviteScreen(a);
        await expect(screen).toHaveAttribute("data-state", "valid");
        await expect(screen).toHaveAttribute("data-guard", "true");
        const guard = a.getByTestId("invite-guard");
        await expect(guard).toContainText(t.invite.guard.title(1));
        await expect(guard).toContainText(t.invite.guard.body(1));
        const mine = a.getByRole("link", { name: t.invite.actions.goToMyList });
        const anyway = a.getByRole("button", {
          name: t.invite.actions.joinAnyway,
        });
        await expect(mine).toBeVisible();
        await expect(anyway).toBeVisible();
        await expect(
          a.getByRole("button", { name: t.invite.actions.join, exact: true }),
        ).toHaveCount(0);
        // The main action comes first and is the lime one; joining is quiet.
        const [mineBox, anywayBox] = await Promise.all([
          mine.boundingBox(),
          anyway.boundingBox(),
        ]);
        expect(mineBox!.y).toBeLessThan(anywayBox!.y);
        expect(
          await mine.evaluate((node) => getComputedStyle(node).backgroundColor),
        ).not.toBe(
          await anyway.evaluate(
            (node) => getComputedStyle(node).backgroundColor,
          ),
        );
        for (const box of [mineBox!, anywayBox!]) {
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
        expect(
          await a.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          ),
        ).toBeLessThanOrEqual(0);
        await capture(a, testInfo, "invite-guard", scheme);

        // Their list first: it is where it was, with B in it.
        await mine.click();
        await expect(a).toHaveURL("/");
        await expect(row(pending(a), "Leche")).toBeVisible();
        await expect(membersButton(a).or(shareButton(a))).toBeVisible();
        await shareButton(a).click();
        await expect(memberRows(a)).toHaveCount(2);
        await a.keyboard.press("Escape");

        // Joining is still theirs to choose.
        await a.goto(link);
        await expect(inviteScreen(a)).toHaveAttribute("data-guard", "true");
        await a
          .getByRole("button", { name: t.invite.actions.joinAnyway })
          .click();
        await expect(a).toHaveURL("/");
        await expect(row(pending(a), "Yerba")).toBeVisible();
        await expect(pending(a).getByText("Leche")).toHaveCount(0);
        // The list they left behind is still B's, as it was.
        await a.waitForTimeout(1500);
        await expect(row(pending(b), "Leche")).toBeVisible();
        await membersButton(b).click();
        await expect(memberRows(b)).toHaveCount(2);

        for (const found of errors) expect(found).toEqual([]);
      } finally {
        await alice.context.close();
        await bob.context.close();
        await carol.context.close();
      }
    });
  });

  test.describe(`phase 2c, bring it over (${scheme})`, () => {
    test.skip(
      process.env.E2E_SUPABASE !== "1",
      "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
    );

    test("the list left behind after joining is brought into the shared one", async ({
      browser,
    }, testInfo) => {
      test.setTimeout(150_000);
      const alice = await newPlayer(browser, testInfo, scheme);
      const bob = await newPlayer(browser, testInfo, scheme);
      const [a, b] = [alice.page, bob.page];
      const errors = [a, b].map(collectPageErrors);

      try {
        await openSharedList(a, b, testInfo, scheme, {
          bItems: ["Arroz", "Fideos"],
        });
        await a.keyboard.press("Escape");
        await expect(shareSheet(a)).toBeHidden();

        // B is asked, once, about the two things in the list they had.
        const prompt = bringOver(b);
        await expect(prompt).toHaveAttribute("data-kind", "leftover");
        await expect(prompt).toContainText(
          t.bringOver.leftover.title(t.bringOver.count(2)),
        );
        await expect(prompt).toContainText(t.bringOver.leftover.body);
        await expect(pending(b).getByText("Arroz")).toHaveCount(0);
        await capture(b, testInfo, "bring-over-leftover", scheme);

        // The same contract as any change between members (phase-2b): the
        // two things that come over pulse and are told on A's screen, one
        // sentence for the burst; B's own copies never pulse, are not told,
        // and mount once, with nothing else happening to their rows. The
        // two arrive in one statement, so their order is not asserted.
        await Promise.all([clearLogs(a), clearLogs(b)]);
        await prompt
          .getByRole("button", { name: t.bringOver.leftover.bring })
          .click();
        await expect(row(pending(b), "Arroz")).toBeVisible();
        await expect(row(pending(b), "Fideos")).toBeVisible();
        await expect(row(pending(b), "Leche")).toBeVisible();
        await expect(prompt).toHaveCount(0);
        // A sees them arrive, without reloading.
        await expect(row(pending(a), "Arroz")).toBeVisible({ timeout: 5000 });
        await expect(row(pending(a), "Fideos")).toBeVisible({ timeout: 5000 });
        await expect(row(pending(a), "Leche")).toBeVisible();
        await waitForPulse(a, "Arroz");
        await waitForPulse(a, "Fideos");
        await a.waitForTimeout(PULSE_END_MS);
        await waitForSaid(a, "bring over");

        expect((await pulsedNames(a)).sort(), "A: pulsed").toEqual([
          "Arroz",
          "Fideos",
        ]);
        expect(await saidOf(a), "A: heard").toEqual([
          t.remoteChanges.many.added(2),
        ]);
        expect((await rowEventsOf(a)).sort(), "A: rows").toEqual([
          "mount Arroz pending",
          "mount Fideos pending",
        ]);

        expect(await pulsedNames(b), "B: pulsed").toEqual([]);
        expect(await saidOf(b), "B: heard").toEqual([]);
        expect((await rowEventsOf(b)).sort(), "B: rows").toEqual([
          "mount Arroz pending",
          "mount Fideos pending",
        ]);

        // Answered: it does not come back.
        await reloadJoined(b);
        await expect(row(pending(b), "Arroz")).toBeVisible();
        await expect(bringOver(b)).toHaveCount(0);

        for (const found of errors) expect(found).toEqual([]);
      } finally {
        await alice.context.close();
        await bob.context.close();
      }
    });

    test("recovering on another device: the account's list loads and what that device had is offered", async ({
      browser,
    }, testInfo) => {
      test.setTimeout(150_000);
      const device1 = await newPlayer(browser, testInfo, scheme);
      const device2 = await newPlayer(browser, testInfo, scheme);
      const [d1, d2] = [device1.page, device2.page];
      const errors = [d1, d2].map(collectPageErrors);

      try {
        // Device 1: an account with two things.
        await openAndCreateList(d1);
        await addItems(d1, ["Leche", "Pan"]);
        const email = await convertFromMenu(d1);

        // Device 2: no account yet, two things of its own, then it signs in
        // to that email from the menu. The form says what happens to them.
        await openAndCreateList(d2);
        await addItems(d2, ["Yerba", "Café"]);
        await signInFromMenu(d2, email, async () => {
          await expect(menuSheet(d2)).toContainText(
            t.account.code.existingAccount,
          );
          await capture(d2, testInfo, "signin-existing-account", scheme);
        });

        // It shows the account's list, and offers the two things.
        await expect(row(pending(d2), "Leche")).toBeVisible();
        await expect(row(pending(d2), "Pan")).toBeVisible();
        await expect(pending(d2).getByText("Yerba")).toHaveCount(0);
        const prompt = bringOver(d2);
        await expect(prompt).toHaveAttribute("data-kind", "carry-over");
        await expect(prompt).toContainText(
          t.bringOver.carryOver.title(t.bringOver.count(2)),
        );
        await expect(prompt).toContainText(t.bringOver.carryOver.body);
        await capture(d2, testInfo, "bring-over-carry-over", scheme);

        await prompt
          .getByRole("button", { name: t.bringOver.carryOver.bring })
          .click();
        for (const name of ["Leche", "Pan", "Yerba", "Café"]) {
          await expect(row(pending(d2), name)).toBeVisible();
        }
        await expect(prompt).toHaveCount(0);
        // Device 1 gets them too, without reloading.
        await expect(row(pending(d1), "Yerba")).toBeVisible({ timeout: 5000 });
        await expect(row(pending(d1), "Café")).toBeVisible({ timeout: 5000 });

        // Answered: it does not come back.
        await reloadJoined(d2);
        await expect(row(pending(d2), "Yerba")).toBeVisible();
        await expect(bringOver(d2)).toHaveCount(0);

        for (const found of errors) expect(found).toEqual([]);
      } finally {
        await device1.context.close();
        await device2.context.close();
      }
    });
  });
}

test.describe("phase 2c, bring it over: the other answer", () => {
  test.skip(
    process.env.E2E_SUPABASE !== "1",
    "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
  );

  test("discarding the list left behind leaves the shared one as it was", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(150_000);
    const alice = await newPlayer(browser, testInfo, "light");
    const bob = await newPlayer(browser, testInfo, "light");
    const [a, b] = [alice.page, bob.page];
    try {
      await openSharedList(a, b, testInfo, "light", {
        bItems: ["Arroz", "Fideos"],
      });
      await a.keyboard.press("Escape");
      const prompt = bringOver(b);
      await expect(prompt).toContainText(
        t.bringOver.leftover.title(t.bringOver.count(2)),
      );
      await prompt
        .getByRole("button", { name: t.bringOver.leftover.drop })
        .click();
      await expect(prompt).toHaveCount(0);

      // Nothing came over, on either screen; A's list is intact.
      await a.waitForTimeout(2500);
      await expect(row(pending(b), "Leche")).toBeVisible();
      await expect(pending(b).getByText("Arroz")).toHaveCount(0);
      await expect(row(pending(a), "Leche")).toBeVisible();
      await expect(pending(a).getByText("Arroz")).toHaveCount(0);
      await expect(pending(a).getByText("Fideos")).toHaveCount(0);

      // And it is gone for good: not asked again after a reload.
      await reloadJoined(b);
      await expect(row(pending(b), "Leche")).toBeVisible();
      await expect(bringOver(b)).toHaveCount(0);
      await expect(pending(b).getByText("Arroz")).toHaveCount(0);
    } finally {
      await alice.context.close();
      await bob.context.close();
    }
  });

  test("leaving out what the device had keeps only the account's items", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(150_000);
    const device1 = await newPlayer(browser, testInfo, "light");
    const device2 = await newPlayer(browser, testInfo, "light");
    const [d1, d2] = [device1.page, device2.page];
    try {
      await openAndCreateList(d1);
      await addItems(d1, ["Leche", "Pan"]);
      const email = await convertFromMenu(d1);

      await openAndCreateList(d2);
      await addItems(d2, ["Yerba", "Café"]);
      await signInFromMenu(d2, email);

      const prompt = bringOver(d2);
      await expect(prompt).toHaveAttribute("data-kind", "carry-over");
      await prompt
        .getByRole("button", { name: t.bringOver.carryOver.leave })
        .click();
      await expect(prompt).toHaveCount(0);

      await d2.waitForTimeout(2500);
      await expect(row(pending(d2), "Leche")).toBeVisible();
      await expect(row(pending(d2), "Pan")).toBeVisible();
      await expect(pending(d2).getByText("Yerba")).toHaveCount(0);
      await expect(pending(d1).getByText("Yerba")).toHaveCount(0);
      await expect(pending(d1).getByText("Café")).toHaveCount(0);

      await reloadJoined(d2);
      await expect(row(pending(d2), "Leche")).toBeVisible();
      await expect(bringOver(d2)).toHaveCount(0);
      await expect(pending(d2).getByText("Café")).toHaveCount(0);
    } finally {
      await device1.context.close();
      await device2.context.close();
    }
  });
});
