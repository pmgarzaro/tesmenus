// Nutrition values of ingredients the built-in table does not know, by Gemini.
import { z } from "zod";
import { generateJson } from "./gemini";

export type EstimatedNutrition = {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  gramsPerUnit: number | null;
};

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          kcal: { type: "number", description: "kcal pour 100 g" },
          protein: { type: "number", description: "protéines en g pour 100 g" },
          carbs: { type: "number", description: "glucides en g pour 100 g" },
          fat: { type: "number", description: "lipides en g pour 100 g" },
          gramsPerUnit: { type: "number", description: "poids moyen en g d'une pièce / unité, 0 si sans objet" },
        },
        required: ["name", "kcal", "protein", "carbs", "fat"],
      },
    },
  },
  required: ["items"],
};

const grams = z.number().finite().min(0);
const VALIDATOR = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      kcal: grams.max(900),
      protein: grams.max(100),
      carbs: grams.max(100),
      fat: grams.max(100),
      gramsPerUnit: grams.max(5000).optional().catch(undefined),
    }),
  ),
});

/** Average values per 100 g (CIQUAL-like) for each name, in the same order. Missing names are left out. */
export async function estimateNutrition(names: string[]): Promise<EstimatedNutrition[]> {
  if (names.length === 0) return [];
  const { items } = await generateJson({
    prompt: [
      "Tu es diététicien. Pour chaque ingrédient de cuisine ci-dessous, donne les valeurs nutritionnelles moyennes",
      "pour 100 g (produit tel qu'acheté, cru sauf s'il est vendu cuit), comme la table CIQUAL :",
      "kcal, protéines, glucides et lipides en grammes, et le poids moyen d'une pièce en grammes",
      "(un œuf, un oignon, une boîte…) ou 0 si cela n'a pas de sens. Garde exactement les noms donnés.",
      "",
      ...names.map((n) => `- ${n}`),
    ].join("\n"),
    schema: SCHEMA,
    validator: VALIDATOR,
  });
  const byName = new Map(items.map((i) => [i.name.trim().toLowerCase(), i]));
  return names.flatMap((name, idx) => {
    const i = byName.get(name.trim().toLowerCase()) ?? (items.length === names.length ? items[idx] : undefined);
    return i ? [{ ...i, name, gramsPerUnit: i.gramsPerUnit ? i.gramsPerUnit : null }] : [];
  });
}
