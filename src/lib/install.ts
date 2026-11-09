/**
 * Cuándo invitar a instalar la app (docs/improvements.md, F-8). Todo acá es
 * puro o toca solo localStorage con try/catch: la captura de
 * `beforeinstallprompt` y la interfaz viven en `src/components/install/`.
 *
 * Decisión de cuándo: el aviso sale en la visita siguiente a una compra
 * terminada en este dispositivo. Quien ya vació el carro una vez usa la app
 * para lo que sirve y le conviene tenerla en el inicio; en la primera visita
 * no sabe todavía si le sirve, y en la misma visita de la compra compite con
 * el momento "Buena compra", que es el cierre de lo que acaba de hacer.
 */

/** Cuántas compras terminadas hacen falta (en visitas anteriores). */
export const INSTALL_MIN_TRIPS = 1;

/** Lo que dura un "Ahora no" antes de volver a preguntar. */
export const INSTALL_PAUSE_MS = 14 * 24 * 60 * 60 * 1000;

/** Después de tantos "Ahora no" no vuelve a aparecer solo. */
export const INSTALL_MAX_DISMISSALS = 2;

/** Dónde guarda este dispositivo las compras terminadas y los descartes. */
export const INSTALL_KEY = "lista:install";

/**
 * Cómo se instala acá: "prompt" cuando el navegador entregó
 * `beforeinstallprompt` (Android/Chrome y los que lo imitan), "ios" en Safari
 * de iPhone y iPad, que no tiene API y se instala desde Compartir. null en el
 * resto: no hay forma de instalar o no sabemos cuál.
 */
export type InstallMode = "prompt" | "ios";

export type InstallMemory = {
  /** Compras terminadas en este dispositivo. */
  trips: number;
  /** Veces que se tocó "Ahora no". */
  dismissals: number;
  /** Cuándo fue la última, en ms. */
  dismissedAt: number;
};

export const EMPTY_MEMORY: InstallMemory = {
  trips: 0,
  dismissals: 0,
  dismissedAt: 0,
};

/** Navegadores de iOS que no son Safari y apps con su propio navegador. */
const NOT_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|FBAN|FBAV|Instagram/;

/**
 * Safari de iPhone o iPad. El iPad con iPadOS 13+ se presenta como Mac: se
 * lo reconoce por la pantalla táctil. Los otros navegadores de iOS y las
 * vistas web de otras apps quedan afuera: ahí "Compartir → Agregar a inicio"
 * puede no estar donde decimos.
 */
export function isIosSafari(
  userAgent: string,
  maxTouchPoints: number,
): boolean {
  const iPhoneOrIPad =
    /iPhone|iPad|iPod/.test(userAgent) ||
    (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  return (
    iPhoneOrIPad && /Safari\//.test(userAgent) && !NOT_SAFARI.test(userAgent)
  );
}

type InstalledEnv = {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: { standalone?: boolean };
};

/** Abierta como app: ventana propia en Android, "standalone" en iOS. */
export function isStandalone(env: InstalledEnv): boolean {
  if (env.navigator?.standalone === true) return true;
  const match = env.matchMedia;
  if (!match) return false;
  return ["standalone", "fullscreen", "minimal-ui"].some(
    (mode) => match(`(display-mode: ${mode})`).matches,
  );
}

export type InstallContext = {
  mode: InstallMode | null;
  installed: boolean;
  memory: InstallMemory;
  /** Compras terminadas antes de esta visita (las de ahora no cuentan). */
  tripsBeforeVisit: number;
  /** Modo compra, o cualquier otra cosa que ocupe el lugar. */
  blocked: boolean;
  now: number;
};

/** Se puede instalar desde acá y todavía no está instalada. */
export function canInstall(
  context: Pick<InstallContext, "mode" | "installed">,
) {
  return context.mode !== null && !context.installed;
}

/**
 * Si el aviso se muestra solo. La entrada del menú no pasa por acá: está
 * siempre mientras se pueda instalar (`canInstall`).
 */
export function shouldShowInstallNotice(context: InstallContext): boolean {
  if (!canInstall(context) || context.blocked) return false;
  const { dismissals, dismissedAt } = context.memory;
  if (context.tripsBeforeVisit < INSTALL_MIN_TRIPS) return false;
  if (dismissals >= INSTALL_MAX_DISMISSALS) return false;
  // Un reloj que retrocedió: se espera como si el descarte fuera de ahora.
  const elapsed = context.now - dismissedAt;
  if (dismissals > 0 && (elapsed < 0 || elapsed < INSTALL_PAUSE_MS)) {
    return false;
  }
  return true;
}

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

export function readInstallMemory(): InstallMemory {
  try {
    const raw = window.localStorage.getItem(INSTALL_KEY);
    if (!raw) return EMPTY_MEMORY;
    const value = JSON.parse(raw) as Partial<InstallMemory> | null;
    return {
      trips: count(value?.trips),
      dismissals: count(value?.dismissals),
      dismissedAt: count(value?.dismissedAt),
    };
  } catch {
    return EMPTY_MEMORY;
  }
}

function writeInstallMemory(memory: InstallMemory) {
  try {
    window.localStorage.setItem(INSTALL_KEY, JSON.stringify(memory));
  } catch {
    // Sin almacenamiento no se recuerda nada: el aviso no vuelve a salir
    // solo (no hay compras que contar), y el menú sigue ahí.
  }
}

/** Una compra terminada en este dispositivo. */
export function recordTripFinished() {
  const memory = readInstallMemory();
  writeInstallMemory({ ...memory, trips: memory.trips + 1 });
}

/** Esa compra se deshizo (A-4) o no llegó a pasar: no cuenta. */
export function recordTripUndone() {
  const memory = readInstallMemory();
  writeInstallMemory({ ...memory, trips: Math.max(0, memory.trips - 1) });
}

/** "Ahora no": cuenta un descarte y empieza la pausa. */
export function recordDismissal(now: number): InstallMemory {
  const memory = readInstallMemory();
  const next = {
    ...memory,
    dismissals: memory.dismissals + 1,
    dismissedAt: now,
  };
  writeInstallMemory(next);
  return next;
}
