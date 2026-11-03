import { describe, expect, it } from "vitest";
import { seedKind } from "./seed-categories";

describe("seedKind", () => {
  it.each([
    ["tomate", "verduras"],
    ["tomates", "verduras"],
    ["Tomates", "verduras"],
    ["limones", "verduras"],
    ["yogures", "lacteos"],
    ["yogur", "lacteos"],
    ["huevos", "lacteos"],
    ["papas", "verduras"],
    ["Ñoquis", "lacteos"],
    ["lavandina", "limpieza"],
    ["Lavandina", "limpieza"],
    ["detergentes", "limpieza"],
    ["pañales", "higiene"],
    ["shampoo", "higiene"],
    ["cerveza", "bebidas"],
    ["helado", "congelados"],
    ["medialunas", "panaderia"],
    ["arroz", "almacen"],
    ["carne picada", "carnes"],
  ] as const)("%j is %j, singular or plural", (name, kind) => {
    expect(seedKind(name)).toBe(kind);
  });

  it.each([
    ["Café", "almacen"],
    ["café molido", "almacen"],
    ["Jamón cocido", "lacteos"],
    ["Azúcar", "almacen"],
    ["Limón", "verduras"],
    ["Pañal talle 3", "higiene"],
    ["Mermelada de durazno", "almacen"],
    ["Aceite de girasol", "almacen"],
    ["Papel higiénico", "higiene"],
    ["PAPEL HIGIÉNICO x 4", "higiene"],
    ["Shampoo Pantene", "higiene"],
  ] as const)("ignores accents and case: %j is %j", (name, kind) => {
    expect(seedKind(name)).toBe(kind);
  });

  it.each([
    ["leche descremada", "lacteos"],
    ["Leche entera 1 L", "lacteos"],
    ["yerba Canarias", "almacen"],
    ["Yerba Canarias 1 kg", "almacen"],
    ["pollo entero", "carnes"],
    ["Cerveza Patricia 1 L", "bebidas"],
    ["Queso muzzarella", "lacteos"],
    ["tomates cherry", "verduras"],
    ["Coca Cola 2,25 lt", "bebidas"],
  ] as const)(
    "a name that starts with a product is it: %j is %j",
    (name, kind) => {
      expect(seedKind(name)).toBe(kind);
    },
  );

  it("prefers the longest known start over its first word", () => {
    expect(seedKind("pan rallado")).toBe("almacen");
    expect(seedKind("pan lactal")).toBe("panaderia");
    expect(seedKind("pan")).toBe("panaderia");
    expect(seedKind("dulce de leche")).toBe("almacen");
    expect(seedKind("leche en polvo")).toBe("almacen");
    expect(seedKind("salsa de tomate")).toBe("almacen");
    expect(seedKind("tomate triturado")).toBe("almacen");
    expect(seedKind("papas fritas congeladas")).toBe("almacen");
    expect(seedKind("papas noisette")).toBe("congelados");
    expect(seedKind("desodorante de ambiente")).toBe("limpieza");
    expect(seedKind("desodorante Rexona")).toBe("higiene");
    expect(seedKind("pasta dental")).toBe("higiene");
    expect(seedKind("agua oxigenada")).toBe("higiene");
  });

  it("takes a product that is only the whole name from the whole name", () => {
    expect(seedKind("agua")).toBe("bebidas");
    expect(seedKind("Agua 2 L")).toBe("bebidas");
    expect(seedKind("agua de colonia")).toBeNull();
  });

  it("finds a keyword anywhere when the first word is unknown", () => {
    expect(seedKind("Pack de yogur")).toBe("lacteos");
    expect(seedKind("Sándwich de muzzarella")).toBe("lacteos");
    expect(seedKind("Marca Sol lavandina")).toBe("limpieza");
  });

  it.each([
    "crema",
    "jabón",
    "pasta",
    "papel",
    "papel de regalo",
    "bolsa",
    "toalla",
    "servilleta",
  ])("is null for the ambiguous %j", (name) => {
    expect(seedKind(name)).toBeNull();
  });

  it("is null when keywords point to different kinds", () => {
    expect(seedKind("Pack de gaseosa y detergente")).toBeNull();
  });

  it("is null for a name that is only a quantity or empty", () => {
    expect(seedKind("")).toBeNull();
    expect(seedKind("  ")).toBeNull();
    expect(seedKind("2 kg")).toBeNull();
  });

  it.each(["Zapatillas", "Pilas AA", "Alimento para perros", "Regalo"])(
    "is null for a product nobody knows: %j",
    (name) => {
      expect(seedKind(name)).toBeNull();
    },
  );
});
