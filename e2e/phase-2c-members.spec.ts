import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { texts } from "../src/lib/texts";
import {
  SCHEMES,
  addItems,
  bringOver,
  capture,
  collectPageErrors,
  convertFromMenu,
  memberRows,
  membersButton,
  membersSheet,
  membershipNotice,
  openSharedList,
  shareButton,
  shareSheet,
  signInFromMenu,
  menuSheet,
  type Scheme,
} from "./sharing";
import {
  CHANGE_MS,
  clearLogs,
  framesOfList,
  newPlayer,
  openAndCreateList,
  pending,
  recordRealtime,
  reloadJoined,
  row,
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
