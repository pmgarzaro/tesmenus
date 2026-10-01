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
    manual: integer("manual", { mode: "boolean" }).notNull().default(false),
    freeLabel: text("free_label"),
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
