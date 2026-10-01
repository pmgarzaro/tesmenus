import { parse } from "node-html-parser";
import { type ImportResult, buildDraft } from "./build";
import { ImportError, fetchPage } from "./fetch";
import { AiError } from "@/lib/ai/gemini";
import { extractRecipeFromText } from "@/lib/ai/recipe";
import { extractHtmlRecipe, pageText } from "./html";
import { extractJsonLdRecipe } from "./jsonld";
import { parseRecipeText } from "./text";

export { ImportError };
export type { FieldFlags, Flag, ImportResult } from "./build";

/** Recipe from HTML: JSON-LD first (reliable), then page structure. */
export function importFromHtml(html: string, sourceUrl?: string): ImportResult {
  const root = parse(html);
  const jsonld = extractJsonLdRecipe(root);
  if (jsonld && (jsonld.ingredientLines.length || jsonld.stepTexts.length)) {
    return buildDraft({ ...jsonld, sourceUrl }, "jsonld");
  }
  const result = buildDraft({ ...extractHtmlRecipe(root), sourceUrl }, "html");
  result.warnings.unshift("Page sans données de recette structurées : extraction approximative, relis bien.");
  return result;
}

/** Runs the AI, falling back to the rules (with a warning) if it fails. */
async function withAiFallback(ai: () => Promise<ImportResult>, rules: () => ImportResult): Promise<ImportResult> {
  try {
    return await ai();
  } catch (e) {
    if (!(e instanceof AiError)) console.error("AI import", e);
    const result = rules();
    result.warnings.unshift(`IA indisponible (${e instanceof AiError ? e.message : "erreur"}) : extraction par règles.`);
    return result;
  }
}

export async function importFromUrl(url: string, opts: { ai?: boolean } = {}): Promise<ImportResult> {
  const { html, finalUrl } = await fetchPage(url);
  const source = url.trim() || finalUrl;
  const root = parse(html);
  // Structured data is reliable and free: no AI needed then.
  const jsonld = extractJsonLdRecipe(root);
  const rules = () => importFromHtml(html, source);
  const result =
    opts.ai && !(jsonld && (jsonld.ingredientLines.length || jsonld.stepTexts.length))
      ? await withAiFallback(() => extractRecipeFromText(pageText(root), source), rules)
      : rules();
  if (result.draft.ingredients.length === 0 && result.draft.steps.length === 0) {
    throw new ImportError("Aucune recette trouvée sur cette page. Essaie « Coller un texte » ou la saisie manuelle.");
  }
  return result;
}

export async function importFromText(text: string, opts: { ai?: boolean } = {}): Promise<ImportResult> {
  const rules = () => buildDraft(parseRecipeText(text), "text");
  return opts.ai ? withAiFallback(() => extractRecipeFromText(text), rules) : rules();
}
