"use client";

import { Suspense, use } from "react";
import { InviteScreen } from "@/components/invite/invite-screen";

function InviteFromParams({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return <InviteScreen token={token} />;
}

/**
 * The link of an invitation. The token is route data that is not known when
 * building, so it is read behind Suspense (Cache Components): the ink
 * surface is the static shell, and the screen takes over once it resolves.
 */
export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <Suspense
      fallback={<main className="surface-inverse flex-1" aria-hidden />}
    >
      <InviteFromParams params={params} />
    </Suspense>
  );
}
