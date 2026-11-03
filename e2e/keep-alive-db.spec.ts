import { expect, test } from "@playwright/test";
import { anonymousUser, noSessionClient } from "./supabase-admin";

/**
 * The keep-alive query (migration `keep_alive`): the keep-staging-awake
 * workflow calls it with the publishable key and no session, as `anon`, so
 * that role can run it; signed-in users (anonymous ones included) cannot.
 */

test.skip(
  process.env.E2E_SUPABASE !== "1",
  "Needs `npm run db:start`. Run with E2E_SUPABASE=1.",
);

test("without a session keep_alive answers true", async () => {
  // GET, as the workflow's curl calls it.
  const { data, error } = await noSessionClient().rpc("keep_alive", undefined, {
    get: true,
  });
  expect(error).toBeNull();
  expect(data).toBe(true);
});

test("a signed-in user cannot call keep_alive", async () => {
  const { client } = await anonymousUser();
  const { error } = await client.rpc("keep_alive");
  expect(error?.code).toBe("42501");
});
