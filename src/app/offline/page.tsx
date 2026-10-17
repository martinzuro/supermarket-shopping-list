import type { Metadata } from "next";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = {
  title: "Sin conexión",
  robots: { index: false },
};

export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Sin conexión</h1>
      <p className="max-w-sm">
        Lista necesita internet para mostrar y guardar tus listas. Revisa tu
        conexión y vuelve a intentarlo.
      </p>
      <RetryButton />
    </main>
  );
}
