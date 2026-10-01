import { parse } from "node-html-parser";
import { type ImportResult, buildDraft } from "./build";
import { ImportError, fetchPage } from "./fetch";
import { extractHtmlRecipe } from "./html";
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

export async function importFromUrl(url: string): Promise<ImportResult> {
  const { html, finalUrl } = await fetchPage(url);
  const result = importFromHtml(html, url.trim() || finalUrl);
  if (result.draft.ingredients.length === 0 && result.draft.steps.length === 0) {
    throw new ImportError("Aucune recette trouvée sur cette page. Essaie « Coller un texte » ou la saisie manuelle.");
  }
  return result;
}

export function importFromText(text: string): ImportResult {
  return buildDraft(parseRecipeText(text), "text");
}
