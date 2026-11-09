"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  canInstall,
  isIosSafari,
  isStandalone,
  readInstallMemory,
  recordDismissal,
  recordTripFinished,
  recordTripUndone,
  shouldShowInstallNotice,
  type InstallMode,
} from "@/lib/install";

/**
 * Instalar la app (docs/improvements.md, F-8). El navegador entrega
 * `beforeinstallprompt` una sola vez y puede hacerlo antes de que React
 * monte nada, así que esto vive afuera de React: se escucha desde que el
 * módulo se carga y la interfaz lo lee con useSyncExternalStore.
 */

/** Lo que Chrome entrega: no está en lib.dom. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Volver a la app después de tanto cuenta como otra visita. */
const NEW_VISIT_AFTER_MS = 30 * 60 * 1000;

export type InstallState = {
  mode: InstallMode | null;
  installed: boolean;
  /**
   * El aviso corresponde ahora (compras en visitas anteriores, descartes y
   * pausa). Falta que nada más ocupe el lugar: lo ve quien lo muestra. Se
   * calcula con el reloj acá, nunca en un render.
   */
  due: boolean;
};

const OFF: InstallState = { mode: null, installed: false, due: false };

let deferred: InstallPromptEvent | null = null;
let appInstalled = false;
// Compras terminadas antes de esta visita: las de ahora no cuentan.
let tripsBeforeVisit = 0;
let hiddenAt: number | null = null;
// El diálogo del navegador está abierto: un segundo toque no pide otro.
let prompting = false;
let state: InstallState = OFF;
const listeners = new Set<() => void>();

function compute(): InstallState {
  const installed =
    appInstalled ||
    isStandalone({
      matchMedia: window.matchMedia?.bind(window),
      navigator: navigator as Navigator & { standalone?: boolean },
    });
  const mode: InstallMode | null = deferred
    ? "prompt"
    : isIosSafari(navigator.userAgent, navigator.maxTouchPoints)
      ? "ios"
      : null;
  const due = shouldShowInstallNotice({
    mode,
    installed,
    memory: readInstallMemory(),
    tripsBeforeVisit,
    blocked: false,
    now: Date.now(),
  });
  return { mode, installed, due };
}

function refresh() {
  const next = compute();
  if (
    next.mode === state.mode &&
    next.installed === state.installed &&
    next.due === state.due
  ) {
    return;
  }
  state = next;
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  tripsBeforeVisit = readInstallMemory().trips;
  window.addEventListener("beforeinstallprompt", (event) => {
    // Sin esto Chrome muestra su propia barrita; el pedido sale de nuestros
    // botones, cuando la persona lo decide.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    refresh();
  });
  window.addEventListener("appinstalled", () => {
    appInstalled = true;
    deferred = null;
    refresh();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt !== null && Date.now() - hiddenAt >= NEW_VISIT_AFTER_MS) {
      tripsBeforeVisit = readInstallMemory().trips;
    }
    hiddenAt = null;
    refresh();
  });
  // Se instaló y se abrió desde el inicio en esta misma pestaña, o al revés.
  window
    .matchMedia?.("(display-mode: standalone)")
    ?.addEventListener?.("change", refresh);
  state = compute();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Una compra terminada en este dispositivo: cuenta desde la próxima visita. */
export function noteTripFinished() {
  recordTripFinished();
}

/** Esa compra se deshizo o el servidor la rechazó: no cuenta. */
export function noteTripUndone() {
  recordTripUndone();
}

/**
 * Importar este módulo ya escucha el evento. Este componente existe para
 * que lo importe el layout de la app: en cualquier ruta (la invitación,
 * por ejemplo) el navegador lo entrega, y nadie lo atiende si el módulo
 * todavía no cargó.
 */
export function InstallCapture() {
  return null;
}

export type Install = {
  mode: InstallMode | null;
  installed: boolean;
  /** Se puede instalar desde acá y todavía no está instalada. */
  available: boolean;
  /** El aviso corresponde ahora, si nada más ocupa el lugar. */
  due: boolean;
  /**
   * Pide la instalación al navegador (modo "prompt"). Si la persona dice que
   * no cuenta como un "Ahora no". Devuelve si aceptó.
   */
  install: () => Promise<boolean>;
  /** "Ahora no": no vuelve a preguntar por un tiempo. */
  dismiss: () => void;
};

export function useInstall(): Install {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => OFF,
  );

  const dismiss = useCallback(() => {
    // Mientras el aviso se va todavía recibe teclas: dos "Ahora no" seguidos
    // no cuentan por dos.
    if (!state.due) return;
    recordDismissal(Date.now());
    refresh();
  }, []);

  const install = useCallback(async () => {
    const event = deferred;
    if (!event || prompting) return false;
    prompting = true;
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === "dismissed") recordDismissal(Date.now());
      return outcome === "accepted";
    } catch {
      return false;
    } finally {
      // Un evento sirve una vez: Chrome entrega otro más adelante, si hace
      // falta (en la próxima carga, por lo común). Hasta ahora el aviso y la
      // entrada siguen en pantalla: el foco no se pierde bajo el diálogo.
      prompting = false;
      deferred = null;
      refresh();
    }
  }, []);

  return {
    mode: current.mode,
    installed: current.installed,
    available: canInstall(current),
    due: current.due,
    install,
    dismiss,
  };
}
