// Recipe creation by Claude: friendly MCP input → the app's RecipeInput,
// validated by the same schema as the recipe form.
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { AISLES, MEAL_TYPES, STEP_TYPES, type UNITS } from "@/db/schema";
import { JournalError, type Owner } from "@/lib/journal/repo";
import { type RecipeInput, recipeInputSchema } from "@/lib/recipes/input";
import { fold } from "@/lib/recipes/normalize";
import { createRecipe } from "@/lib/recipes/repo";
import { guessStep } from "@/lib/recipes/steps";

type Unit = (typeof UNITS)[number];

/** Accepted spellings (accents and case ignored) → stored unit. */
const UNIT_ALIASES: Record<string, Unit | null> = {
  g: "g", gr: "g", gramme: "g", grammes: "g",
  kg: "kg", kilo: "kg", kilos: "kg",
  ml: "ml", cl: "cl", l: "l", litre: "l", litres: "l",
  piece: null, pieces: null, unite: null, "": null,
  cas: "cas", "c. a s.": "cas", "c. a soupe": "cas", "c.a.s": "cas", "cuillere a soupe": "cas", "cuilleres a soupe": "cas", cs: "cas",
  cac: "cac", "c. a c.": "cac", "c. a cafe": "cac", "c.a.c": "cac", "cuillere a cafe": "cac", "cuilleres a cafe": "cac", cc: "cac",
  pincee: "pincee", pincees: "pincee",
  botte: "botte", bottes: "botte",
  gousse: "gousse", gousses: "gousse",
  boite: "boite", boites: "boite",
  tranche: "tranche", tranches: "tranche",
  sachet: "sachet", sachets: "sachet",
};

export const UNIT_HELP = "g, kg, ml, cl, l, c. à soupe, c. à café, pincée, botte, gousse, boîte, tranche, sachet, ou null pour des pièces";

export function parseUnit(raw: string | null | undefined): Unit | null {
  if (raw === null || raw === undefined) return null;
  const key = fold(raw).replace(/\s+/g, " ").trim();
  if (key in UNIT_ALIASES) return UNIT_ALIASES[key];
  throw new JournalError(`Unité inconnue « ${raw} » : utiliser ${UNIT_HELP}`);
}

export const createRecipeShape = {
  name: z.string().min(1).max(200).describe("Titre de la recette"),
  servings: z.number().int().min(1).max(100).describe("Nombre de portions pour les quantités données"),
  ingredients: z
    .array(
      z.object({
        amount: z.number().positive().max(100000).nullable().optional().describe("Quantité (null : « sel, poivre »)"),
        unit: z.string().max(30).nullable().optional().describe(`Unité : ${UNIT_HELP}`),
        name: z.string().min(1).max(200).describe("Ingrédient sans la quantité, ex. « oignons jaunes »"),
        optional: z.boolean().optional(),
        aisle: z.enum(AISLES).optional().describe("Rayon (deviné d'après le nom sinon)"),
      }),
    )
    .min(1)
    .max(100),
  steps: z
    .array(
      z.union([
        z.string().min(1).max(2000),
        z.object({
          text: z.string().min(1).max(2000),
          duration_min: z.number().int().min(0).max(1440).nullable().optional(),
          type: z.enum(STEP_TYPES).optional().describe("preparation | cuisson | repos (deviné sinon)"),
          equipment: z.string().max(40).nullable().optional().describe("four, plaque, robot, mixeur…"),
          temperature: z.number().int().min(30).max(300).nullable().optional().describe("Four, en °C"),
        }),
      ]),
    )
    .max(100)
    .optional()
    .describe("Étapes dans l'ordre ; durée, type et four sont déduits du texte s'ils manquent"),
  meal_type: z.enum(MEAL_TYPES).optional().describe("entree | plat | dessert | autre | petit-dejeuner (plat par défaut ; plat et autre vont au déjeuner / dîner, petit-dejeuner au petit-déjeuner du planning)"),
  tags: z.array(z.string().min(1).max(40)).max(30).optional().describe("Ex. viande, poisson, végé, rapide… (sert à l'alternance du planning)"),
  prep_min: z.number().int().min(0).max(1440).nullable().optional(),
  cook_min: z.number().int().min(0).max(2880).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  fridge_days: z.number().int().min(0).max(30).nullable().optional().describe("Conservation au frigo, en jours"),
  freezable: z.boolean().optional(),
  source_url: z.string().max(2000).nullable().optional(),
  allow_duplicate: z.boolean().optional().describe("Créer même si une recette porte déjà ce nom"),
};

type Args = z.infer<z.ZodObject<typeof createRecipeShape>>;

export function toRecipeInput(a: Args): RecipeInput {
  const input = {
    title: a.name.trim(),
    description: a.description?.trim() || null,
    servings: a.servings,
    prepMinutes: a.prep_min ?? null,
    cookMinutes: a.cook_min ?? null,
    mealType: a.meal_type ?? "plat",
    tags: a.tags ?? [],
    sourceUrl: a.source_url?.trim() || null,
    notes: a.notes?.trim() || null,
    fridgeDays: a.fridge_days ?? null,
    freezable: a.freezable ?? false,
    ingredients: a.ingredients.map((i) => {
      const quantity = i.amount ?? null;
      return {
        quantity,
        unit: quantity === null ? null : parseUnit(i.unit),
        label: i.name,
        aisle: i.aisle ?? null,
        optional: i.optional ?? false,
      };
    }),
    steps: (a.steps ?? []).map((s) => {
      const step = typeof s === "string" ? { text: s } : s;
      const guess = guessStep(step.text);
      return {
        text: step.text,
        durationMinutes: step.duration_min !== undefined ? step.duration_min : guess.durationMinutes,
        type: step.type ?? guess.type,
        equipment: step.equipment !== undefined ? step.equipment : guess.equipment,
        temperature: step.temperature !== undefined ? step.temperature : guess.temperature,
      };
    }),
  };
  return recipeInputSchema.parse(input);
}

/** Creates the recipe in the user's household; refuses a duplicate title unless asked. */
export function createRecipeFromMcp(owner: Owner, a: Args): number {
  const input = toRecipeInput(a);
  if (!a.allow_duplicate) {
    const same = getDb()
      .select({ id: schema.recipes.id, title: schema.recipes.title })
      .from(schema.recipes)
      .where(and(eq(schema.recipes.householdId, owner.householdId)))
      .all()
      .find((r) => fold(r.title) === fold(input.title));
    if (same) {
      throw new JournalError(
        `Une recette « ${same.title} » existe déjà (id ${same.id}). Utilise get_recipe, ou allow_duplicate: true pour en créer une autre.`,
      );
    }
  }
  return createRecipe(owner.householdId, input, "manuel");
}
