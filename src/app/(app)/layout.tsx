import type { Viewport } from "next";
import { SessionProvider } from "@/components/session-provider";

export const viewport: Viewport = {
  // Dibuja bajo el notch y el indicador de inicio; los insets se compensan
  // con las utilidades pt-safe, pb-safe y px-safe de globals.css.
  viewportFit: "cover",
  // En Android, el teclado achica el viewport y la barra inferior queda
  // encima de él. iOS lo maneja AddItemBar con visualViewport.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1318" },
  ],
};

// Static on purpose: the session is read in the browser by SessionProvider
// (a Client Component), never with cookies() here, so the shell prerenders.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SessionProvider>
      <div className="flex flex-1 flex-col">{children}</div>
    </SessionProvider>
  );
}
