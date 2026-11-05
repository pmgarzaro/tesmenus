import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const MEAL_TYPES = ["entree", "plat", "dessert", "autre"] as const;
export const SOURCE_TYPES = ["photo", "url", "manuel"] as const;
export const AISLES = [
  "fruits-legumes",
  "boucherie",
  "poissonnerie",
  "cremerie",
  "epicerie",
  "surgeles",
  "boulangerie",
  "autre",
] as const;
export const UNITS = [
  "g",
  "kg",
  "ml",
  "cl",
  "l",
  "piece",
  "cas",
  "cac",
  "pincee",
  "botte",
  "gousse",
  "boite",
  "tranche",
  "sachet",
] as const;
export const STEP_TYPES = ["preparation", "cuisson", "repos"] as const;
export const SLOTS = ["midi", "soir"] as const;

const createdAt = () =>
  text("created_at").notNull().default(sql`(datetime('now'))`);

// Every piece of data belongs to a household; its members share it.
export const households = sqliteTable("households", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

const householdId = () =>
  integer("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" });

export const recipes = sqliteTable("recipes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: householdId(),
  title: text("title").notNull(),
  description: text("description"),
  servings: integer("servings").notNull().default(4),
  prepMinutes: integer("prep_minutes"),
  cookMinutes: integer("cook_minutes"),
  mealType: text("meal_type", { enum: MEAL_TYPES }).notNull().default("plat"),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  sourceType: text("source_type", { enum: SOURCE_TYPES }).notNull().default("manuel"),
  sourceUrl: text("source_url"),
  // JSON array of paths relative to data/uploads (several pages per recipe).
  imagePaths: text("image_paths", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  notes: text("notes"),
  fridgeDays: integer("fridge_days"),
  freezable: integer("freezable", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const ingredients = sqliteTable(
  "ingredients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    householdId: householdId(),
    name: text("name").notNull(), // normalised name, e.g. "oignon"
    aisle: text("aisle", { enum: AISLES }).notNull().default("autre"),
    // Nutrition per 100 g, filled by hand or by the AI when the built-in table
    // does not know the ingredient. gramsPerUnit: weight of one piece.
    kcal: real("kcal"),
    protein: real("protein"),
    carbs: real("carbs"),
    fat: real("fat"),
    gramsPerUnit: real("grams_per_unit"),
    nutritionSource: text("nutrition_source", { enum: ["manuel", "ia"] }),
  },
  (t) => [uniqueIndex("ingredients_household_name_idx").on(t.householdId, t.name)],
);

export const recipeIngredients = sqliteTable(
  "recipe_ingredients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    ingredientId: integer("ingredient_id")
      .notNull()
      .references(() => ingredients.id),
    position: integer("position").notNull().default(0),
    quantity: real("quantity"),
    unit: text("unit", { enum: UNITS }),
    originalLabel: text("original_label"),
    optional: integer("optional", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("recipe_ingredients_recipe_idx").on(t.recipeId)],
);

export const recipeSteps = sqliteTable(
  "recipe_steps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    durationMinutes: integer("duration_minutes"),
    type: text("type", { enum: STEP_TYPES }).notNull().default("preparation"),
    equipment: text("equipment"), // four, plaque, robot…
    // Oven temperature, used by batch cooking to group oven steps.
    temperature: integer("temperature"),
  },
  (t) => [index("recipe_steps_recipe_idx").on(t.recipeId)],
);

export const mealPlans = sqliteTable("meal_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: householdId(),
  startDate: text("start_date").notNull(), // YYYY-MM-DD
  days: integer("days").notNull(),
  // Generation settings (slots, servings, constraints…) reused by rerolls.
  options: text("options", { mode: "json" }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  createdAt: createdAt(),
});

/** A saved week, reusable at any start date. Days are 0-based offsets. */
export type TemplateEntry = {
  day: number;
  slot: (typeof SLOTS)[number];
  recipeId: number | null;
  servings: number | null;
  isEatingOut: boolean;
  /** Cell whose leftovers cover this meal. */
  leftoverOf: { day: number; slot: (typeof SLOTS)[number] } | null;
};

export const planTemplates = sqliteTable("plan_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: householdId(),
  name: text("name").notNull(),
  days: integer("days").notNull(),
  slots: text("slots", { mode: "json" }).$type<(typeof SLOTS)[number][]>().notNull(),
  entries: text("entries", { mode: "json" }).$type<TemplateEntry[]>().notNull(),
  createdAt: createdAt(),
});

export const mealPlanEntries = sqliteTable(
  "meal_plan_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    planId: integer("plan_id")
      .notNull()
      .references(() => mealPlans.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    slot: text("slot", { enum: SLOTS }).notNull(),
    recipeId: integer("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    servings: integer("servings"),
    isLeftover: integer("is_leftover", { mode: "boolean" }).notNull().default(false),
    isEatingOut: integer("is_eating_out", { mode: "boolean" }).notNull().default(false),
    // Entry whose leftovers cover this meal.
    sourceEntryId: integer("source_entry_id"),
  },
  (t) => [index("meal_plan_entries_plan_idx").on(t.planId)],
);

export const shoppingListItems = sqliteTable(
  "shopping_list_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    planId: integer("plan_id")
      .notNull()
      .references(() => mealPlans.id, { onDelete: "cascade" }),
    ingredientId: integer("ingredient_id").references(() => ingredients.id),
    quantity: real("quantity"),
    unit: text("unit", { enum: UNITS }),
    checked: integer("checked", { mode: "boolean" }).notNull().default(false),
    // "Déjà au placard" for this list only.
    removed: integer("removed", { mode: "boolean" }).notNull().default(false),
    manual: integer("manual", { mode: "boolean" }).notNull().default(false),
    freeLabel: text("free_label"),
    aisle: text("aisle", { enum: AISLES }), // manual items
  },
  (t) => [index("shopping_list_items_plan_idx").on(t.planId)],
);

export const batchSessions = sqliteTable("batch_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: householdId(),
  planId: integer("plan_id").references(() => mealPlans.id, { onDelete: "set null" }),
  selection: text("selection", { mode: "json" }).$type<unknown>().notNull(),
  content: text("content", { mode: "json" }).$type<unknown>().notNull(),
  createdAt: createdAt(),
});

export const settings = sqliteTable(
  "settings",
  {
    householdId: householdId(),
    key: text("key").notNull(),
    value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.key] })],
);

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: householdId(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(), // stored lowercase
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

// One-time invitation links: after the first account, sign-up needs one.
// With a household the newcomer joins it, without one they start their own.
export const invites = sqliteTable("invites", {
  token: text("token").primaryKey(),
  householdId: integer("household_id").references(() => households.id, { onDelete: "cascade" }),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  usedAt: text("used_at"),
});

// ---------------------------------------------------------------------------
// Food journal and nutrition targets. Personal (per user), not per household:
// each member logs what they actually ate. Written by the app and by Claude
// through the MCP server (/mcp).

export const LOG_SLOTS = ["breakfast", "lunch", "snack", "dinner", "dessert"] as const;

export const mealLog = sqliteTable(
  "meal_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD, APP_TIMEZONE
    slot: text("slot", { enum: LOG_SLOTS }).notNull(),
    recipeId: integer("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    servings: real("servings"),
    description: text("description").notNull(),
    estKcal: real("est_kcal"),
    estProteinG: real("est_protein_g"),
    estCarbsG: real("est_carbs_g"),
    estFatG: real("est_fat_g"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("meal_log_user_date_idx").on(t.userId, t.date)],
);

export const nutritionTargets = sqliteTable("nutrition_targets", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  kcalPerDay: real("kcal_per_day").notNull(),
  proteinG: real("protein_g").notNull(),
  // Optional: not everyone tracks carbs and fat.
  carbsG: real("carbs_g"),
  fatG: real("fat_g"),
  goalWeightKg: real("goal_weight_kg"),
  notes: text("notes"),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

/** Weight and body measurements: at most one row per user and day. */
export const bodyLog = sqliteTable(
  "body_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD, APP_TIMEZONE
    weightKg: real("weight_kg"),
    bodyFatPct: real("body_fat_pct"), // from a smart scale, if any
    waistCm: real("waist_cm"), // at the navel
    hipsCm: real("hips_cm"),
    chestCm: real("chest_cm"),
    armCm: real("arm_cm"),
    thighCm: real("thigh_cm"),
    neckCm: real("neck_cm"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("body_log_user_date_idx").on(t.userId, t.date)],
);

// ---------------------------------------------------------------------------
// OAuth 2.1 for the MCP server (claude.ai custom connectors). Secrets, codes
// and tokens are stored as SHA-256 hashes only.

export const oauthClients = sqliteTable("oauth_clients", {
  clientId: text("client_id").primaryKey(),
  clientSecretHash: text("client_secret_hash"), // null for public clients (PKCE only)
  clientName: text("client_name"),
  redirectUris: text("redirect_uris", { mode: "json" }).$type<string[]>().notNull(),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull().default("none"),
  createdAt: createdAt(),
});

export const oauthCodes = sqliteTable("oauth_codes", {
  codeHash: text("code_hash").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.clientId, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  scope: text("scope"),
  resource: text("resource"),
  expiresAt: integer("expires_at").notNull(), // epoch ms
});

export const oauthTokens = sqliteTable(
  "oauth_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    kind: text("kind", { enum: ["access", "refresh"] }).notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope"),
    expiresAt: integer("expires_at").notNull(), // epoch ms
    createdAt: createdAt(),
  },
  (t) => [index("oauth_tokens_user_idx").on(t.userId)],
);
