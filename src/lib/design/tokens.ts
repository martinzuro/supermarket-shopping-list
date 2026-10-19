/**
 * Fuente de verdad en TypeScript de la paleta del sistema de diseño
 * (ADR 0008). Debe coincidir con los valores de src/app/globals.css; el test
 * tokens.test.ts lo comprueba y valida el contraste de cada par de uso.
 *
 * Este módulo no se importa desde componentes de producto: solo lo usan la
 * página interna /design y los tests.
 */

export type Mode = "light" | "dark";

export type PaletteToken =
  | "paper"
  | "paper-2"
  | "ink"
  | "ink-2"
  | "ink-3"
  | "forest"
  | "lime"
  | "on-lime"
  | "citrus"
  | "citrus-text"
  | "tomato"
  | "tomato-text"
  | "inverse-bg"
  | "inverse-fg"
  | "inverse-fg-2";

export const palette: Record<Mode, Record<PaletteToken, string>> = {
  light: {
    paper: "#f6f3ec",
    "paper-2": "#dce9c8",
    ink: "#1b2a1f",
    "ink-2": "#56655a",
    "ink-3": "#76837a",
    forest: "#2f4a3a",
    lime: "#c9f04a",
    "on-lime": "#1b2a1f",
    citrus: "#f26b1d",
    "citrus-text": "#b8480a",
    tomato: "#d9432b",
    "tomato-text": "#b5341f",
    "inverse-bg": "#1b2a1f",
    "inverse-fg": "#eeebe2",
    "inverse-fg-2": "#afb8b0",
  },
  dark: {
    paper: "#121814",
    "paper-2": "#1f2b22",
    ink: "#eeebe2",
    "ink-2": "#9ba69c",
    "ink-3": "#6b776e",
    forest: "#8fb89b",
    lime: "#c9f04a",
    "on-lime": "#1b2a1f",
    citrus: "#ff8a47",
    "citrus-text": "#ff9a62",
    tomato: "#f06a52",
    "tomato-text": "#f57f6a",
    "inverse-bg": "#1b2a1f",
    "inverse-fg": "#eeebe2",
    "inverse-fg-2": "#afb8b0",
  },
};

/** Acción primaria: lima sobre tinta en claro, tinta sobre lima en oscuro. */
export const action: Record<Mode, { bg: string; fg: string }> = {
  light: { bg: palette.light.ink, fg: palette.light.lime },
  dark: { bg: palette.dark.lime, fg: palette.dark.paper },
};

/** Foco: bosque en claro, lima en oscuro; lima sobre la superficie inversa. */
export const focus: Record<Mode, string> = {
  light: palette.light.forest,
  dark: palette.dark.lime,
};

export const focusInverse = "#c9f04a";

export const categoryIds = [
  "verduras",
  "carnes",
  "lacteos",
  "panaderia",
  "almacen",
  "bebidas",
  "congelados",
  "limpieza",
  "higiene",
  "otros",
] as const;

export type CategoryId = (typeof categoryIds)[number];

/** Tono oklch por categoría; "otros" no tiene croma. */
export const categoryHue: Record<CategoryId, number | null> = {
  verduras: 140,
  carnes: 25,
  lacteos: 85,
  panaderia: 65,
  almacen: 50,
  bebidas: 240,
  congelados: 205,
  limpieza: 290,
  higiene: 340,
  otros: null,
};

/** Fondo de etiqueta e hilo lateral de cada categoría, por modo. */
export function categoryColors(id: CategoryId, mode: Mode) {
  const hue = categoryHue[id];
  const h = hue ?? 0;
  const c = hue === null ? 0 : 1;
  if (mode === "light") {
    return {
      badge: `oklch(90% ${0.06 * c} ${h})`,
      thread: `oklch(55% ${0.13 * c} ${h})`,
    };
  }
  return {
    badge: `oklch(33% ${0.05 * c} ${h})`,
    thread: `oklch(72% ${0.13 * c} ${h})`,
  };
}

export type ContrastPair = {
  name: string;
  fg: string;
  bg: string;
  /** 4.5 para texto, 3 para bordes, iconos y texto grande. */
  min: 4.5 | 3;
};

/** Pares que la interfaz usa de verdad, por modo. */
export function contrastPairs(mode: Mode): ContrastPair[] {
  const p = palette[mode];
  const pairs: ContrastPair[] = [
    { name: "ink / paper", fg: p.ink, bg: p.paper, min: 4.5 },
    { name: "ink-2 / paper", fg: p["ink-2"], bg: p.paper, min: 4.5 },
    { name: "ink / paper-2", fg: p.ink, bg: p["paper-2"], min: 4.5 },
    { name: "ink-2 / paper-2", fg: p["ink-2"], bg: p["paper-2"], min: 4.5 },
    {
      name: "ink-3 / paper (solo decorativo)",
      fg: p["ink-3"],
      bg: p.paper,
      min: 3,
    },
    {
      name: "action-fg / action-bg",
      fg: action[mode].fg,
      bg: action[mode].bg,
      min: 4.5,
    },
    {
      name: "citrus-text / paper",
      fg: p["citrus-text"],
      bg: p.paper,
      min: 4.5,
    },
    {
      name: "tomato-text / paper",
      fg: p["tomato-text"],
      bg: p.paper,
      min: 4.5,
    },
    { name: "forest / paper", fg: p.forest, bg: p.paper, min: 4.5 },
    { name: "focus / paper (anillo)", fg: focus[mode], bg: p.paper, min: 3 },
    {
      name: "focus / paper-2 (anillo)",
      fg: focus[mode],
      bg: p["paper-2"],
      min: 3,
    },
    {
      name: "inverse-fg / inverse-bg",
      fg: p["inverse-fg"],
      bg: p["inverse-bg"],
      min: 4.5,
    },
    {
      name: "inverse-fg-2 / inverse-bg",
      fg: p["inverse-fg-2"],
      bg: p["inverse-bg"],
      min: 4.5,
    },
    { name: "on-lime / lime (hecho)", fg: p["on-lime"], bg: p.lime, min: 4.5 },
    {
      name: "field-border (ink-2) / paper",
      fg: p["ink-2"],
      bg: p.paper,
      min: 3,
    },
  ];
  for (const id of categoryIds) {
    const { badge, thread } = categoryColors(id, mode);
    pairs.push({ name: `ink / cat-${id}`, fg: p.ink, bg: badge, min: 4.5 });
    pairs.push({
      name: `cat-${id}-thread / paper`,
      fg: thread,
      bg: p.paper,
      min: 3,
    });
  }
  return pairs;
}
