import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";

/** Length of the email OTP (`otp_length` in supabase/config.toml). */
export const OTP_LENGTH = 6;

/** Lifetime of an email code or link (`otp_expiry` in supabase/config.toml). */
export const OTP_EXPIRY_MS = 60 * 60 * 1000;

/** Minimum gap between two emails (`max_frequency` in supabase/config.toml). */
export const RESEND_COOLDOWN_MS = 60 * 1000;

/** Route that handles the link in the auth emails. */
export const AUTH_CALLBACK_PATH = "/auth/callback";

/**
 * Query parameter the callback route adds to its redirect so the app can tell
 * the user how the link went.
 */
export const ACCOUNT_NOTICE_PARAM = "account";

export const ACCOUNT_NOTICES = [
  "confirmed",
  "link_expired",
  "link_invalid",
  "other_browser",
] as const;

export type AccountNotice = (typeof ACCOUNT_NOTICES)[number];

const SAFE_PATH_BASE = "http://next.invalid";

/**
 * Returns `value` when it is a path on this origin, `/` otherwise. Used for
 * the `next` parameter of the auth callback, so a crafted link cannot send
 * the user to another site (open redirect) or back into the callback.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || /^\/[/\\]/.test(value)) return "/";
  let url: URL;
  try {
    url = new URL(value, SAFE_PATH_BASE);
  } catch {
    return "/";
  }
  // The URL parser drops tabs and newlines and turns backslashes into slashes,
  // so re-check the origin after parsing instead of trusting the raw string.
  if (url.origin !== SAFE_PATH_BASE) return "/";
  // Never back into the auth routes (the callback would run again).
  if (url.pathname.startsWith("/auth/")) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}

function isAccountNotice(value: string | null): value is AccountNotice {
  return ACCOUNT_NOTICES.includes(value as AccountNotice);
}

/**
 * Reads the notice the callback left in `href` and returns it with the URL
 * to show instead (the same URL without the notice and without the error
 * fragment Supabase Auth may append to a failed link).
 */
export function takeAccountNotice(href: string): {
  notice: AccountNotice | null;
  cleanHref: string;
} {
  const url = new URL(href);
  const raw = url.searchParams.get(ACCOUNT_NOTICE_PARAM);
  const hash = new URLSearchParams(url.hash.slice(1));
  const hashError = hash.get("error_code") ?? hash.get("error");

  let notice: AccountNotice | null = isAccountNotice(raw) ? raw : null;
  if (hashError) {
    notice = hash.get("error_code") === "otp_expired" ? "link_expired" : notice;
    notice ??= "link_invalid";
    url.hash = "";
  }
  url.searchParams.delete(ACCOUNT_NOTICE_PARAM);
  return { notice, cleanHref: url.toString() };
}

/** Maps a failed link verification to the notice the user sees. */
export function noticeForLinkError(error: unknown): AccountNotice {
  if (
    isAuthError(error) &&
    (error.code === "otp_expired" || error.code === "flow_state_expired")
  ) {
    return "link_expired";
  }
  return "link_invalid";
}

export type AuthErrorKind =
  | "network"
  | "rate_limited"
  | "invalid_email"
  | "email_exists"
  | "wrong_code"
  | "expired_code"
  | "unknown";

/**
 * Classifies an error from the email and code steps. Supabase Auth answers
 * `otp_expired` for both a wrong and an expired code, so `sentAt` (when the
 * code was sent) decides between the two.
 */
export function classifyAuthError(
  error: unknown,
  { sentAt, now = Date.now() }: { sentAt?: number | null; now?: number } = {},
): AuthErrorKind {
  if (isAuthRetryableFetchError(error) || error instanceof TypeError) {
    return "network";
  }
  if (!isAuthError(error)) return "unknown";
  if (
    error.status === 429 ||
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_request_rate_limit"
  ) {
    return "rate_limited";
  }
  switch (error.code) {
    case "email_exists":
    case "user_already_exists":
      return "email_exists";
    case "validation_failed":
    case "email_address_invalid":
      return "invalid_email";
    case "otp_expired":
      return sentAt != null && now - sentAt >= OTP_EXPIRY_MS
        ? "expired_code"
        : "wrong_code";
    default:
      return "unknown";
  }
}

/** Keeps only digits, up to the OTP length (pasted codes may have spaces). */
export function normalizeOtp(input: string): string {
  return input.replace(/\D/g, "").slice(0, OTP_LENGTH);
}

/** Seconds left before another email can be requested, rounded up. */
export function resendSecondsLeft(
  sentAt: number | null | undefined,
  now: number,
): number {
  if (sentAt == null) return 0;
  return Math.max(0, Math.ceil((sentAt + RESEND_COOLDOWN_MS - now) / 1000));
}

const RETRY_BASE_MS = 1000;
export const RETRY_MAX_MS = 30 * 1000;

/** Backoff for reconnecting: 1 s, 2 s, 4 s… up to 30 s. */
export function retryDelay(attempt: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempt));
}
