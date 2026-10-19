"use client";

import { WifiOff } from "lucide-react";
import { useState } from "react";
import { Collapse } from "@/components/motion";
import { retrySession, useSession } from "@/components/session-provider";
import { Banner } from "@/components/ui/banner";
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

  function handleRetry() {
    setRetrying(true);
    retrySession();
    setTimeout(() => setRetrying(false), RETRY_FEEDBACK_MS);
  }

  return (
    <Collapse show={status === "offline"}>
      <div className="px-safe mx-auto w-full max-w-xl pb-3">
        <Banner
          tone="info"
          icon={WifiOff}
          title={texts.connection.title}
          body={texts.connection.body}
          data-testid="connection-banner"
          action={
            <Button
              type="button"
              variant="outline"
              size="touch"
              onClick={handleRetry}
              disabled={retrying}
            >
              {retrying ? texts.connection.retrying : texts.connection.retry}
            </Button>
          }
        />
      </div>
    </Collapse>
  );
}
