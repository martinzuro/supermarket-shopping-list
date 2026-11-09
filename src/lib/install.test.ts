import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_MEMORY,
  INSTALL_KEY,
  INSTALL_MAX_DISMISSALS,
  INSTALL_PAUSE_MS,
  canInstall,
  isIosSafari,
  isStandalone,
  readInstallMemory,
  recordDismissal,
  recordTripFinished,
  recordTripUndone,
  shouldShowInstallNotice,
  type InstallContext,
} from "./install";

const NOW = 1_800_000_000_000;

function context(overrides: Partial<InstallContext> = {}): InstallContext {
  return {
    mode: "prompt",
    installed: false,
    memory: EMPTY_MEMORY,
    tripsBeforeVisit: 1,
    blocked: false,
    now: NOW,
    ...overrides,
  };
}

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const MAC_SAFARI = IPAD_AS_MAC;
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

describe("isIosSafari", () => {
  it("reconoce Safari de iPhone", () => {
    expect(isIosSafari(IPHONE_SAFARI, 5)).toBe(true);
  });

  it("reconoce el iPad que se presenta como Mac, no una Mac", () => {
    expect(isIosSafari(IPAD_AS_MAC, 5)).toBe(true);
    expect(isIosSafari(MAC_SAFARI, 0)).toBe(false);
  });

  it("deja afuera los otros navegadores de iOS y las vistas web", () => {
    expect(isIosSafari(IPHONE_CHROME, 5)).toBe(false);
    expect(isIosSafari(`${IPHONE_SAFARI} Instagram 330.0`, 5)).toBe(false);
  });

  it("deja afuera Android", () => {
    expect(isIosSafari(ANDROID_CHROME, 5)).toBe(false);
  });
});

describe("isStandalone", () => {
  const matching = (mode: string) => (query: string) => ({
    matches: query === `(display-mode: ${mode})`,
  });

  it("detecta la ventana propia por display-mode", () => {
    expect(isStandalone({ matchMedia: matching("standalone") })).toBe(true);
    expect(isStandalone({ matchMedia: matching("minimal-ui") })).toBe(true);
  });

  it("detecta navigator.standalone de iOS", () => {
    expect(isStandalone({ navigator: { standalone: true } })).toBe(true);
  });

  it("en una pestaña normal no", () => {
    expect(
      isStandalone({
        matchMedia: matching("browser"),
        navigator: { standalone: false },
      }),
    ).toBe(false);
    expect(isStandalone({})).toBe(false);
  });
});

describe("canInstall", () => {
  it("hace falta un modo y que no esté instalada", () => {
    expect(canInstall({ mode: "ios", installed: false })).toBe(true);
    expect(canInstall({ mode: "prompt", installed: false })).toBe(true);
    expect(canInstall({ mode: null, installed: false })).toBe(false);
    expect(canInstall({ mode: "prompt", installed: true })).toBe(false);
  });
});

describe("shouldShowInstallNotice", () => {
  it("sale después de una compra terminada, en las dos plataformas", () => {
    expect(shouldShowInstallNotice(context())).toBe(true);
    expect(shouldShowInstallNotice(context({ mode: "ios" }))).toBe(true);
  });

  it("nunca en el primer uso: sin compras en visitas anteriores", () => {
    expect(shouldShowInstallNotice(context({ tripsBeforeVisit: 0 }))).toBe(
      false,
    );
  });

  it("no si ya está instalada", () => {
    expect(shouldShowInstallNotice(context({ installed: true }))).toBe(false);
  });

  it("no donde no aplica", () => {
    expect(shouldShowInstallNotice(context({ mode: null }))).toBe(false);
  });

  it("no en modo compra ni encima de otro aviso", () => {
    expect(shouldShowInstallNotice(context({ blocked: true }))).toBe(false);
  });

  it("después de un descarte espera la pausa y vuelve", () => {
    const memory = { trips: 1, dismissals: 1, dismissedAt: NOW - 1000 };
    expect(shouldShowInstallNotice(context({ memory }))).toBe(false);
    expect(
      shouldShowInstallNotice(
        context({ memory, now: NOW - 1000 + INSTALL_PAUSE_MS - 1 }),
      ),
    ).toBe(false);
    expect(
      shouldShowInstallNotice(
        context({ memory, now: NOW - 1000 + INSTALL_PAUSE_MS }),
      ),
    ).toBe(true);
  });

  it("con el reloj atrasado respeta la pausa", () => {
    const memory = { trips: 1, dismissals: 1, dismissedAt: NOW + 5000 };
    expect(shouldShowInstallNotice(context({ memory }))).toBe(false);
  });

  it("después de dos descartes no vuelve solo, pase lo que pase", () => {
    const memory = {
      trips: 3,
      dismissals: INSTALL_MAX_DISMISSALS,
      dismissedAt: NOW - 10 * INSTALL_PAUSE_MS,
    };
    expect(shouldShowInstallNotice(context({ memory }))).toBe(false);
  });
});

describe("memoria del dispositivo", () => {
  beforeEach(() => window.localStorage.clear());

  it("empieza vacía", () => {
    expect(readInstallMemory()).toEqual(EMPTY_MEMORY);
  });

  it("cuenta las compras terminadas", () => {
    recordTripFinished();
    recordTripFinished();
    expect(readInstallMemory().trips).toBe(2);
  });

  it("una compra deshecha no cuenta, y nunca baja de cero", () => {
    recordTripFinished();
    recordTripFinished();
    recordTripUndone();
    expect(readInstallMemory().trips).toBe(1);
    recordTripUndone();
    recordTripUndone();
    expect(readInstallMemory().trips).toBe(0);
  });

  it("cuenta los descartes y cuándo fue el último, sin perder las compras", () => {
    recordTripFinished();
    recordDismissal(NOW);
    const memory = recordDismissal(NOW + 5);
    expect(memory).toEqual({ trips: 1, dismissals: 2, dismissedAt: NOW + 5 });
    expect(readInstallMemory()).toEqual(memory);
  });

  it("ignora lo que no es suyo", () => {
    window.localStorage.setItem(INSTALL_KEY, "no es json");
    expect(readInstallMemory()).toEqual(EMPTY_MEMORY);
    window.localStorage.setItem(
      INSTALL_KEY,
      JSON.stringify({ trips: "x", dismissals: -1, dismissedAt: null }),
    );
    expect(readInstallMemory()).toEqual(EMPTY_MEMORY);
  });

  it("sin almacenamiento no falla", () => {
    const original = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
    try {
      expect(readInstallMemory()).toEqual(EMPTY_MEMORY);
      expect(() => recordTripFinished()).not.toThrow();
      expect(() => recordDismissal(NOW)).not.toThrow();
    } finally {
      Storage.prototype.getItem = original;
      Storage.prototype.setItem = originalSet;
    }
  });
});
