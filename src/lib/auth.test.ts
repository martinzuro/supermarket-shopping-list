import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthPKCECodeVerifierMissingError,
} from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  classifyAuthError,
  noticeForLinkError,
  normalizeOtp,
  OTP_EXPIRY_MS,
  resendSecondsLeft,
  retryDelay,
  RETRY_MAX_MS,
  safeNextPath,
  takeAccountNotice,
} from "@/lib/auth";

describe("safeNextPath", () => {
  it.each([
    ["/", "/"],
    ["/invite/abc123", "/invite/abc123"],
    ["/lista?x=1#y", "/lista?x=1#y"],
    ["/%2F%2Fevil.com", "/%2F%2Fevil.com"],
  ])("keeps the same-origin path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["https://evil.com"],
    ["//evil.com"],
    ["/\\evil.com"],
    ["\\\\evil.com"],
    ["/\t/evil.com"],
    ["/\n/evil.com"],
    ["javascript:alert(1)"],
    ["evil.com"],
    [" /lista"],
    ["/auth/callback"],
    ["/auth/callback?next=/"],
  ])("falls back to / for %j", (input) => {
    expect(safeNextPath(input)).toBe("/");
  });
});

describe("takeAccountNotice", () => {
  it("reads and removes the notice", () => {
    expect(
      takeAccountNotice("http://localhost:3000/?account=confirmed"),
    ).toEqual({ notice: "confirmed", cleanHref: "http://localhost:3000/" });
  });

  it("keeps other parameters", () => {
    expect(
      takeAccountNotice(
        "http://localhost:3000/lista?a=1&account=other_browser",
      ),
    ).toEqual({
      notice: "other_browser",
      cleanHref: "http://localhost:3000/lista?a=1",
    });
  });

  it("ignores unknown values but still cleans them", () => {
    expect(takeAccountNotice("http://localhost:3000/?account=hacked")).toEqual({
      notice: null,
      cleanHref: "http://localhost:3000/",
    });
  });

  it("returns the URL untouched when there is nothing to read", () => {
    expect(takeAccountNotice("http://localhost:3000/")).toEqual({
      notice: null,
      cleanHref: "http://localhost:3000/",
    });
  });

  it("maps the error fragment Supabase Auth appends to a used link", () => {
    expect(
      takeAccountNotice(
        "http://localhost:3000/?account=link_invalid#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
      ),
    ).toEqual({ notice: "link_expired", cleanHref: "http://localhost:3000/" });
  });

  it("treats any other error fragment as an invalid link", () => {
    expect(
      takeAccountNotice("http://localhost:3000/#error=server_error"),
    ).toEqual({ notice: "link_invalid", cleanHref: "http://localhost:3000/" });
  });
});

describe("classifyAuthError", () => {
  const sentAt = 1_000_000;

  it("detects network failures", () => {
    expect(
      classifyAuthError(new AuthRetryableFetchError("fetch failed", 0)),
    ).toBe("network");
    expect(classifyAuthError(new TypeError("Failed to fetch"))).toBe("network");
  });

  it("detects rate limits", () => {
    expect(
      classifyAuthError(
        new AuthApiError("wait", 429, "over_email_send_rate_limit"),
      ),
    ).toBe("rate_limited");
    expect(
      classifyAuthError(
        new AuthApiError("wait", 429, "over_request_rate_limit"),
      ),
    ).toBe("rate_limited");
  });

  it("detects an email that already has an account", () => {
    expect(
      classifyAuthError(new AuthApiError("taken", 422, "email_exists")),
    ).toBe("email_exists");
  });

  it("detects an invalid email", () => {
    expect(
      classifyAuthError(new AuthApiError("bad", 400, "validation_failed")),
    ).toBe("invalid_email");
  });

  it("tells a wrong code from an expired one by the time it was sent", () => {
    const error = new AuthApiError("expired or invalid", 403, "otp_expired");
    expect(classifyAuthError(error, { sentAt, now: sentAt + 5_000 })).toBe(
      "wrong_code",
    );
    expect(
      classifyAuthError(error, { sentAt, now: sentAt + OTP_EXPIRY_MS + 1 }),
    ).toBe("expired_code");
    expect(classifyAuthError(error)).toBe("wrong_code");
  });

  it("falls back to unknown", () => {
    expect(classifyAuthError(new AuthApiError("boom", 500, undefined))).toBe(
      "unknown",
    );
    expect(classifyAuthError("nope")).toBe("unknown");
    expect(classifyAuthError(null)).toBe("unknown");
  });
});

describe("noticeForLinkError", () => {
  it("maps expired links", () => {
    expect(
      noticeForLinkError(new AuthApiError("expired", 403, "otp_expired")),
    ).toBe("link_expired");
    expect(
      noticeForLinkError(
        new AuthApiError("expired", 403, "flow_state_expired"),
      ),
    ).toBe("link_expired");
  });

  it("maps everything else to an invalid link", () => {
    expect(noticeForLinkError(new AuthPKCECodeVerifierMissingError())).toBe(
      "link_invalid",
    );
    expect(noticeForLinkError(new Error("x"))).toBe("link_invalid");
  });
});

describe("normalizeOtp", () => {
  it("keeps up to six digits", () => {
    expect(normalizeOtp("123 456")).toBe("123456");
    expect(normalizeOtp(" 12-34-56-78 ")).toBe("123456");
    expect(normalizeOtp("abc")).toBe("");
  });
});

describe("resendSecondsLeft", () => {
  it("counts down the 60 s cooldown", () => {
    expect(resendSecondsLeft(0, 0)).toBe(60);
    expect(resendSecondsLeft(0, 59_001)).toBe(1);
    expect(resendSecondsLeft(0, 60_000)).toBe(0);
    expect(resendSecondsLeft(0, 120_000)).toBe(0);
    expect(resendSecondsLeft(null, 0)).toBe(0);
  });
});

describe("retryDelay", () => {
  it("doubles from one second up to the cap", () => {
    expect([0, 1, 2, 3, 4].map(retryDelay)).toEqual([
      1000, 2000, 4000, 8000, 16000,
    ]);
    expect(retryDelay(5)).toBe(RETRY_MAX_MS);
    expect(retryDelay(50)).toBe(RETRY_MAX_MS);
  });
});
