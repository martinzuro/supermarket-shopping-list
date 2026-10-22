import { describe, expect, it } from "vitest";
import { capitalizeName } from "./capitalize-name";
import { normalizeName } from "./normalize-name";

describe("capitalizeName", () => {
  it.each([
    ["tomates", "Tomates"],
    ["papel higiénico", "Papel higiénico"],
    ["leche entera", "Leche entera"],
  ])("capitalizes only the first letter of %j", (input, expected) => {
    expect(capitalizeName(input)).toBe(expected);
  });

  it("does not touch the rest of the name", () => {
    expect(capitalizeName("coca-Cola zero")).toBe("Coca-Cola zero");
    expect(capitalizeName("tomates Cherry")).toBe("Tomates Cherry");
    expect(capitalizeName("pan LACTAL")).toBe("Pan LACTAL");
    expect(capitalizeName("jamón y Queso")).toBe("Jamón y Queso");
  });

  it("leaves a name that is already capitalized as it is", () => {
    expect(capitalizeName("Leche")).toBe("Leche");
    expect(capitalizeName("LECHE")).toBe("LECHE");
    expect(capitalizeName("Ñoquis")).toBe("Ñoquis");
  });

  it("capitalizes letters with a tilde, a diaeresis or an eñe", () => {
    expect(capitalizeName("ñoquis")).toBe("Ñoquis");
    expect(capitalizeName("ácido cítrico")).toBe("Ácido cítrico");
    expect(capitalizeName("úlpano")).toBe("Úlpano");
    expect(capitalizeName("üva")).toBe("Üva");
  });

  it("capitalizes a name of one letter", () => {
    expect(capitalizeName("a")).toBe("A");
    expect(capitalizeName("ñ")).toBe("Ñ");
    expect(capitalizeName("A")).toBe("A");
  });

  it("skips emojis and signs before the first letter", () => {
    expect(capitalizeName("🍅 tomates")).toBe("🍅 Tomates");
    expect(capitalizeName("🍅🥬 verduras")).toBe("🍅🥬 Verduras");
    expect(capitalizeName("¿leche?")).toBe("¿Leche?");
    expect(capitalizeName("- pan")).toBe("- Pan");
    expect(capitalizeName("  pan")).toBe("  Pan");
    expect(capitalizeName("¡ñoquis!")).toBe("¡Ñoquis!");
  });

  it("leaves a name with no letter as it is", () => {
    expect(capitalizeName("")).toBe("");
    expect(capitalizeName("   ")).toBe("   ");
    expect(capitalizeName("🍅")).toBe("🍅");
    expect(capitalizeName("¿?")).toBe("¿?");
  });

  it("leaves a name that starts with a digit as it is", () => {
    expect(capitalizeName("7up")).toBe("7up");
    expect(capitalizeName("2% leche")).toBe("2% leche");
    expect(capitalizeName("🍅 3 tomates")).toBe("🍅 3 tomates");
  });

  it("leaves a lowercase start followed by a capital, as on purpose", () => {
    expect(capitalizeName("iPhone")).toBe("iPhone");
    expect(capitalizeName("eBay")).toBe("eBay");
    expect(capitalizeName("🍅 iPhone")).toBe("🍅 iPhone");
  });

  it("leaves a letter whose capital does not lowercase back to it", () => {
    expect(capitalizeName("ßeta")).toBe("ßeta");
    expect(capitalizeName("µg")).toBe("µg");
    expect(capitalizeName("ǅem")).toBe("ǅem");
  });

  it("leaves letters without capitals as they are", () => {
    expect(capitalizeName("中華")).toBe("中華");
  });

  it("never changes the normalized name", () => {
    for (const name of [
      "papel higiénico",
      "ñoquis",
      "iPhone",
      "🍅 tomates",
      "µg",
      "ßeta",
    ]) {
      expect(normalizeName(capitalizeName(name))).toBe(normalizeName(name));
    }
  });
});
