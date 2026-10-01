import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { SLOTS } from "@/db/schema";

export const settingsSchema = z.object({
  defaultDays: z.number().int().min(1).max(14),
  activeSlots: z.array(z.enum(SLOTS)).min(1),
  people: z.number().int().min(1).max(12),
  servingsPerRecipe: z.number().int().min(1).max(24),
  // A recipe cooked in the evening covers the next day's lunch.
  dinnerCoversNextLunch: z.boolean(),
  /** Ingredients always at home: left out of shopping lists. */
  pantry: z.array(z.string()).max(200),
  /** Use Gemini when GEMINI_API_KEY is set (recipes are then sent to Google). */
  aiEnabled: z.boolean(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  defaultDays: 5,
  activeSlots: ["midi", "soir"],
  people: 2,
  servingsPerRecipe: 4,
  dinnerCoversNextLunch: true,
  pantry: ["sel", "poivre", "eau"],
  aiEnabled: true,
};

export function getSettings(householdId: number): Settings {
  const rows = getDb()
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.householdId, householdId))
    .all();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const parsed = settingsSchema.partial().safeParse(stored);
  return { ...DEFAULT_SETTINGS, ...(parsed.success ? parsed.data : {}) };
}

export function saveSettings(householdId: number, values: Partial<Settings>) {
  const valid = settingsSchema.partial().parse(values);
  const db = getDb();
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(valid)) {
      tx.insert(schema.settings)
        .values({ householdId, key, value })
        .onConflictDoUpdate({
          target: [schema.settings.householdId, schema.settings.key],
          set: { value },
        })
        .run();
    }
  });
}
