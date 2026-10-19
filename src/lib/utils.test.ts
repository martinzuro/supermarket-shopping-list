import { describe, expect, it } from "vitest";
import { cn } from "./utils";

/**
 * `cn` debe conocer las escalas del sistema: si no, borra clases que no
 * están en conflicto (text-label frente a text-ink) o deja dos que sí lo
 * están (text-base y text-heading).
 */
describe("cn con el tema del sistema", () => {
  it("mantiene un rol tipográfico junto a un color de texto", () => {
    expect(cn("text-label", "text-ink")).toBe("text-label text-ink");
    expect(cn("text-heading text-ink pr-12")).toBe(
      "text-heading text-ink pr-12",
    );
    expect(cn("text-label", "text-tomato-text")).toBe(
      "text-label text-tomato-text",
    );
  });

  it("resuelve conflictos entre tamaños de texto, el último gana", () => {
    expect(cn("text-base", "text-heading")).toBe("text-heading");
    expect(cn("text-row", "text-label")).toBe("text-label");
    expect(cn("text-display", "text-sm")).toBe("text-sm");
  });

  it("resuelve conflictos en espaciado, radios, sombra, curva y duración", () => {
    expect(cn("h-touch", "h-touch-lg")).toBe("h-touch-lg");
    expect(cn("size-touch", "size-touch-lg")).toBe("size-touch-lg");
    expect(cn("h-row", "h-14")).toBe("h-14");
    expect(cn("px-5", "px-0")).toBe("px-0");
    expect(cn("px-margin", "px-4")).toBe("px-4");
    expect(cn("gap-gap", "gap-2")).toBe("gap-2");
    expect(cn("rounded-field", "rounded-full")).toBe("rounded-full");
    expect(cn("rounded-sheet", "rounded-none")).toBe("rounded-none");
    expect(cn("shadow-sheet", "shadow-none")).toBe("shadow-none");
    expect(cn("ease-out", "ease-cinematic")).toBe("ease-cinematic");
    expect(cn("duration-fast", "duration-base")).toBe("duration-base");
  });

  it("no mezcla grupos distintos", () => {
    expect(cn("h-touch", "min-h-touch")).toBe("h-touch min-h-touch");
    expect(cn("rounded-field", "rounded-l-sheet")).toBe(
      "rounded-field rounded-l-sheet",
    );
    expect(cn("bg-paper", "text-ink", "border-rule")).toBe(
      "bg-paper text-ink border-rule",
    );
  });

  it("sigue aceptando condicionales como clsx", () => {
    expect(cn("a", false && "b", { c: true, d: false }, ["e"])).toBe("a c e");
  });
});
