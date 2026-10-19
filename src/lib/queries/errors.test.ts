import { describe, expect, it } from "vitest";
import { RequestError, shouldRetryMutation, unwrap } from "./errors";

describe("unwrap", () => {
  it("returns the data when there is no error", () => {
    expect(unwrap({ data: [1], error: null, status: 200 })).toEqual([1]);
  });

  it("throws a RequestError with status and code", () => {
    let thrown: unknown;
    try {
      unwrap({
        data: null,
        error: { message: "denied", code: "42501" },
        status: 403,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(RequestError);
    expect(thrown).toMatchObject({
      status: 403,
      code: "42501",
      message: "denied",
    });
  });
});

describe("shouldRetryMutation", () => {
  const rejected = new RequestError({ message: "denied", code: "42501" }, 403);
  const missing = new RequestError(
    { message: "no rows", code: "PGRST116" },
    406,
  );
  const noAnswer = new RequestError({ message: "TypeError: fetch" }, 0);
  const serverError = new RequestError({ message: "bad gateway" }, 502);

  it.each([
    ["a rejection (4xx)", rejected, false],
    ["a missing row", missing, false],
    ["no answer (status 0)", noAnswer, true],
    ["a server error (5xx)", serverError, true],
    ["an error that is not a request (a bug)", new Error("boom"), false],
  ])("on %s retries: %s", (_label, error, expected) => {
    expect(shouldRetryMutation(0, error)).toBe(expected);
  });

  it("stops after three retries", () => {
    expect(shouldRetryMutation(2, noAnswer)).toBe(true);
    expect(shouldRetryMutation(3, noAnswer)).toBe(false);
  });
});
