// Fallback when a page has no JSON-LD: microdata, then "Ingrédients" /
// "Préparation" headings followed by lists, then the page text.
import { type HTMLElement, parse } from "node-html-parser";
import { fold } from "@/lib/recipes/normalize";
import type { RawRecipe } from "./build";
import { htmlToText } from "./jsonld";
import { parseRecipeText } from "./text";

const textOf = (el: HTMLElement) => htmlToText(el.innerHTML.replace(/<\/(p|li|div|h\d)>/gi, "\n"));

const INGREDIENTS = /^(?:les )?ingredients?\b/;
const STEPS = /^(?:la )?(?:preparation|instructions?|etapes?|methode|realisation|deroulement)\b/;
const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "STRONG", "B", "P", "DIV", "SPAN", "DT", "LEGEND"]);

function title(root: HTMLElement): string | undefined {
  const og = root.querySelector('meta[property="og:title"]')?.getAttribute("content");
  return htmlToText(og || root.querySelector("h1")?.text || root.querySelector("title")?.text || "") || undefined;
}

function microdata(root: HTMLElement): RawRecipe | null {
  const ings = root.querySelectorAll('[itemprop="recipeIngredient"], [itemprop="ingredients"]');
  if (ings.length === 0) return null;
  const steps = root.querySelectorAll('[itemprop="recipeInstructions"]').flatMap((el) => {
    const items = el.querySelectorAll("li, p");
    return items.length ? items.map(textOf) : [textOf(el)];
  });
  const prop = (name: string) => {
    const el = root.querySelector(`[itemprop="${name}"]`);
    return el?.getAttribute("content") ?? el?.getAttribute("datetime") ?? (el ? textOf(el) : undefined);
  };
  return {
    title: prop("name") ?? title(root),
    servingsText: prop("recipeYield"),
    ingredientLines: ings.map(textOf),
    stepTexts: steps.flatMap((s) => s.split("\n")),
  };
}

/** Items of the first list (or paragraphs) following a heading matching `re`. */
function sectionAfter(all: HTMLElement[], re: RegExp, stopAt: RegExp): string[] {
  const idx = all.findIndex((el) => {
    if (!HEADING_TAGS.has(el.tagName)) return false;
    const t = fold(el.text).replace(/[:\s]+$/, "");
    return t.length <= 40 && re.test(t);
  });
  if (idx === -1) return [];
  const heading = all[idx];
  // "<p><strong>Ingrédients :</strong><br>200 g de farine<br>…</p>": lines in the same block.
  if (/^(STRONG|B|SPAN)$/.test(heading.tagName) && heading.parentNode) {
    const lines = textOf(heading.parentNode).split("\n").map((l) => l.trim()).filter(Boolean);
    const at = lines.findIndex((l) => re.test(fold(l).replace(/[:\s]+$/, "")));
    const after = lines.slice(at + 1);
    const stop = after.findIndex((l) => stopAt.test(fold(l)) && l.length <= 40);
    const own = stop === -1 ? after : after.slice(0, stop);
    if (own.length >= 2) return own;
  }
  const paragraphs: string[] = [];
  for (const el of all.slice(idx + 1)) {
    if (heading.querySelectorAll("*").includes(el)) continue; // inside the heading itself
    if (el.tagName === "UL" || el.tagName === "OL") {
      const items = el.querySelectorAll("li").map(textOf).filter(Boolean);
      if (items.length) return items;
    }
    if (/^H[1-6]$/.test(el.tagName) && stopAt.test(fold(el.text))) break;
    if (/^H[1-6]$/.test(el.tagName) && paragraphs.length) break;
    if (el.tagName === "P") {
      const t = textOf(el);
      if (t) paragraphs.push(t);
      if (paragraphs.length >= 30) break;
    }
  }
  return paragraphs;
}

export function extractHtmlRecipe(html: string | HTMLElement): RawRecipe {
  const root = typeof html === "string" ? parse(html) : html;
  root.querySelectorAll("script, style, noscript, nav, footer, header, aside, form, iframe").forEach((el) => el.remove());

  const micro = microdata(root);
  if (micro) return micro;

  const all = root.querySelectorAll("*");
  const ingredientLines = sectionAfter(all, INGREDIENTS, STEPS);
  const stepTexts = sectionAfter(all, STEPS, INGREDIENTS);
  if (ingredientLines.length || stepTexts.length) {
    return { title: title(root), ingredientLines, stepTexts };
  }

  // Last resort: the main text, parsed like a pasted recipe.
  const main = root.querySelector("article") ?? root.querySelector("main") ?? root.querySelector("body") ?? root;
  const raw = parseRecipeText(textOf(main));
  return { ...raw, title: title(root) ?? raw.title };
}

/** Readable text of a page (for the AI), without menus, scripts and footers. */
export function pageText(html: string | HTMLElement): string {
  const root = typeof html === "string" ? parse(html) : html;
  root.querySelectorAll("script, style, noscript, nav, footer, header, aside, form, iframe, svg").forEach((el) => el.remove());
  const main = root.querySelector("article") ?? root.querySelector("main") ?? root.querySelector("body") ?? root;
  const title = root.querySelector("title")?.text ?? "";
  return `${title}\n${textOf(main)}`.replace(/\n{3,}/g, "\n\n").trim();
}
