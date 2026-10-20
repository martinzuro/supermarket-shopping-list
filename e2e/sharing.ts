import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { texts } from "../src/lib/texts";
import { codeSentTo, uniqueEmail } from "./mailpit";
import {
  field,
  openAndCreateList,
  pending,
  reloadJoined,
  type CreatedList,
} from "./two-members";

/**
 * What the sharing e2e share (phase-2c.spec.ts and phase-2c-members.spec.ts):
 * the locators of the share sheet and the menu, screenshots, the sign-in with
 * the code Auth mails to Mailpit, and the setup of two people in one list
 * through the real invitation (no membership put by the service role).
 */

export const SCHEMES = ["light", "dark"] as const;
export type Scheme = (typeof SCHEMES)[number];

/** The header action of the owner, who can invite. */
export function shareButton(page: Page) {
  return page.getByRole("button", { name: texts.share.open, exact: true });
}

/** The header action of a plain member, who only sees who shares. */
export function membersButton(page: Page) {
  return page.getByRole("button", { name: texts.members.open, exact: true });
}

export function shareSheet(page: Page) {
  return page.getByRole("dialog", { name: texts.share.title });
}

export function membersSheet(page: Page) {
  return page.getByRole("dialog", { name: texts.members.title });
}

export function inviteLink(page: Page) {
  return page.getByTestId("invite-link");
}

export function inviteScreen(page: Page) {
  return page.getByTestId("invite-screen");
}

/** The people in the sheet that is open, one row each. */
export function memberRows(page: Page) {
  return page.getByTestId("members").locator('[data-slot="member-row"]');
}

export function menuSheet(page: Page) {
  return page.getByRole("dialog", { name: texts.menu.title });
}

export function bringOver(page: Page) {
  return page.getByTestId("bring-over");
}

export function membershipNotice(page: Page) {
  return page.getByTestId("membership-notice");
}

/** A screenshot at 375px, on disk (test-results/) and attached to the report. */
export async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string,
  scheme: Scheme,
) {
  // Entrances (the invitation's last item enters about 0.8 s in) and the
  // sheet sliding in: the picture is of the settled screen.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  const path = testInfo.outputPath(`${name}-${scheme}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(`${name}-${scheme}`, {
    path,
    contentType: "image/png",
  });
}

export function collectPageErrors(page: Page) {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  return errors;
}

export async function readLink(page: Page) {
  return ((await inviteLink(page).textContent()) ?? "").trim();
}

/** The token at the end of an invitation link. */
export function tokenOf(link: string) {
  return decodeURIComponent(link.slice(link.lastIndexOf("/") + 1));
}

/** Waits for the invitation to show a link other than `previous`. */
export function waitForOtherLink(page: Page, previous: string) {
  return page.waitForFunction((before) => {
    const text = document
      .querySelector('[data-testid="invite-link"]')
      ?.textContent?.trim();
    return text !== undefined && text !== before;
  }, previous);
}

/**
 * The email step and the code step of the account form, wherever it is (the
 * menu or the share sheet): gives the email, types the code Auth mailed to
 * Mailpit, confirms. Works for a new account (conversion) and for one that
 * exists already (sign-in): the form is the same.
 */
export async function giveEmailAndCode(
  within: Locator,
  email: string,
  /** Runs once the code step is on screen, before the code is typed. */
  onCodeStep?: () => Promise<void>,
) {
  await within.getByLabel(texts.account.anonymous.emailLabel).fill(email);
  const since = Date.now();
  await within
    .getByRole("button", { name: texts.account.anonymous.submit })
    .click();
  await expect(within.getByLabel(texts.account.code.label)).toBeVisible();
  await onCodeStep?.();
  const code = await codeSentTo(email, { since });
  await within.getByLabel(texts.account.code.label).fill(code);
  await within
    .getByRole("button", { name: texts.account.code.submit, exact: true })
    .click();
}

/**
 * The share flow of an anonymous owner: open the sheet, give an email, type
 * the code Auth mailed, and end on the invitation. Returns the link. With
 * `shot`, takes the screenshots of the guest step and of the card.
 */
export async function becomeAccountAndGetLink(
  page: Page,
  testInfo: TestInfo,
  scheme: Scheme,
  shot = false,
) {
  const email = uniqueEmail("owner");
  await shareButton(page).click();
  const sheet = shareSheet(page);
  await expect(sheet.getByTestId("share-guest")).toBeVisible();
  // An anonymous owner is told why an account is needed before being asked.
  await expect(sheet).toContainText(texts.share.guest.why);
  await expect(inviteLink(page)).toHaveCount(0);
  if (shot) await capture(page, testInfo, "share-guest", scheme);

  await giveEmailAndCode(sheet, email);

  await expect(inviteLink(page)).toHaveText(/\/invite\/\S+$/);
  await expect(sheet.getByText(texts.share.converted)).toBeVisible();
  if (shot) await capture(page, testInfo, "share-invitation", scheme);
  return { email, link: await readLink(page) };
}

/**
 * Converts the anonymous account of a device from the menu, with the code
 * from Mailpit, and leaves the menu closed. Returns the email.
 */
export async function convertFromMenu(page: Page, email = uniqueEmail("acct")) {
  await page.getByRole("button", { name: texts.header.menu }).click();
  const menu = menuSheet(page);
  await giveEmailAndCode(menu, email);
  await expect(menu.getByText(texts.account.notices.confirmed)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  return email;
}

/**
 * Signs in from the menu to an account that exists (the email of
 * convertFromMenu), on a device whose anonymous list may have items, and
 * leaves the menu closed.
 */
export async function signInFromMenu(
  page: Page,
  email: string,
  onCodeStep?: () => Promise<void>,
) {
  await page.getByRole("button", { name: texts.header.menu }).click();
  const menu = menuSheet(page);
  await giveEmailAndCode(menu, email, onCodeStep);
  await expect(menu.getByText(texts.account.notices.signedIn)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
}

/** Adds items through the field, one by one, and waits for each to show. */
export async function addItems(page: Page, names: string[]) {
  for (const name of names) {
    await field(page).fill(name);
    await field(page).press("Enter");
    await expect(pending(page).getByText(name, { exact: true })).toBeVisible();
  }
}

/**
 * Two people in one list, by the real invitation: A opens the app, adds
 * "Leche", converts the account with the code from Mailpit and gets the link
 * (the share sheet is left open on the invitation); B, on another device,
 * opens the link and joins. `bItems` are put in B's own list first, so that
 * it is left behind when B joins. Ends with both on the shared list and both
 * channels open (B reloads: the list the user joined last is the one shown).
 */
export async function openSharedList(
  a: Page,
  b: Page,
  testInfo: TestInfo,
  scheme: Scheme,
  { bItems = [], shot = false }: { bItems?: string[]; shot?: boolean } = {},
): Promise<{ list: CreatedList; email: string; link: string }> {
  if (bItems.length > 0) {
    await openAndCreateList(b);
    await addItems(b, bItems);
  }
  const list = await openAndCreateList(a);
  await addItems(a, ["Leche"]);
  const { email, link } = await becomeAccountAndGetLink(
    a,
    testInfo,
    scheme,
    shot,
  );

  await b.goto(link);
  await expect(inviteScreen(b)).toHaveAttribute("data-state", "valid");
  await b.getByRole("button", { name: texts.invite.actions.join }).click();
  await expect(b).toHaveURL("/");
  await expect(pending(b).getByText("Leche")).toBeVisible();
  expect(await reloadJoined(b)).toBe(list.id);
  await expect(pending(b).getByText("Leche")).toBeVisible();
  return { list, email, link };
}
