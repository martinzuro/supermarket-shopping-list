"use client";

import { useState } from "react";
import { type PendingSignIn } from "@/components/menu/account-section";
import { AppMenu } from "@/components/menu/app-menu";
import { ShareSheet } from "@/components/share/share-sheet";

/**
 * The two actions of the list header: share and menu. They sit side by side
 * because both can start the conversion of an anonymous user (email, then
 * code), and a sign-in code sent from one must be waiting in the other.
 */
export function HeaderActions() {
  const [pendingSignIn, setPendingSignIn] = useState<PendingSignIn | null>(
    null,
  );
  return (
    <div className="flex items-center">
      <ShareSheet
        pendingSignIn={pendingSignIn}
        onPendingSignInChange={setPendingSignIn}
      />
      <AppMenu
        pendingSignIn={pendingSignIn}
        onPendingSignInChange={setPendingSignIn}
      />
    </div>
  );
}
