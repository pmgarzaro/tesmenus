// MCP server: the tools Claude uses to read the meal plan and recipes, and to
// keep the user's food journal. One server per request (stateless transport);
// `owner` comes from the verified OAuth/bearer token.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { LOG_SLOTS } from "@/db/schema";
import { dateSchema, slotSchema } from "@/lib/journal/input";
import {
  JournalError,
  type Owner,
  addLogEntry,
  deleteLogEntry,
  getTargets,
  setTargets,
  updateLogEntry,
} from "@/lib/journal/repo";
import { addDays, today } from "@/lib/planning/dates";
import { MEASURES } from "@/lib/body/measures";
import { deleteBodyEntry, saveBodyEntry } from "@/lib/body/repo";
import { createRecipeFromMcp, createRecipeShape } from "./recipes";
import { createPlanFromMcp, createPlanShape, setMealShape, setPlannedMeal, shoppingListView } from "./planning";
import { bodyEntryView, bodyLogView, logEntryView, mealLogView, plannedMeals, recipeView, searchRecipes, targetsView } from "./data";

export const SERVER_INFO = { name: "tesmenus", version: "1.0.0" };

const INSTRUCTIONS = `Tes menus : planning de repas, recettes et journal alimentaire de l'utilisateur.
Dates au format YYYY-MM-DD, fuseau Europe/Paris ; sans date, c'est aujourd'hui (${"<today>"}).
Pour « qu'est-ce que je mange ce soir » : get_planned_meals, puis get_recipe avec servings=1 (une portion pour une personne).
Pour tenir le journal : log_meal avec tes estimations est_kcal, est_protein_g, est_carbs_g (glucides) et est_fat_g (lipides). Pour un bilan : get_meal_log + get_nutrition_targets.
Planning : create_meal_plan crée un planning (tirage automatique de l'app, repas choisis, ou les deux), set_planned_meal change un repas, get_shopping_list donne les courses d'une période.
Pour ajouter une recette à la bibliothèque du foyer : create_recipe (vérifie d'abord avec search_recipes qu'elle n'existe pas).
Poids et mensurations : log_body_measurement pour noter, get_body_measurements pour suivre la tendance (moyenne 7 jours, rythme par semaine, évolution du tour de taille).
N'appelle set_nutrition_targets que si l'utilisateur le demande explicitement.`;

const optionalDate = dateSchema.optional().describe("Date YYYY-MM-DD (Europe/Paris). Par défaut : aujourd'hui.");

function ok(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data as Record<string, unknown>,
  };
}

function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/** Runs a tool body; expected errors become a clear tool error, not a crash. */
function run(fn: () => unknown): CallToolResult {
  try {
    return ok(fn());
  } catch (err) {
    if (err instanceof JournalError) return fail(err.message);
    if (err instanceof z.ZodError) return fail(err.issues.map((i) => `${i.path.join(".") || "entrée"} : ${i.message}`).join(" ; "));
    console.error("[mcp] tool error", err instanceof Error ? err.message : err);
    return fail("Erreur interne du serveur");
  }
}

const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

export function createMcpServer(owner: Owner): McpServer {
  const server = new McpServer(SERVER_INFO, {
    instructions: INSTRUCTIONS.replace("<today>", today()),
  });

  server.registerTool(
    "get_planned_meals",
    {
      title: "Repas prévus",
      description:
        "Repas prévus au planning du foyer pour une date (petit-déjeuner = breakfast, déjeuner = lunch, dîner = dinner). " +
        "servings_planned = portions cuisinées pour tout le foyer (souvent plus que le nombre de personnes quand le dîner couvre les restes du lendemain midi). " +
        "Pour les quantités mangées par l'utilisateur, appeler get_recipe avec servings=1.",
      inputSchema: { date: optionalDate },
      annotations: readOnly,
    },
    ({ date }) => run(() => plannedMeals(owner, date ?? today())),
  );

  server.registerTool(
    "get_recipe",
    {
      title: "Recette",
      description:
        "Recette complète avec ses ingrédients recalculés pour `servings` portions (mêmes quantités arrondies que dans l'app). " +
        "Chaque ingrédient : { amount, unit, name } ; unit null = pièces. " +
        "app_nutrition_per_serving est l'estimation de l'app (table d'ingrédients, coverage < 1 = incomplète), à recouper.",
      inputSchema: {
        recipe_id: z.number().int().positive().describe("Identifiant de la recette"),
        servings: z.number().gt(0).max(50).optional().describe("Nombre de portions. Par défaut : portions de base de la recette."),
        include_steps: z.boolean().optional().describe("Inclure les étapes de préparation (false par défaut)"),
      },
      annotations: readOnly,
    },
    ({ recipe_id, servings, include_steps }) =>
      run(() => {
        const recipe = recipeView(owner, recipe_id, servings, include_steps ?? false);
        if (!recipe) throw new JournalError(`Recette ${recipe_id} introuvable`);
        return recipe;
      }),
  );

  server.registerTool(
    "search_recipes",
    {
      title: "Chercher une recette",
      description:
        "Recherche dans les recettes du foyer : chaque mot doit apparaître dans le nom, un tag ou un ingrédient (accents ignorés). Requête vide = toutes les recettes.",
      inputSchema: {
        query: z.string().max(200).describe("Mots recherchés, ex. « chili » ou « poulet curry »"),
        limit: z.number().int().min(1).max(50).optional().describe("Nombre maximum de résultats (10 par défaut)"),
      },
      annotations: readOnly,
    },
    ({ query, limit }) => run(() => searchRecipes(owner, query, limit ?? 10)),
  );

  server.registerTool(
    "create_meal_plan",
    {
      title: "Créer un planning",
      description:
        "Crée un planning de repas (petit-déjeuner / midi / soir) pour le foyer. Sans `meals`, l'app tire les recettes elle-même " +
        "(alternance viande / poisson / végé, pas de répétition, restes du dîner le midi suivant ; petits-déjeuners parmi les recettes de type petit-dejeuner, " +
        "préparés pour plusieurs matins selon les réglages) en respectant les contraintes. " +
        "Avec `meals`, place les recettes choisies, et complète le reste si fill_rest. " +
        "Les plannings ne peuvent pas se chevaucher : par défaut il commence le lendemain du planning en cours. " +
        "Utiliser search_recipes pour trouver les recipe_id. À faire seulement à la demande de l'utilisateur.",
      inputSchema: createPlanShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (a) => run(() => createPlanFromMcp(owner, a)),
  );

  server.registerTool(
    "set_planned_meal",
    {
      title: "Changer un repas du planning",
      description:
        "Modifie un repas (date + lunch/dinner) d'un planning existant : autre recette, repas extérieur, restes d'un repas précédent, " +
        "vider, ou portions. Une seule action à la fois (servings peut accompagner recipe_id). Renvoie le planning à jour.",
      inputSchema: setMealShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (a) => run(() => setPlannedMeal(owner, a)),
  );

  server.registerTool(
    "get_shopping_list",
    {
      title: "Liste de courses",
      description:
        "Ingrédients à acheter pour les repas cuisinés entre deux dates (tous plannings confondus), additionnés et convertis comme dans l'app, " +
        "regroupés par rayon. Par défaut : les 7 prochains jours. Ne tient pas compte des cases cochées dans l'app.",
      inputSchema: {
        date_from: dateSchema.optional().describe("Début (aujourd'hui par défaut)"),
        date_to: dateSchema.optional().describe("Fin incluse (date_from + 6 jours par défaut)"),
      },
      annotations: readOnly,
    },
    ({ date_from, date_to }) =>
      run(() => {
        const from = date_from ?? today();
        return shoppingListView(owner, from, date_to ?? addDays(from, 6));
      }),
  );

  server.registerTool(
    "create_recipe",
    {
      title: "Créer une recette",
      description:
        "Ajoute une recette à la bibliothèque du foyer (visible et modifiable dans l'app, utilisable par le planning et la liste de courses). " +
        "Quantités pour `servings` portions, une ligne par ingrédient avec { amount, unit, name }. " +
        "Les tags (viande, poisson, végé…) servent à l'alternance du planning. " +
        "Ne crée que si l'utilisateur le demande ; ne modifie ni ne supprime les recettes existantes. Renvoie la recette créée.",
      inputSchema: createRecipeShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (a) =>
      run(() => {
        const id = createRecipeFromMcp(owner, a);
        return recipeView(owner, id, undefined, true)!;
      }),
  );

  const kcal = z.number().min(0).max(10_000);
  const grams = z.number().min(0).max(1_000);

  server.registerTool(
    "log_meal",
    {
      title: "Noter un repas",
      description:
        "Ajoute une entrée au journal alimentaire de l'utilisateur (ce qu'il a réellement mangé, recette de l'app ou non). " +
        "Renseigner est_kcal, est_protein_g, est_carbs_g et est_fat_g avec ton estimation. Si c'est une recette de l'app, donner recipe_id et servings (portions mangées).",
      inputSchema: {
        date: optionalDate,
        slot: slotSchema.describe(`Créneau : ${LOG_SLOTS.join(" | ")}`),
        description: z.string().min(1).max(500).describe("Texte libre : « 1 egg muffin + café au lait »"),
        recipe_id: z.number().int().positive().nullable().optional().describe("Recette de l'app, si c'en est une"),
        servings: z.number().gt(0).max(50).nullable().optional().describe("Portions mangées (avec recipe_id)"),
        est_kcal: kcal.nullable().optional().describe("Estimation des calories (kcal)"),
        est_protein_g: grams.nullable().optional().describe("Estimation des protéines (g)"),
        est_carbs_g: grams.nullable().optional().describe("Estimation des glucides (g)"),
        est_fat_g: grams.nullable().optional().describe("Estimation des lipides (g)"),
        notes: z.string().max(1000).nullable().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (a) =>
      run(() =>
        logEntryView(
          addLogEntry(owner, {
            date: a.date ?? today(),
            slot: a.slot,
            description: a.description,
            recipeId: a.recipe_id ?? null,
            servings: a.servings ?? null,
            estKcal: a.est_kcal ?? null,
            estProteinG: a.est_protein_g ?? null,
            estCarbsG: a.est_carbs_g ?? null,
            estFatG: a.est_fat_g ?? null,
            notes: a.notes ?? null,
          }),
        ),
      ),
  );

  server.registerTool(
    "update_meal_log",
    {
      title: "Corriger un repas noté",
      description: "Corrige une entrée du journal (quantité, estimation, créneau…). Seuls les champs fournis sont modifiés ; null efface un champ facultatif.",
      inputSchema: {
        id: z.number().int().positive().describe("Identifiant de l'entrée (voir get_meal_log)"),
        date: dateSchema.optional(),
        slot: slotSchema.optional(),
        description: z.string().min(1).max(500).optional(),
        recipe_id: z.number().int().positive().nullable().optional(),
        servings: z.number().gt(0).max(50).nullable().optional(),
        est_kcal: kcal.nullable().optional(),
        est_protein_g: grams.nullable().optional(),
        est_carbs_g: grams.nullable().optional(),
        est_fat_g: grams.nullable().optional(),
        notes: z.string().max(1000).nullable().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (a) =>
      run(() =>
        logEntryView(
          updateLogEntry(owner, a.id, {
            date: a.date,
            slot: a.slot,
            description: a.description,
            recipeId: a.recipe_id,
            servings: a.servings,
            estKcal: a.est_kcal,
            estProteinG: a.est_protein_g,
            estCarbsG: a.est_carbs_g,
            estFatG: a.est_fat_g,
            notes: a.notes,
          }),
        ),
      ),
  );

  server.registerTool(
    "delete_meal_log",
    {
      title: "Supprimer un repas noté",
      description: "Supprime une entrée du journal alimentaire.",
      inputSchema: { id: z.number().int().positive() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ id }) =>
      run(() => {
        if (!deleteLogEntry(owner, id)) throw new JournalError(`Entrée ${id} introuvable dans le journal`);
        return { deleted: true };
      }),
  );

  server.registerTool(
    "get_meal_log",
    {
      title: "Journal alimentaire",
      description:
        "Journal d'une date ou d'une période (92 jours max), avec les totaux estimés par jour. " +
        "entries_without_estimate = entrées sans kcal ou protéines, entries_without_macros = sans glucides ou lipides (non comptées dans ces totaux : à estimer puis compléter via update_meal_log). " +
        "Sans date : aujourd'hui.",
      inputSchema: {
        date_from: optionalDate,
        date_to: dateSchema.optional().describe("Fin de période incluse (par défaut = date_from)"),
      },
      annotations: readOnly,
    },
    ({ date_from, date_to }) => run(() => mealLogView(owner, date_from ?? date_to ?? today(), date_to)),
  );

  server.registerTool(
    "get_nutrition_targets",
    {
      title: "Objectifs nutritionnels",
      description: "Objectifs quotidiens de l'utilisateur : kcal, protéines, et glucides / lipides s'il les a fixés (null sinon). is_default = l'utilisateur ne les a pas encore personnalisés.",
      inputSchema: {},
      annotations: readOnly,
    },
    () => run(() => targetsView(getTargets(owner))),
  );

  server.registerTool(
    "set_nutrition_targets",
    {
      title: "Modifier les objectifs",
      description:
        "Modifie les objectifs quotidiens. À appeler UNIQUEMENT si l'utilisateur le demande explicitement. " +
        "carbs_g / fat_g / goal_weight_kg omis = inchangés, null = pas d'objectif.",
      inputSchema: {
        kcal_per_day: z.number().min(800).max(10_000),
        protein_g: z.number().min(0).max(1_000),
        carbs_g: z.number().min(0).max(2_000).nullable().optional().describe("Glucides (g / jour)"),
        fat_g: z.number().min(0).max(1_000).nullable().optional().describe("Lipides (g / jour)"),
        goal_weight_kg: z.number().min(20).max(400).nullable().optional().describe("Poids cible (kg)"),
        notes: z.string().max(1000).nullable().optional().describe("Ex. « calculé sur 85 kg, sédentaire »"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (a) =>
      run(() => {
        const current = getTargets(owner);
        return targetsView(
          setTargets(owner, {
            kcalPerDay: a.kcal_per_day,
            proteinG: a.protein_g,
            carbsG: a.carbs_g === undefined ? current.carbsG : a.carbs_g,
            fatG: a.fat_g === undefined ? current.fatG : a.fat_g,
            goalWeightKg: a.goal_weight_kg === undefined ? current.goalWeightKg : a.goal_weight_kg,
            notes: a.notes === undefined ? (current.isDefault ? null : current.notes) : a.notes,
          }),
        );
      }),
  );

  const measureShape = Object.fromEntries(
    MEASURES.map((m) => [
      m.api,
      z.number().min(m.min).max(m.max).nullable().optional().describe(`${m.label} (${m.unit})`),
    ]),
  );

  server.registerTool(
    "log_body_measurement",
    {
      title: "Noter poids / mensurations",
      description:
        "Enregistre le poids et/ou des mensurations de l'utilisateur pour un jour (un relevé par jour). " +
        "Les champs fournis remplacent ceux du même jour, les autres sont conservés ; null efface une valeur. " +
        "Poids idéalement le matin à jeun ; tour de taille au niveau du nombril.",
      inputSchema: { date: optionalDate, ...measureShape, notes: z.string().max(1000).nullable().optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (a) =>
      run(() => {
        const values = Object.fromEntries(MEASURES.map((m) => [m.key, (a as Record<string, unknown>)[m.api]]));
        return bodyEntryView(saveBodyEntry(owner, { date: a.date ?? today(), ...values, notes: a.notes }));
      }),
  );

  server.registerTool(
    "get_body_measurements",
    {
      title: "Suivi du poids et des mensurations",
      description:
        "Relevés de poids et mensurations sur une période (90 derniers jours par défaut, 731 jours max), avec : " +
        "weight_trend (moyenne glissante sur 7 jours, plus fiable que la pesée du jour), " +
        "summary par mesure (premier / dernier relevé, évolution, rate_per_week sur les 28 derniers jours), " +
        "latest_weight (toutes dates) et goal_weight_kg. Une perte de gras se voit surtout au tour de taille qui baisse.",
      inputSchema: {
        date_from: dateSchema.optional().describe("Début (par défaut : il y a 89 jours)"),
        date_to: dateSchema.optional().describe("Fin incluse (par défaut : aujourd'hui)"),
      },
      annotations: readOnly,
    },
    ({ date_from, date_to }) =>
      run(() => {
        const to = date_to ?? today();
        return bodyLogView(owner, date_from ?? addDays(to, -89), to);
      }),
  );

  server.registerTool(
    "delete_body_measurement",
    {
      title: "Supprimer un relevé",
      description: "Supprime le relevé de poids / mensurations d'une date.",
      inputSchema: { date: dateSchema },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ date }) =>
      run(() => {
        if (!deleteBodyEntry(owner, date)) throw new JournalError(`Aucun relevé le ${date}`);
        return { deleted: true };
      }),
  );

  return server;
}
