import type { Viewport } from "next";
import { SessionProvider } from "@/components/session-provider";
import {
  WELCOME_PENDING_PROPERTY,
  WELCOME_SEEN_KEY,
} from "@/components/welcome/welcome-flag";
import { QueryProvider } from "@/lib/queries";

export const viewport: Viewport = {
  // Dibuja bajo el notch y el indicador de inicio; los insets se compensan
  // con las utilidades pt-safe, pb-safe y px-safe de globals.css.
  viewportFit: "cover",
  // En Android, el teclado achica el viewport y la barra inferior queda
  // encima de él. iOS lo maneja AddItemBar con visualViewport.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ec" },
    { media: "(prefers-color-scheme: dark)", color: "#121814" },
  ],
};

// Static on purpose: the session is read in the browser by SessionProvider
// (a Client Component), never with cookies() here, so the shell prerenders.
// Runs before hydration: on a first visit it sets a CSS variable on <html>
// so the list stays hidden (globals.css) until the welcome screen takes
// over, without a flash of the list underneath. It is an inline style, not
// an attribute React renders, so hydration has nothing to compare. Welcome
// clears it when it finishes.
const WELCOME_FLAG_SCRIPT = `try{if(!localStorage.getItem("${WELCOME_SEEN_KEY}"))document.documentElement.style.setProperty("${WELCOME_PENDING_PROPERTY}","hidden")}catch(e){}`;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SessionProvider>
      <QueryProvider>
        <script dangerouslySetInnerHTML={{ __html: WELCOME_FLAG_SCRIPT }} />
        <div className="flex flex-1 flex-col">{children}</div>
      </QueryProvider>
    </SessionProvider>
  );
}
