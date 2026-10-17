import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { texts } from "../src/lib/texts";

const SUPABASE_AUTH = "**/auth/v1/**";

function collectPageErrors(page: Page) {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  return errors;
}

/**
 * Makes Supabase Auth unreachable for the page. page.route does not see
 * requests a service worker makes on the page's behalf, so the page runs as
 * in a browser without service workers (Serwist then skips registration).
 */
async function cutSupabase(page: Page) {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Navigator.prototype, "serviceWorker");
  });
  await page.route(SUPABASE_AUTH, (route) =>
    route.abort("internetdisconnected"),
  );
}

/** Decodes the @supabase/ssr session cookie (possibly split in chunks). */
async function readSessionUser(context: BrowserContext) {
  const cookies = await context.cookies();
  const chunks = cookies
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  if (chunks.length === 0) return null;
  const value = chunks.map((cookie) => cookie.value).join("");
  const json = Buffer.from(value.replace(/^base64-/, ""), "base64url").toString(
    "utf8",
  );
  return JSON.parse(json).user as { id: string; is_anonymous: boolean };
}

test("without Supabase the shell renders with the offline banner", async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await cutSupabase(page);

  await page.goto("/");

  await expect(page.locator("h1")).toBeVisible();
  const banner = page.getByTestId("connection-banner");
  await expect(banner).toContainText(texts.connection.title);
  await expect(
    banner.getByRole("button", { name: texts.connection.retry }),
  ).toBeVisible();

  await page.getByRole("button", { name: texts.header.menu }).click();
  await expect(page.getByTestId("account-section")).toContainText(
    texts.account.offline,
  );
  expect(errors).toEqual([]);
});

// CI has no Supabase: these run only against the local stack.
test.describe("with the local Supabase stack", () => {
  test.skip(
    process.env.E2E_SUPABASE !== "1",
    "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
  );

  test("first load creates an anonymous session", async ({ page, context }) => {
    const errors = collectPageErrors(page);
    await page.goto("/");

    await page.getByRole("button", { name: texts.header.menu }).click();
    const account = page.getByTestId("account-section");
    await expect(
      account.getByLabel(texts.account.anonymous.emailLabel),
    ).toBeVisible();
    await expect(
      account.getByRole("button", { name: texts.account.anonymous.submit }),
    ).toBeVisible();
    await expect(page.getByTestId("connection-banner")).toHaveCount(0);

    const user = await readSessionUser(context);
    expect(user?.is_anonymous).toBe(true);
    expect(errors).toEqual([]);
  });

  test("the retry button recovers once Supabase is reachable", async ({
    page,
  }) => {
    await cutSupabase(page);
    await page.goto("/");
    const banner = page.getByTestId("connection-banner");
    await expect(banner).toBeVisible();

    await page.unroute(SUPABASE_AUTH);
    await banner.getByRole("button", { name: texts.connection.retry }).click();
    await expect(banner).toHaveCount(0);
  });
});
