import { createCn } from "cn/config";

/**
 * `cn` configurado con las escalas propias del sistema de diseño. Sin esto
 * el motor toma `text-label` o `rounded-field` por colores o valores
 * desconocidos y los descarta cuando después llega otra clase del mismo
 * prefijo. `src/lib/utils.test.ts` lo garantiza.
 */
export const cn = createCn({
  extend: {
    theme: {
      // Roles tipográficos (font-size + line-height + tracking + peso).
      text: ["display", "title", "heading", "row", "body", "label", "eyebrow"],
      // Objetivos táctiles, fila de lista y las dos variables fluidas.
      spacing: ["touch", "touch-lg", "row", "margin", "gap"],
      radius: ["field", "sheet"],
      shadow: ["sheet"],
      ease: ["cinematic"],
    },
    classGroups: {
      duration: [
        { duration: ["instant", "fast", "base", "slow", "cinematic"] },
      ],
    },
  },
});
