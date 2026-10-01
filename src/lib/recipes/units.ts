import type { UNITS } from "@/db/schema";
import { singularWord } from "./normalize";

export type Unit = (typeof UNITS)[number];

/** Short label shown after a quantity. Pieces have none ("2 oignons"). */
export const UNIT_LABELS: Record<Unit, string> = {
  g: "g",
  kg: "kg",
  ml: "ml",
  cl: "cl",
  l: "l",
  piece: "",
  cas: "c. à s.",
  cac: "c. à c.",
  pincee: "pincée",
  botte: "botte",
  gousse: "gousse",
  boite: "boîte",
  tranche: "tranche",
  sachet: "sachet",
};

/** Name shown in unit pickers. */
export const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "ml", label: "ml" },
  { value: "cl", label: "cl" },
  { value: "l", label: "l" },
  { value: "piece", label: "pièce(s)" },
  { value: "cas", label: "c. à soupe" },
  { value: "cac", label: "c. à café" },
  { value: "pincee", label: "pincée" },
  { value: "botte", label: "botte" },
  { value: "gousse", label: "gousse" },
  { value: "boite", label: "boîte" },
  { value: "tranche", label: "tranche" },
  { value: "sachet", label: "sachet" },
];

// Countable units take an "s" in the plural; metric ones never do.
const PLURALISABLE = new Set<Unit>(["pincee", "botte", "gousse", "boite", "tranche", "sachet"]);

export function scaleQuantity(
  quantity: number | null,
  fromServings: number,
  toServings: number,
): number | null {
  if (quantity === null || !fromServings) return quantity;
  return (quantity * toServings) / fromServings;
}

const FRACTIONS: [number, string][] = [
  [0.25, "¼"],
  [0.5, "½"],
  [0.75, "¾"],
  [1 / 3, "⅓"],
  [2 / 3, "⅔"],
];

/** Rounds to something a cook would write: 333.3 g → 330 g, 1.5 pièce → 1 ½. */
export function roundForKitchen(q: number, unit: Unit | null): number {
  if (unit === "g" || unit === "ml") {
    if (q >= 100) return Math.round(q / 10) * 10;
    if (q >= 20) return Math.round(q / 5) * 5;
    return Math.round(q);
  }
  // Everything else: quarters are precise enough.
  return Math.max(Math.round(q * 4) / 4, q > 0 ? 0.25 : 0);
}

export function formatNumber(q: number, unit: Unit | null): string {
  const r = roundForKitchen(q, unit);
  if (unit === "g" || unit === "ml") return String(r);
  const whole = Math.floor(r);
  const frac = r - whole;
  if (frac < 0.01) return String(whole);
  const symbol = FRACTIONS.find(([v]) => Math.abs(v - frac) < 0.01)?.[1];
  if (symbol) return whole ? `${whole} ${symbol}` : symbol;
  return r.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

/** "250 g", "2 c. à s.", "3 gousses", "2" (pieces), "" (no quantity). */
export function formatQuantity(quantity: number | null, unit: Unit | null): string {
  if (quantity === null) return "";
  const n = formatNumber(quantity, unit);
  if (!unit || unit === "piece") return n;
  let label = UNIT_LABELS[unit];
  if (PLURALISABLE.has(unit) && roundForKitchen(quantity, unit) >= 2) label += "s";
  return `${n} ${label}`;
}

function pluralWord(w: string): string {
  if (/[sxz]$/.test(w)) return w;
  if (/(eau|eu)$/.test(w)) return `${w}x`;
  return `${w}s`;
}

/**
 * Agrees a piece-counted label with its quantity: "oignons jaunes" → "oignon
 * jaune" for 1, "citron" → "citrons" for 3. Only the head is changed
 * ("pommes de terre", "poulet (1,5 kg)").
 */
export function agreeLabel(label: string, plural: boolean): string {
  const m = label.match(/^(.*?)((?: (?:de|d'|d’|à|au|aux|en|pour)\b| ?\().*)?$/);
  const head = m?.[1] ?? label;
  const tail = m?.[2] ?? "";
  const words = head.split(" ").map((w) => (plural ? pluralWord(w) : singularWord(w)));
  return words.join(" ") + tail;
}

/** "250 g de farine", "2 gousses d'ail", "2 oignons", "sel" (no quantity). */
export function formatIngredientLine(quantity: number | null, unit: Unit | null, label: string): string {
  const q = formatQuantity(quantity, unit);
  if (!q) return label;
  if (!unit || unit === "piece") {
    return `${q} ${agreeLabel(label, roundForKitchen(quantity!, unit) >= 2)}`;
  }
  // No elision before an aspirated h ("de haricots", "de homard").
  const elide = /^[aeiouyhâàéèêëîïôœûù]/i.test(label) && !/^h(aricot|areng|omard|addock|ach|ampe|ot-dog)/i.test(label);
  return `${q} ${elide ? "d'" : "de "}${label}`;
}
