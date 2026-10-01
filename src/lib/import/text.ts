// Pasted text (Instagram caption, e-mail, notes…) → raw recipe, by sections.
import { fold } from "@/lib/recipes/normalize";
import { splitSteps } from "@/lib/recipes/steps";
import { type RawRecipe, parseTextDuration } from "./build";

const INGREDIENTS_HEADING = /^(?:les )?ingredients?\b/;
const STEPS_HEADING = /^(?:la )?(?:preparation|instructions?|etapes?|deroule|recette|methode|realisation)\b/;
const QUANTITY_START = /^\s*(?:[-•*·–]\s*)?(?:\d|½|¼|¾|⅓|une?\s|quelques\s)/i;

/** Heading line: short, matching a keyword, optionally ending with ":". */
const headingKind = (line: string): "ingredients" | "steps" | null => {
  const f = fold(line).replace(/[:\s]+$/, "").replace(/^[#*\s\p{Extended_Pictographic}]+/u, "");
  if (f.length > 40) return null;
  if (INGREDIENTS_HEADING.test(f)) return "ingredients";
  if (STEPS_HEADING.test(f)) return "steps";
  return null;
};

// Bullets as written, or as OCR misreads them ("« 2 oignons", "= 20 cl").
const BULLET = /^\s*(?:[-•*·–—~=«»>|_°]|[oe](?=\s+\d))\s*/;
const META_WORD = /\b(pour|personnes?|portions?|parts?|preparation|cuisson|repos)\b/;

/** One metadata item per line: "Pour 4 — Préparation : 30 min — Cuisson : 1 h". */
function splitMetaLine(line: string): string[] {
  const parts = line.split(/\s+[—–|•·]\s+|\s+-\s+/);
  if (parts.length > 1 && parts.filter((p) => META_WORD.test(fold(p)) && /\d/.test(p)).length >= 2) return parts;
  return [line];
}

export function parseRecipeText(text: string): RawRecipe {
  const lines = text
    .split(/\r?\n/)
    .flatMap(splitMetaLine)
    .map((l) => l.replace(BULLET, "").trim());
  const raw: RawRecipe = { ingredientLines: [], stepTexts: [] };
  let section: "intro" | "ingredients" | "steps" = "intro";
  const intro: string[] = [];
  const steps: string[] = [];

  for (const line of lines) {
    if (!line || /^(#\S+\s*)+$/.test(line)) continue; // blank or hashtags only
    const f = fold(line);
    // Metadata lines anywhere.
    const meta = f.match(/^(pour|portions?|personnes?|parts?|temps de preparation|preparation|cuisson|temps de cuisson|repos)\s*:?\s*(.*)$/);
    const isServings = meta && /^(pour|portion|personne|part)/.test(meta[1]);
    const metaOk = meta && (isServings ? /^\d+\s*(pers|personnes?|parts?|portions?|couverts?)?\b\.?\s*$/.test(meta[2]) : /\d/.test(meta[2]));
    if (meta && metaOk && line.length < 60 && !/[.!]$/.test(line)) {
      if (isServings) raw.servingsText = meta[2];
      else if (/cuisson/.test(meta[1])) raw.cookMinutes = parseTextDuration(meta[2]);
      else if (/preparation/.test(meta[1])) raw.prepMinutes = parseTextDuration(meta[2]);
      continue;
    }
    const kind = headingKind(line);
    if (kind) {
      section = kind;
      // "Ingrédients (pour 4 personnes) :"
      if (kind === "ingredients" && !raw.servingsText && /\d/.test(line)) raw.servingsText = line;
      continue;
    }
    if (section === "intro") intro.push(line);
    else if (section === "ingredients") raw.ingredientLines.push(line);
    else steps.push(line);
  }

  // No headings at all: tell ingredients (short, start with a quantity) from steps.
  if (raw.ingredientLines.length === 0 && steps.length === 0 && intro.length > 1) {
    const [first, ...rest] = intro;
    intro.length = 0;
    intro.push(first);
    for (const l of rest) {
      if (QUANTITY_START.test(l) && l.length <= 70) raw.ingredientLines.push(l);
      else steps.push(l);
    }
  }

  raw.title = intro[0]?.replace(/^[#*\s]+|[*\s]+$/g, "");
  if (intro.length > 1) raw.description = intro.slice(1).join(" ");
  raw.stepTexts = splitSteps(steps.join("\n"));
  return raw;
}
