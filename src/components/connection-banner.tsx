"use client";

import { WifiOff } from "lucide-react";
import { useState } from "react";
import { retrySession, useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { texts } from "@/lib/texts";

const RETRY_FEEDBACK_MS = 1500;

/**
 * Persistent banner while there is no session or no network. The provider
 * keeps retrying with backoff; the button retries right away.
 */
export function ConnectionBanner() {
  const { status } = useSession();
  const [retrying, setRetrying] = useState(false);

  if (status !== "offline") return null;

  function handleRetry() {
    setRetrying(true);
    retrySession();
    setTimeout(() => setRetrying(false), RETRY_FEEDBACK_MS);
  }

  return (
    <div
      role="status"
      className="bg-muted text-foreground border-t"
      data-testid="connection-banner"
    >
      <div className="px-safe mx-auto flex w-full max-w-xl items-center gap-3 py-2">
        <WifiOff
          aria-hidden
          className="text-muted-foreground size-5 shrink-0"
        />
        <p className="min-w-0 flex-1 text-sm">
          <span className="block font-semibold">{texts.connection.title}</span>
          <span className="text-muted-foreground block">
            {texts.connection.body}
          </span>
        </p>
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={handleRetry}
          disabled={retrying}
          className="-mr-1 shrink-0"
        >
          {retrying ? texts.connection.retrying : texts.connection.retry}
        </Button>
      </div>
    </div>
  );
}
