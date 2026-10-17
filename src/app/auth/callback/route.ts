import {
  isAuthPKCECodeVerifierMissingError,
  type EmailOtpType,
} from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import {
  ACCOUNT_NOTICE_PARAM,
  noticeForLinkError,
  safeNextPath,
  type AccountNotice,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const LINK_TYPES: readonly EmailOtpType[] = [
  "email",
  "magiclink",
  "signup",
  "email_change",
];

function isLinkType(value: string | null): value is EmailOtpType {
  return value !== null && LINK_TYPES.includes(value);
}

/**
 * Verifies the link the user opened and writes the resulting session to the
 * cookies. Two shapes reach this route:
 *
 * - `?code=…` (PKCE): Supabase Auth already verified the email at its
 *   /verify endpoint and redirected here. The code is exchanged with the
 *   verifier the browser client left in a cookie when it asked for the email,
 *   so it only works in that same browser.
 * - `?token_hash=…&type=…`: an email template that links here directly.
 *   Works in any browser.
 *
 * Supabase Auth reports a failed verification with `error_code` in the query
 * (or in the fragment, which the browser keeps across the redirect and the
 * app reads).
 */
async function verifyLink(params: URLSearchParams): Promise<AccountNotice> {
  const errorCode = params.get("error_code");
  if (errorCode) {
    return errorCode === "otp_expired" ? "link_expired" : "link_invalid";
  }

  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  if (tokenHash && isLinkType(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    return error ? noticeForLinkError(error) : "confirmed";
  }

  const code = params.get("code");
  if (!code) return "link_invalid";

  const supabase = await createClient();
  const flowId = params.get("sb_flow_id");
  const { error } = await supabase.auth.exchangeCodeForSession(
    code,
    flowId ? { flowId } : undefined,
  );
  if (!error) return "confirmed";
  // Opened in a browser (or app) other than the one that asked for the email.
  if (isAuthPKCECodeVerifierMissingError(error)) return "other_browser";
  return noticeForLinkError(error);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const notice = await verifyLink(searchParams);

  const target = new URL(safeNextPath(searchParams.get("next")), origin);
  target.searchParams.set(ACCOUNT_NOTICE_PARAM, notice);

  const response = NextResponse.redirect(target, 303);
  // The response may carry session cookies: never cache it.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
