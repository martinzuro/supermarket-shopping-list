/**
 * Utilidades de color para validar el sistema de diseño: conversión de hex
 * y oklch a sRGB lineal, luminancia relativa y ratio de contraste WCAG.
 * Son funciones puras; se usan en los tests y en la página /design.
 */

export type Rgb = { r: number; g: number; b: number };

const HEX_RE = /^#([0-9a-f]{6})$/i;
const OKLCH_RE =
  /^oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*[\d.%]+)?\s*\)$/i;

/** Convierte "#rrggbb" a canales 0..1 en espacio sRGB (con gamma). */
export function hexToRgb(hex: string): Rgb {
  const match = HEX_RE.exec(hex.trim());
  if (!match) throw new Error(`Hex inválido: ${hex}`);
  const value = parseInt(match[1], 16);
  return {
    r: ((value >> 16) & 0xff) / 255,
    g: ((value >> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  };
}

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x));
}

function linearToSrgb(c: number) {
  const v = clamp01(c);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Convierte "oklch(L% C H)" a sRGB con gamma. L se acepta en porcentaje o
 * en 0..1. Los canales fuera de gamut se recortan, como hace el navegador.
 */
export function oklchToRgb(oklch: string): Rgb {
  const match = OKLCH_RE.exec(oklch.trim());
  if (!match) throw new Error(`oklch inválido: ${oklch}`);
  let L = parseFloat(match[1]);
  if (oklch.includes("%") || L > 1) L = L / 100;
  const C = parseFloat(match[2]);
  const h = (parseFloat(match[3]) * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const rLin = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return {
    r: linearToSrgb(rLin),
    g: linearToSrgb(gLin),
    b: linearToSrgb(bLin),
  };
}

/** Acepta "#rrggbb" u "oklch(...)". */
export function parseColor(value: string): Rgb {
  const v = value.trim();
  if (HEX_RE.test(v)) return hexToRgb(v);
  if (OKLCH_RE.test(v)) return oklchToRgb(v);
  throw new Error(`Color no soportado: ${value}`);
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const to = (c: number) =>
    Math.round(clamp01(c) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Luminancia relativa según WCAG 2.x. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

/** Ratio de contraste WCAG entre dos colores, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseColor(a));
  const lb = relativeLuminance(parseColor(b));
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Formatea un ratio como "4.5:1" con un decimal. */
export function formatRatio(ratio: number): string {
  return `${(Math.floor(ratio * 10) / 10).toFixed(1)}:1`;
}
