import type { Metadata } from "next";
import { texts } from "@/lib/texts";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = {
  title: texts.offline.title,
  robots: { index: false },
};

export default function OfflinePage() {
  return (
    <main className="px-safe flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
      <p className="text-title text-ink-2 font-serif">{texts.app.name}</p>
      <h1 className="text-display font-serif text-balance">
        {texts.offline.title}
      </h1>
      <p className="text-ink-2 max-w-sm text-pretty">{texts.offline.body}</p>
      <RetryButton />
    </main>
  );
}
