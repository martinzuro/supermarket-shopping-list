import { expect, test } from "@playwright/test";
import { anonymousUser, noSessionClient } from "./supabase-admin";

/**
 * The keep-alive query (migrations `keep_alive` and
 * `keep_alive_reads_a_table`): the keep-staging-awake workflow calls it with
 * the publishable key and no session, as `anon`, so that role can run it and
 * read the heartbeat row it reads, and change nothing; signed-in users
 * (anonymous ones included) cannot call it.
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

test("without a session the heartbeat is read-only", async () => {
  const anon = noSessionClient();
  const { data, error } = await anon.from("heartbeat").select("id");
  expect(error).toBeNull();
  expect(data).toEqual([{ id: true }]);

  const { error: deleteError } = await anon
    .from("heartbeat")
    .delete()
    .eq("id", true);
  expect(deleteError?.code).toBe("42501");
});

test("a signed-in user cannot call keep_alive", async () => {
  const { client } = await anonymousUser();
  const { error } = await client.rpc("keep_alive");
  expect(error?.code).toBe("42501");
});
