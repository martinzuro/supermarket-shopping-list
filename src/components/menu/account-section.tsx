"use client";

import type { User } from "@supabase/supabase-js";
import { CircleAlert, CircleCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "@/components/session-provider";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  AUTH_CALLBACK_PATH,
  classifyAuthError,
  normalizeOtp,
  OTP_EXPIRY_MS,
  OTP_LENGTH,
  resendSecondsLeft,
  type AccountNotice,
  type AuthErrorKind,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { texts } from "@/lib/texts";

export type MenuNotice = AccountNotice | "signed_in" | "signed_out";

/**
 * Sign-in code sent to an email that already has an account. Unlike an email
 * change (which Supabase keeps on the user as `new_email`), nothing on the
 * anonymous user records it, so the menu keeps it in state.
 */
export type PendingSignIn = { email: string; sentAt: number; userId: string };

type AccountSectionProps = {
  notice: MenuNotice | null;
  onNotice: (notice: MenuNotice | null) => void;
  pendingSignIn: PendingSignIn | null;
  onPendingSignInChange: (pending: PendingSignIn | null) => void;
};

const noticeTexts: Record<MenuNotice, string> = {
  confirmed: texts.account.notices.confirmed,
  signed_in: texts.account.notices.signedIn,
  signed_out: texts.account.notices.signedOut,
  link_expired: texts.account.notices.linkExpired,
  link_invalid: texts.account.notices.linkInvalid,
  other_browser: texts.account.notices.otherBrowser,
};

const SUCCESS_NOTICES = new Set<MenuNotice>([
  "confirmed",
  "signed_in",
  "signed_out",
]);
const LINK_FAILURES = new Set<MenuNotice>(["link_expired", "link_invalid"]);

const errorTexts: Record<AuthErrorKind, string> = {
  network: texts.account.errors.network,
  rate_limited: texts.account.errors.rateLimited,
  invalid_email: texts.account.errors.invalidEmail,
  // Handled by switching to a sign-in code; only shown if that also fails.
  email_exists: texts.account.errors.unknown,
  wrong_code: texts.account.errors.wrongCode,
  expired_code: texts.account.errors.expiredCode,
  unknown: texts.account.errors.unknown,
};

function emailRedirectTo() {
  return `${window.location.origin}${AUTH_CALLBACK_PATH}`;
}

export function AccountSection({
  notice,
  onNotice,
  pendingSignIn,
  onPendingSignInChange,
}: AccountSectionProps) {
  const { status, user } = useSession();

  return (
    <section
      aria-labelledby="account-heading"
      className="flex flex-col gap-4 pb-6"
      data-testid="account-section"
    >
      <h2 id="account-heading" className="text-heading">
        {texts.account.title}
      </h2>

      {notice ? (
        <Message
          tone={SUCCESS_NOTICES.has(notice) ? "success" : "error"}
          text={
            LINK_FAILURES.has(notice) && user?.is_anonymous
              ? `${noticeTexts[notice]} ${texts.account.notices.requestNewCode}`
              : noticeTexts[notice]
          }
        />
      ) : null}

      {!user ? (
        <p className="text-ink-2 text-pretty">
          {status === "offline" ? texts.account.offline : texts.account.loading}
        </p>
      ) : user.is_anonymous ? (
        <GuestAccount
          // A new anonymous user (after signing out) starts from scratch.
          key={user.id}
          user={user}
          onNotice={onNotice}
          pendingSignIn={
            pendingSignIn?.userId === user.id ? pendingSignIn : null
          }
          onPendingSignInChange={onPendingSignInChange}
        />
      ) : (
        <SignedInAccount key={user.id} user={user} onNotice={onNotice} />
      )}
    </section>
  );
}

type Pending = {
  email: string;
  mode: "convert" | "signin";
  /** When the last email was sent; `null` if unknown. */
  sentAt: number | null;
};

function pendingFromUser(user: User): Pending | null {
  if (!user.new_email) return null;
  const sentAt = user.email_change_sent_at
    ? Date.parse(user.email_change_sent_at)
    : NaN;
  return {
    email: user.new_email,
    mode: "convert",
    sentAt: Number.isNaN(sentAt) ? null : sentAt,
  };
}

type GuestAccountProps = {
  user: User;
  onNotice: (notice: MenuNotice | null) => void;
  pendingSignIn: PendingSignIn | null;
  onPendingSignInChange: (pending: PendingSignIn | null) => void;
};

function GuestAccount({
  user,
  onNotice,
  pendingSignIn,
  onPendingSignInChange,
}: GuestAccountProps) {
  const pending: Pending | null = pendingSignIn
    ? { ...pendingSignIn, mode: "signin" }
    : pendingFromUser(user);

  const [editingEmail, setEditingEmail] = useState(false);
  const [email, setEmail] = useState(pending?.email ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState<AuthErrorKind | null>(null);
  const [resent, setResent] = useState(false);
  const now = useNow(pending !== null && !editingEmail);

  async function sendEmail(address: string, { resend = false } = {}) {
    setBusy("send");
    setError(null);
    setResent(false);
    onNotice(null);
    const supabase = createClient();
    const redirectTo = emailRedirectTo();

    const { error: updateError } = await supabase.auth.updateUser(
      { email: address },
      { emailRedirectTo: redirectTo },
    );
    let failure: AuthErrorKind | null = null;
    if (!updateError) {
      // The user now carries `new_email`: the code step comes from it.
      onPendingSignInChange(null);
    } else if (classifyAuthError(updateError) === "email_exists") {
      // The email already belongs to an account: sign in to it instead.
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: address,
        options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
      });
      if (otpError) {
        failure = classifyAuthError(otpError);
      } else {
        onPendingSignInChange({
          email: address,
          sentAt: Date.now(),
          userId: user.id,
        });
      }
    } else {
      failure = classifyAuthError(updateError);
    }

    setBusy(null);
    if (failure) {
      setError(failure);
      // Asked again too soon for the address already waiting: the code
      // from the previous email still works, so go back to it.
      if (failure === "rate_limited" && address === pending?.email) {
        setEditingEmail(false);
      }
      return;
    }
    setEditingEmail(false);
    setCode("");
    setResent(resend);
  }

  async function verifyCode(current: Pending) {
    setBusy("verify");
    setError(null);
    setResent(false);
    const { error: verifyError } = await createClient().auth.verifyOtp({
      email: current.email,
      token: code,
      type: current.mode === "signin" ? "email" : "email_change",
    });
    if (!verifyError) {
      // The session provider picks up the new session and this component
      // gives way to the signed-in view.
      onPendingSignInChange(null);
      onNotice(current.mode === "signin" ? "signed_in" : "confirmed");
      return;
    }
    setBusy(null);
    setError(classifyAuthError(verifyError, { sentAt: current.sentAt }));
  }

  function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    if (!address || busy) return;
    void sendEmail(address);
  }

  function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending || code.length !== OTP_LENGTH || busy) return;
    void verifyCode(pending);
  }

  if (!pending || editingEmail) {
    return (
      <form
        onSubmit={handleEmailSubmit}
        className="flex flex-col gap-4"
        noValidate
      >
        <p className="text-ink-2 text-pretty">
          {texts.account.anonymous.intro}
        </p>
        <Field
          label={texts.account.anonymous.emailLabel}
          error={error ? errorTexts[error] : undefined}
        >
          <Input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={texts.account.anonymous.emailPlaceholder}
          />
        </Field>
        <Button type="submit" disabled={busy !== null || email.trim() === ""}>
          {busy === "send"
            ? texts.account.anonymous.submitting
            : texts.account.anonymous.submit}
        </Button>
      </form>
    );
  }

  const secondsLeft =
    now === null ? null : resendSecondsLeft(pending.sentAt, now);
  const expired =
    now !== null &&
    pending.sentAt !== null &&
    now - pending.sentAt >= OTP_EXPIRY_MS;
  const shownError: AuthErrorKind | null =
    error ?? (expired ? "expired_code" : null);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-pretty">
        {texts.account.code.sentTo}{" "}
        <span className="font-medium break-all">{pending.email}</span>
      </p>
      <p className="text-ink-2 text-pretty">
        {texts.account.code.instructions}
      </p>
      {pending.mode === "signin" ? (
        <p className="text-ink-2 text-pretty">
          {texts.account.code.existingAccount}
        </p>
      ) : null}

      <form onSubmit={handleCodeSubmit} className="flex flex-col gap-4">
        <Field
          label={texts.account.code.label}
          error={shownError ? errorTexts[shownError] : undefined}
        >
          <Input
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            value={code}
            onChange={(event) => setCode(normalizeOtp(event.target.value))}
            className="text-heading text-center font-mono tracking-[0.4em]"
          />
        </Field>
        <Button
          type="submit"
          disabled={busy !== null || code.length !== OTP_LENGTH}
        >
          {busy === "verify"
            ? texts.account.code.submitting
            : texts.account.code.submit}
        </Button>
      </form>

      {!shownError && resent ? (
        <Message tone="success" text={texts.account.code.resent} />
      ) : null}

      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="ghost"
          disabled={busy !== null || secondsLeft === null || secondsLeft > 0}
          onClick={() => void sendEmail(pending.email, { resend: true })}
        >
          {secondsLeft
            ? texts.account.code.resendIn(secondsLeft)
            : texts.account.code.resend}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy !== null}
          onClick={() => {
            setEditingEmail(true);
            setError(null);
            setResent(false);
          }}
        >
          {texts.account.code.changeEmail}
        </Button>
      </div>
    </div>
  );
}

function SignedInAccount({
  user,
  onNotice,
}: {
  user: User;
  onNotice: (notice: MenuNotice | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorKind | null>(null);

  async function handleSignOut() {
    setBusy(true);
    setError(null);
    onNotice(null);
    const supabase = createClient();
    // Only this device: other devices of the same account stay signed in.
    const { error: signOutError } = await supabase.auth.signOut({
      scope: "local",
    });
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      // The session provider creates a new anonymous user right away.
      onNotice("signed_out");
      return;
    }
    setBusy(false);
    setError(classifyAuthError(signOutError));
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-pretty">
        {texts.account.signedIn.label}{" "}
        {/* En su propia línea: un correo largo se parte solo si no entra. */}
        <span className="block font-medium break-words">{user.email}</span>
      </p>
      <p className="text-ink-2 text-pretty">
        {texts.account.signedIn.description}
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => void handleSignOut()}
      >
        {busy
          ? texts.account.signedIn.signingOut
          : texts.account.signedIn.signOut}
      </Button>
      <p className="text-ink-2 text-label text-pretty">
        {texts.account.signedIn.signOutHint}
      </p>
      {error ? <Message tone="error" text={errorTexts[error]} /> : null}
    </div>
  );
}

function Message({ tone, text }: { tone: "success" | "error"; text: string }) {
  return (
    <Banner
      tone={tone === "success" ? "info" : "error"}
      icon={tone === "success" ? CircleCheck : CircleAlert}
      title={text}
    />
  );
}

/**
 * Current time, ticking every second while `active` (the resend countdown
 * and the expiry hint). `null` until the first tick.
 */
function useNow(active: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [active]);
  return now;
}
