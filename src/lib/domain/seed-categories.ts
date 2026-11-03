import type { CategoryId } from "@/lib/design/tokens";
import { normalizeName } from "./normalize-name";

/** The kinds a product can seed to: every one but "otros". */
export type SeedKind = Exclude<CategoryId, "otros">;

// Frequent products of the Uruguayan supermarket and the kind of category each
// belongs to (A-1). Comma-separated, in singular or plural, with or without
// accents: the lookup compares normalized, singularized words. A key matches
// the start of a name ("leche" is "leche descremada"), the longest one wins,
// so "papel higienico" beats "papel". A "=" in front means the whole name only
// ("=agua" is agua, not "agua de colonia").
const PRODUCTS: Record<SeedKind, string> = {
  verduras: `
    tomate, tomate cherry, papa, boniato, batata, cebolla, cebolla de verdeo,
    cebolla morada, ajo, zanahoria, zapallo, zapallito, calabacin, morron,
    pimiento, lechuga, rucula, espinaca, acelga, repollo, brocoli, coliflor,
    choclo, pepino, berenjena, remolacha, apio, puerro, hongo, champinon,
    perejil, cilantro, albahaca, jengibre, esparrago, rabanito, hinojo,
    limon, lima, naranja, mandarina, pomelo, manzana, pera, banana, frutilla,
    uva, durazno, ciruela, kiwi, anana, melon, sandia, palta, mango,
    arandano, cereza, higo, membrillo, fruta, verdura, ensalada
  `,
  carnes: `
    carne, carne picada, picada, asado, tira de asado, bife, bife de chorizo,
    entrecot, lomo, nalga, cuadril, peceto, osobuco, costilla, vacio, matambre,
    milanesa, hamburguesa, chorizo, morcilla, salchicha, pollo, pechuga,
    muslo, pata muslo, alita, suprema, pavo, cerdo, bondiola, costeleta,
    chuleta, cordero, higado, rinon, achura, molleja, pescado, merluza,
    filet de merluza, salmon, pejerrey, corvina, camaron, langostino,
    calamar, pulpo, mariscos
  `,
  lacteos: `
    leche, queso, queso rallado, queso cremoso, queso azul, queso crema,
    queso untable, muzzarella, mozzarella, ricota, dambo, parmesano,
    yogur, manteca, margarina, crema de leche, nata, huevo, jamon, jamon cocido,
    panceta, salame, fiambre, mortadela, paleta, flan, postre, pate,
    ravioles, capeletis, noquis, pasta fresca, tapa de pascualina,
    tapa de tarta, tapa de empanada, queso de rallar
  `,
  panaderia: `
    pan, pan de molde, pan lactal, pan integral, pan de hamburguesa,
    pan de pancho, baguette, bizcocho, medialuna, factura, torta, tortita,
    grisin, chipa, pionono, budin, prepizza, rosca, dona, tostada
  `,
  almacen: `
    arroz, fideo, tallarin, spaghetti, espagueti, macarron, tirabuzon,
    harina, harina de maiz, polenta, azucar, sal, sal gruesa, aceite,
    aceite de oliva, aceite de girasol, vinagre, aceto, yerba, cafe, te,
    mate cocido, cacao, chocolate, mermelada, dulce de leche, dulce de
    membrillo, dulce, miel, galletita, galleta, cereal, avena, granola,
    lenteja, garbanzo, poroto, arveja, salsa, salsa de tomate, pure de tomate,
    pure de papa, pure instantaneo, tomate triturado, extracto de tomate,
    pulpa de tomate, mayonesa, ketchup, mostaza, salsa golf, salsa de soja,
    atun, caballa, sardina, lata, conserva, choclo en lata, palmito, aceituna,
    pickle, sopa, caldo, condimento, oregano, pimenton, pimienta, comino,
    aji molido, especia, esencia de vainilla, polvo de hornear, levadura,
    gelatina, flan en polvo, papas fritas, snack, mani, nuez, almendra,
    pasas de uva, fruta seca, turron, alfajor, bizcochuelo, bombon, chicle,
    caramelo, chocolatin, barra de cereal, pan rallado, rebozador, edulcorante,
    stevia, leche de coco, leche de almendras, leche de soja, leche condensada,
    leche en polvo, fideos, nutella, tapioca, maicena, cuscus, quinoa
  `,
  bebidas: `
    =agua, agua mineral, agua sin gas, agua con gas, agua saborizada,
    gaseosa, refresco, coca cola, coca, pepsi, sprite, fanta, 7up, schweppes,
    jugo, jugo en polvo, cerveza, vino, espumante, champagne, whisky,
    vodka, ron, gin, fernet, grappa, licor, sidra, aperitivo, campari, tonica,
    soda, limonada, isotonica, gatorade, energizante, red bull, malta
  `,
  congelados: `
    helado, congelado, papas congeladas, papas noisette, papas pre fritas,
    nugget, empanada congelada, verdura congelada, pizza, pizza congelada,
    pescado congelado, palito helado, postre helado, hielo, rabas, croqueta,
    bastoncito de pescado, bastones de muzzarella, rapiditas, wok
  `,
  limpieza: `
    lavandina, detergente, jabon en polvo, jabon para ropa, suavizante,
    limpiador, limpiapisos, desinfectante, cloro, desengrasante, lustramuebles,
    limpiavidrios, limpia vidrios, esponja, pano, trapo, trapo de piso, escoba,
    bolsa de basura, bolsa de residuos, papel de cocina, rollo de cocina,
    insecticida, repelente, ambientador, desodorante de ambiente, aromatizante,
    lavavajilla, pastilla para lavavajilla, papel aluminio, film, film de cocina,
    guantes de limpieza, cera, quitamanchas, blanqueador, antigrasa, jabon de
    lavar, destapacanerias, secador de piso, virulana
  `,
  higiene: `
    papel higienico, shampoo, champu, acondicionador, enjuague, jabon de
    tocador, jabon de manos, jabon de bano, desodorante, pasta dental, pasta de
    dientes, crema dental, cepillo de dientes, hilo dental, enjuague bucal,
    colutorio, afeitadora, maquinita, espuma de afeitar, gel de ducha, gel de
    bano, gel antibacterial, toallita femenina, toalla femenina, tampon,
    protector diario, apositos, panal, toallita humeda, algodon, hisopo,
    cotonete, curita, alcohol, alcohol en gel, agua oxigenada, crema de manos,
    crema corporal, crema facial, protector solar, bronceador, talco, peine, esmalte, removedor, tintura, perfume, panuelo descartable,
    preservativo, aceite de bebe, crema para peinar
  `,
};

// First words that name two different things: the list shows what they are
// (A-1). Without a longer key to settle it, the product goes to Otros.
const AMBIGUOUS =
  "crema, pasta, papel, jabon, bolsa, toalla, servilleta, cepillo, gel";

// Words that, anywhere in a name, say what the product is. For names whose
// first word is unknown: "Pack de yogur", "Sándwich de muzzarella".
const KEYWORDS: Record<SeedKind, string> = {
  verduras: "verdura",
  carnes: "pollo, milanesa, pescado",
  lacteos: "yogur, muzzarella",
  panaderia: "bizcocho, medialuna",
  almacen:
    "galletita, fideo, arroz, yerba, mermelada, harina, azucar, canarias",
  bebidas: "gaseosa, cerveza, vino, jugo, refresco",
  congelados: "congelado, helado",
  limpieza: "lavandina, detergente, suavizante, desinfectante, limpiador",
  higiene: "shampoo, champu, dental, panal, colgate, rexona",
};

const UNITS = new Set([
  "kg",
  "kgs",
  "g",
  "gr",
  "grs",
  "mg",
  "l",
  "lt",
  "lts",
  "ml",
  "cc",
  "un",
  "u",
  "x",
  "pack",
  "paquete",
]);

// The word without its plural: "tomates" and "tomate" meet at "tomat",
// "yogures" and "yogur" at "yogur", "papas" and "papa" at "papa". Both sides
// of the lookup go through it, so it only has to be consistent.
function stem(word: string): string {
  let stemmed = word;
  if (stemmed.length > 4 && stemmed.endsWith("es"))
    stemmed = stemmed.slice(0, -2);
  else if (stemmed.length > 3 && stemmed.endsWith("s"))
    stemmed = stemmed.slice(0, -1);
  if (stemmed.length > 4 && stemmed.endsWith("e"))
    stemmed = stemmed.slice(0, -1);
  return stemmed;
}

// A name as the words that tell what it is: normalized, without punctuation,
// quantities or units ("Yerba Canarias 1 kg" is yerba canarias), stemmed.
function words(name: string): string[] {
  return normalizeName(name)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(" ")
    .filter((word) => word !== "" && !/^\d/.test(word) && !UNITS.has(word))
    .map(stem);
}

function keysOf(list: string): { key: string; whole: boolean }[] {
  return list
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map((entry) => {
      const whole = entry.startsWith("=");
      return { key: words(entry.replace(/^=/, "")).join(" "), whole };
    });
}

const KINDS = Object.keys(PRODUCTS) as SeedKind[];

// Key (stemmed words) to kind, one table for names that start with it and one
// for those that are only it. A key given two kinds is not trusted: null.
const prefixes = new Map<string, SeedKind | null>();
const wholes = new Map<string, SeedKind | null>();
for (const kind of KINDS) {
  for (const { key, whole } of keysOf(PRODUCTS[kind])) {
    const table = whole ? wholes : prefixes;
    const known = table.get(key);
    table.set(key, known === undefined || known === kind ? kind : null);
  }
}

const ambiguous = new Set(keysOf(AMBIGUOUS).map(({ key }) => key));

const keywords = new Map<string, SeedKind | null>();
for (const kind of KINDS) {
  for (const { key } of keysOf(KEYWORDS[kind])) {
    const known = keywords.get(key);
    keywords.set(key, known === undefined || known === kind ? kind : null);
  }
}

/**
 * The kind of category a product name belongs to, from the seed dictionary, or
 * null when it is unknown or could be two things (the list then shows it under
 * "Otros"; guessing wrong costs more than not guessing). In order: the whole
 * name, then the longest start of it that is a known product, singular or
 * plural, accents and quantity aside ("leche descremada" is leche, "Yerba
 * Canarias 1 kg" is yerba), then known keywords anywhere in it.
 */
export function seedKind(name: string): SeedKind | null {
  const parts = words(name);
  if (parts.length === 0) return null;
  const whole = wholes.get(parts.join(" "));
  if (whole !== undefined) return whole;
  for (let length = parts.length; length >= 1; length -= 1) {
    const key = parts.slice(0, length).join(" ");
    const kind = prefixes.get(key);
    if (kind !== undefined) return kind;
    if (length === 1 && ambiguous.has(key)) return null;
  }
  if (parts.some((part) => ambiguous.has(part))) return null;
  const kinds = new Set<SeedKind | null>();
  for (const part of parts) {
    const kind = keywords.get(part);
    if (kind !== undefined) kinds.add(kind);
  }
  const [only] = kinds;
  return kinds.size === 1 && only ? only : null;
}
