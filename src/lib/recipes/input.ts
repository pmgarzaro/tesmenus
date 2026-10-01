import { z } from "zod";
import { AISLES, MEAL_TYPES, STEP_TYPES, UNITS } from "@/db/schema";

const optionalInt = (max: number) => z.number().int().min(0).max(max).nullable();

export const ingredientInputSchema = z.object({
  quantity: z.number().positive().max(100000).nullable(),
  unit: z.enum(UNITS).nullable(),
  /** As written in the recipe, without quantity ("oignons jaunes émincés"). */
  label: z.string().trim().min(1, "Ingrédient sans nom").max(200),
  aisle: z.enum(AISLES).nullable(), // null: guess from the name
  optional: z.boolean(),
});

export const stepInputSchema = z.object({
  text: z.string().trim().min(1, "Étape vide").max(2000),
  durationMinutes: optionalInt(24 * 60),
  type: z.enum(STEP_TYPES),
  equipment: z.string().trim().max(40).nullable(),
  temperature: z.number().int().min(30).max(300).nullable(),
});

export const recipeInputSchema = z.object({
  title: z.string().trim().min(1, "Le titre est obligatoire").max(200),
  description: z.string().trim().max(2000).nullable(),
  servings: z.number().int().min(1, "Au moins 1 portion").max(100),
  prepMinutes: optionalInt(24 * 60),
  cookMinutes: optionalInt(48 * 60),
  mealType: z.enum(MEAL_TYPES),
  tags: z.array(z.string().trim().min(1).max(40)).max(30),
  sourceUrl: z.url("URL invalide").nullable(),
  notes: z.string().trim().max(5000).nullable(),
  fridgeDays: z.number().int().min(0).max(30).nullable(),
  freezable: z.boolean(),
  ingredients: z.array(ingredientInputSchema).max(100),
  steps: z.array(stepInputSchema).max(100),
});

export type RecipeInput = z.infer<typeof recipeInputSchema>;
export type IngredientInput = z.infer<typeof ingredientInputSchema>;
export type StepInput = z.infer<typeof stepInputSchema>;

export const EMPTY_RECIPE: RecipeInput = {
  title: "",
  description: null,
  servings: 4,
  prepMinutes: null,
  cookMinutes: null,
  mealType: "plat",
  tags: [],
  sourceUrl: null,
  notes: null,
  fridgeDays: null,
  freezable: false,
  ingredients: [],
  steps: [],
};
