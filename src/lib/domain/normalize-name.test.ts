import { describe, expect, it } from "vitest";
import { normalizeName } from "./normalize-name";

describe("normalizeName", () => {
  it.each([
    ["  Leche   ENTERA ", "leche entera"],
    ["Ñoquis", "noquis"],
    ["Café\tde  Colombia", "cafe de colombia"],
    ["PINGÜINO", "pinguino"],
  ])("normalizes %j", (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });

  it("collapses tabs, newlines and NBSP into single spaces", () => {
    expect(normalizeName("a\t\tb\n\nc  d")).toBe("a b c d");
  });

  it("trims leading and trailing exotic whitespace", () => {
    expect(normalizeName(" 　 pan ﻿ ")).toBe("pan");
  });

  it("returns an empty string for empty or whitespace-only input", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName("   \t\n ")).toBe("");
  });

  it("strips accents, tildes and diaeresis from lowercase and uppercase", () => {
    expect(normalizeName("áéíóú àèìòù âêîôû äëïöü ãõ ñ")).toBe(
      "aeiou aeiou aeiou aeiou ao n",
    );
    expect(normalizeName("ÁÉÍÓÚ Ü Ñ")).toBe("aeiou u n");
  });

  it("keeps letters without a canonical decomposition", () => {
    expect(normalizeName("Ø ß Æ Ł")).toBe("ø ß æ ł");
  });

  it("folds final sigma into sigma", () => {
    expect(normalizeName("ΟΔΟΣ")).toBe("οδοσ");
    expect(normalizeName("οδός")).toBe(normalizeName("ΟΔΟΣ"));
  });

  it("drops the dot of a dotted capital I", () => {
    expect(normalizeName("İstanbul")).toBe("istanbul");
  });

  it("is idempotent", () => {
    const once = normalizeName("  Ñandú  CAFÉ ");
    expect(normalizeName(once)).toBe(once);
  });

  it("treats composed and decomposed input the same", () => {
    expect(normalizeName("café")).toBe(normalizeName("café"));
  });
});
