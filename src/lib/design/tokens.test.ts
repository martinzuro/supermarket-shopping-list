import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, formatRatio, oklchToRgb, rgbToHex } from "./contrast";
import { motionTokens } from "./motion";
import {
  action,
  categoryColors,
  categoryIds,
  contrastPairs,
  focusInverse,
  palette,
  type Mode,
} from "./tokens";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

/** Bloques de :root del modo claro y del modo oscuro. */
function blocks(): Record<Mode, string> {
  const darkStart = css.indexOf("@media (prefers-color-scheme: dark) {");
  const darkEnd = css.indexOf("}\n}", darkStart) + 3;
  return {
    light: css.slice(0, darkStart),
    dark: css.slice(darkStart, darkEnd),
  };
}

function declared(block: string, name: string): string | null {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(block);
  return match ? match[1].trim() : null;
}

describe("tokens de color", () => {
  const byMode = blocks();

  it.each(Object.keys(palette) as Mode[])(
    "globals.css coincide con tokens.ts en modo %s",
    (mode) => {
      for (const [name, hex] of Object.entries(palette[mode])) {
        expect(declared(byMode[mode], name), `--${name}`).toBe(hex);
      }
    },
  );

  it.each(Object.keys(palette) as Mode[])(
    "los roles con hex fijo coinciden con tokens.ts en modo %s",
    (mode) => {
      expect(declared(byMode[mode], "focus-inverse")).toBe(focusInverse);
      if (mode === "dark") {
        expect(declared(byMode.dark, "action-fg")).toBe(action.dark.fg);
      }
    },
  );

  it.each(Object.keys(palette) as Mode[])(
    "las categorías de globals.css coinciden con tokens.ts en modo %s",
    (mode) => {
      for (const id of categoryIds) {
        const { badge, thread } = categoryColors(id, mode);
        expect(declared(byMode[mode], `cat-${id}`)).toBe(badge);
        expect(declared(byMode[mode], `cat-${id}-thread`)).toBe(thread);
      }
    },
  );

  it.each(Object.keys(palette) as Mode[])(
    "todos los pares de uso cumplen WCAG AA en modo %s",
    (mode) => {
      const failures = contrastPairs(mode)
        .map((pair) => ({ ...pair, ratio: contrastRatio(pair.fg, pair.bg) }))
        .filter((pair) => pair.ratio < pair.min)
        .map(
          (pair) => `${pair.name}: ${formatRatio(pair.ratio)} < ${pair.min}:1`,
        );
      expect(failures).toEqual([]);
    },
  );
});

describe("conversión oklch", () => {
  it("convierte blanco y negro", () => {
    expect(rgbToHex(oklchToRgb("oklch(100% 0 0)"))).toBe("#ffffff");
    expect(rgbToHex(oklchToRgb("oklch(0% 0 0)"))).toBe("#000000");
  });

  it("convierte un gris medio al valor esperado", () => {
    // oklch(50% 0 0) ≈ #636363 según el navegador.
    expect(rgbToHex(oklchToRgb("oklch(50% 0 0)"))).toBe("#636363");
  });
});

describe("tokens de motion", () => {
  const value = (name: string) => {
    const match = new RegExp(`--motion-${name}:\\s*([^;]+);`).exec(css);
    return match ? match[1].trim() : null;
  };
  const bezier = (v: string | null) =>
    v
      ? v
          .replace(/^cubic-bezier\(|\)$/g, "")
          .split(",")
          .map((n) => Number(n.trim()))
      : null;
  const seconds = (v: string | null) =>
    v ? Number(v.replace("ms", "")) / 1000 : null;

  it("las curvas coinciden con globals.css", () => {
    expect(bezier(value("ease-out"))).toEqual([...motionTokens.ease.out]);
    expect(bezier(value("ease-in-out"))).toEqual([...motionTokens.ease.inOut]);
  });

  it("las duraciones, el escalonado y el desplazamiento coinciden", () => {
    for (const [name, duration] of Object.entries(motionTokens.duration)) {
      expect(seconds(value(`dur-${name}`)), name).toBe(duration);
    }
    expect(seconds(value("stagger"))).toBe(motionTokens.stagger);
    expect(value("shift")).toBe(`${motionTokens.shift}px`);
  });
});

describe("tracking fluido por tamaño", () => {
  function clampOf(name: string): string[] {
    const match = new RegExp(`--${name}:\\s*clamp\\(([^;]+)\\);`).exec(css);
    expect(match, `--${name}`).not.toBeNull();
    return match![1].split(/,(?![^(]*\))/).map((part) => part.trim());
  }

  it("display va de -2.5% a -4% (-1px a -2.88px)", () => {
    const [min, , max] = clampOf("text-display--letter-spacing");
    expect(parseFloat(min) * 16).toBeCloseTo(-2.88, 2);
    expect(parseFloat(max) * 16).toBeCloseTo(-1, 2);
  });

  it("title va de -1.6% a -2.5% (-0.448px a -1px)", () => {
    const [min, , max] = clampOf("text-title--letter-spacing");
    expect(parseFloat(min) * 16).toBeCloseTo(-1, 2);
    expect(parseFloat(max) * 16).toBeCloseTo(-0.448, 2);
  });
});
