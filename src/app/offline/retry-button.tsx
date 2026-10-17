"use client";

import { Button } from "@/components/ui/button";
import { texts } from "@/lib/texts";

export function RetryButton() {
  return (
    <Button type="button" onClick={() => window.location.reload()}>
      {texts.connection.retry}
    </Button>
  );
}
