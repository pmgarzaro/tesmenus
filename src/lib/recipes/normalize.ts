// Rule-based normalisation of ingredients (no LLM): shared by manual entry
// and, later, URL / photo / text imports. Runs on server and client.
import type { AISLES } from "@/db/schema";
import type { Unit } from "./units";

type Aisle = (typeof AISLES)[number];

/** Lowercase, no accents, œ/æ expanded, single spaces: for comparisons only. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Words whose singular also ends in s/x/z.
const INVARIABLE = new Set([
  "pois", "noix", "anchois", "ananas", "radis", "mais", "maïs", "jus", "cassis", "brebis",
  "couscous", "riz", "gros", "frais", "épais", "epais", "bas", "lys", "persil", "sans",
  "petits-pois", "pamplemousse", "fois", "dos", "os", "panais", "cervelas", "chasselas",
  "nems", "abricots-secs", "paris", "bouquet", "doux", "roux", "vieux", "faux", "prix",
  "cèpes", "aux", "des", "les", "très",
]);

export function singularWord(w: string): string {
  if (w.length <= 3 || INVARIABLE.has(w)) return w;
  if (w.endsWith("eaux") || w.endsWith("eux") || w.endsWith("oux")) return w.slice(0, -1);
  if (w.endsWith("aux")) return w.slice(0, -3) + "al"; // (rare in ingredients)
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

// Preparation words that describe the cut, not the product.
// (`\b` ignores accented letters, hence explicit Unicode word boundaries.)
const word = (body: string) => new RegExp(`(?<!\\p{L})(?:${body})(?!\\p{L})`, "gu");
const PREPARATION = [
  word("finement|grossièrement"),
  word(
    "(?:émincé|ciselé|épluché|pelé|lavé|égoutté|rincé|dénoyauté|épépiné|paré|décortiqué|haché finement)e?s?",
  ),
  /(?<!\p{L})coupée?s? en [\p{L} ]+$/gu,
  word("en (?:dés|rondelles|lamelles|morceaux|cubes|julienne|brunoise|quartiers|tranches|fines tranches|bâtonnets)"),
  word("à température ambiante"),
];

// Canonical names for common variants (folded key → name).
const SYNONYMS: Record<string, string> = {
  "oignon jaune": "oignon",
  "oignon blanc": "oignon",
  "oignon doux": "oignon",
  "gousse d'ail": "ail",
  "gousse ail": "ail",
  "ail frais": "ail",
  "huile d'olive vierge extra": "huile d'olive",
  "huile d'olive extra vierge": "huile d'olive",
  "huile olive": "huile d'olive",
  "sel fin": "sel",
  "gros sel": "sel",
  "fleur de sel": "sel",
  "poivre noir": "poivre",
  "poivre du moulin": "poivre",
  "beurre doux": "beurre",
  "oeuf entier": "œuf",
  "oeuf": "œuf",
  "jaune d'oeuf": "jaune d'œuf",
  "blanc d'oeuf": "blanc d'œuf",
  "boeuf hache": "bœuf haché",
  "viande hachee": "bœuf haché",
  "steak hache": "bœuf haché",
  "creme fraiche epaisse": "crème fraîche",
  "creme epaisse": "crème fraîche",
  "creme liquide entiere": "crème liquide",
  "creme fleurette": "crème liquide",
  "sucre en poudre": "sucre",
  "sucre semoule": "sucre",
  "farine de ble": "farine",
  "farine t55": "farine",
  "farine t45": "farine",
  "eau froide": "eau",
  "eau chaude": "eau",
  "eau tiede": "eau",
  "lait entier": "lait",
  "lait demi-ecreme": "lait",
  "pomme de terre a chair ferme": "pomme de terre",
  "pomme de terre grenaille": "pomme de terre",
  "patate": "pomme de terre",
  "tomate concassee": "tomates concassées",
  "pulpe de tomate": "tomates concassées",
  "coulis de tomate": "coulis de tomate",
  "pois chiche": "pois chiches",
  "haricot rouge": "haricots rouges",
  "lentille corail": "lentilles corail",
  "lentille verte": "lentilles vertes",
  "epinard": "épinards",
  "petit pois": "petits pois",
};

/**
 * Canonical ingredient name: "Oignons jaunes émincés" → "oignon",
 * "200 g de farine" should be parsed first (see parseIngredientLine).
 */
export function normalizeIngredientName(raw: string): string {
  let s = raw.toLowerCase().replace(/[’`]/g, "'").trim();
  s = s.replace(/\([^)]*\)/g, " "); // "(400 g)", "(facultatif)"
  s = s.split(/[,;]| ou /)[0]; // "oignon, émincé" / "beurre ou margarine"
  for (const re of PREPARATION) s = s.replace(re, " ");
  s = s.replace(/^(de la |de l'|du |des |de |d'|la |le |les |l')/, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s
    .split(" ")
    .map((w) => (w.includes("'") ? w : singularWord(w)))
    .join(" ");
  return SYNONYMS[fold(s)] ?? s;
}

/** Key used to deduplicate ingredients ("Oignons" and "oignon" match). */
export function ingredientKey(name: string): string {
  return fold(normalizeIngredientName(name));
}

// First matching keyword wins; keywords are folded and matched as words.
const AISLE_KEYWORDS: [Aisle, string[]][] = [
  ["surgeles", ["surgele", "glace", "sorbet"]],
  ["poissonnerie", [
    "saumon", "cabillaud", "thon frais", "colin", "merlu", "lieu", "dorade", "bar", "truite",
    "crevette", "moule", "saint-jacques", "noix de saint-jacques", "calamar", "poisson",
    "sardine fraiche", "maquereau", "lotte", "sole", "gambas", "haddock", "crabe",
  ]],
  ["boucherie", [
    "boeuf", "veau", "porc", "agneau", "poulet", "dinde", "canard", "lapin", "jambon",
    "lardon", "saucisse", "chorizo", "merguez", "steak", "escalope", "roti", "filet mignon",
    "viande", "cuisse", "blanc de poulet", "magret", "bacon", "pancetta", "chair a saucisse",
    "boudin", "foie", "jarret", "paleron", "bourguignon", "cote", "gigot",
  ]],
  ["cremerie", [
    "lait", "beurre", "creme", "yaourt", "fromage", "oeuf", "parmesan", "gruyere", "emmental",
    "comte", "mozzarella", "feta", "chevre", "ricotta", "mascarpone", "roquefort", "camembert",
    "reblochon", "raclette", "cheddar", "pate brisee", "pate feuilletee", "pate sablee",
    "pate a pizza", "skyr", "fromage blanc", "petit-suisse", "burrata",
  ]],
  ["boulangerie", ["pain", "baguette", "brioche", "pain de mie", "tortilla", "wrap", "pita", "chapelure"]],
  ["fruits-legumes", [
    "oignon", "ail", "echalote", "carotte", "pomme de terre", "tomate", "courgette", "aubergine",
    "poivron", "poireau", "celeri", "brocoli", "chou", "chou-fleur", "epinard", "salade",
    "laitue", "concombre", "radis", "navet", "betterave", "potiron", "potimarron", "courge",
    "butternut", "champignon", "haricot vert", "petits pois frais", "fenouil", "artichaut",
    "asperge", "avocat", "citron", "citron vert", "orange", "pomme", "poire", "banane",
    "fraise", "framboise", "myrtille", "kiwi", "mangue", "ananas", "raisin", "peche",
    "abricot", "cerise", "prune", "melon", "pasteque", "persil", "coriandre", "basilic",
    "ciboulette", "menthe", "thym", "romarin", "laurier", "aneth", "estragon", "gingembre",
    "piment frais", "patate douce", "panais", "endive", "mache", "roquette", "cresson",
    "pousse", "herbe", "citronnelle", "chou kale", "blette", "topinambour", "petit pois",
  ]],
];

export function guessAisle(name: string): Aisle {
  const key = ` ${ingredientKey(name)} `;
  for (const [aisle, words] of AISLE_KEYWORDS) {
    if (words.some((w) => key.includes(` ${w} `) || key.startsWith(` ${w}`))) return aisle;
  }
  return "epicerie";
}

// ---------------------------------------------------------------------------
// Quantity / unit / line parsing

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125,
};

/** "1,5" → 1.5, "1/2" → 0.5, "1 ½" → 1.5, "2-3" → 2.5, "" → null. */
export function parseQuantity(raw: string): number | null {
  let s = raw.trim().replace(",", ".");
  if (!s) return null;
  const range = s.match(/^(\d+(?:\.\d+)?)\s*(?:-|–|à)\s*(\d+(?:\.\d+)?)$/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  let total = 0;
  for (const [ch, v] of Object.entries(UNICODE_FRACTIONS)) {
    if (s.includes(ch)) {
      total += v;
      s = s.replace(ch, "").trim();
    }
  }
  if (!s) return total || null;
  const frac = s.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  if (frac) return total + Number(frac[1] ?? 0) + Number(frac[2]) / Number(frac[3]);
  const n = Number(s);
  return Number.isFinite(n) ? total + n : null;
}

// Unit aliases, tried longest first. Matched on folded text.
const UNIT_ALIASES: [Unit, string[]][] = [
  ["cas", [
    "cuilleres a soupe", "cuillere a soupe", "cuil. a soupe", "c. a soupe", "c.a.s.", "c.a.s",
    "c. a s.", "c. a s", "c a s", "cas", "cs", "cuil. a s.", "tbsp", "tablespoons", "tablespoon",
  ]],
  ["cac", [
    "cuilleres a cafe", "cuillere a cafe", "cuil. a cafe", "c. a cafe", "c.a.c.", "c.a.c",
    "c. a c.", "c. a c", "c a c", "cac", "cc", "cuil. a c.", "tsp", "teaspoons", "teaspoon",
  ]],
  ["kg", ["kilogrammes", "kilogramme", "kilos", "kilo", "kg"]],
  ["g", ["grammes", "gramme", "gr.", "gr", "g"]],
  ["ml", ["millilitres", "millilitre", "ml"]],
  // "c)", "cI", "c1": usual OCR misreadings of "cl".
  ["cl", ["centilitres", "centilitre", "cl", "c)", "ci", "c1"]],
  ["l", ["litres", "litre", "l"]],
  ["pincee", ["pincees", "pincee"]],
  ["botte", ["bottes", "botte", "bouquets", "bouquet"]],
  ["gousse", ["gousses", "gousse"]],
  ["boite", ["boites", "boite", "conserves", "conserve"]],
  ["tranche", ["tranches", "tranche"]],
  ["sachet", ["sachets", "sachet"]],
  ["piece", ["pieces", "piece", "pcs", "pc"]],
];

const ALIAS_LIST = UNIT_ALIASES.flatMap(([unit, aliases]) => aliases.map((a) => [unit, a] as const))
  .sort((a, b) => b[1].length - a[1].length);

export type ParsedIngredient = {
  quantity: number | null;
  unit: Unit | null;
  /** Name as written, without quantity/unit ("oignons jaunes émincés"). */
  label: string;
  /** Canonical name ("oignon"). */
  name: string;
  optional: boolean;
};

/** "200 g de farine", "2 oignons", "1 c. à s. d'huile", "Sel, poivre". */
export function parseIngredientLine(line: string): ParsedIngredient {
  let rest = line.replace(/^\s*[-•*·–]\s*/, "").trim();
  const optional = /\bfacultati(f|ve)s?\b|\boptionnel(le)?s?\b/i.test(rest);
  rest = rest.replace(/\(?\s*(facultati(f|ve)s?|optionnel(le)?s?)\s*\)?/gi, " ").trim();

  let quantity: number | null = null;
  const qty = rest.match(
    /^((?:\d+(?:[.,]\d+)?\s*(?:-|–|à)\s*\d+(?:[.,]\d+)?)|(?:\d+\s+)?\d+\/\d+|\d+(?:[.,]\d+)?\s*[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛])/,
  );
  if (qty) {
    quantity = parseQuantity(qty[1]);
    rest = rest.slice(qty[0].length).trim();
  }

  let unit: Unit | null = null;
  const folded = fold(rest);
  for (const [u, alias] of ALIAS_LIST) {
    if (folded.startsWith(alias)) {
      const next = folded.charAt(alias.length);
      if (next && /[a-z0-9]/.test(next)) continue; // "gousse" vs "gousses", "g" vs "gingembre"
      if (alias === "ci" && next !== " ") continue;
      unit = u;
      rest = rest.slice(alias.length).trim();
      break;
    }
  }
  if (unit === null && quantity !== null) unit = "piece";

  // "de", "d'" between unit and name.
  const label = rest.replace(/^(de |d'|d’)/i, "").replace(/\s+/g, " ").trim();
  return { quantity, unit, label, name: normalizeIngredientName(label), optional };
}

/** Lowercase, trimmed, unique, non-empty tags. */
export function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const tag = t.trim().toLowerCase().replace(/^#/, "");
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}
