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
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  defaultDays: 5,
  activeSlots: ["midi", "soir"],
  people: 2,
  servingsPerRecipe: 4,
  dinnerCoversNextLunch: true,
};

export function getSettings(): Settings {
  const rows = getDb().select().from(schema.settings).all();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const parsed = settingsSchema.partial().safeParse(stored);
  return { ...DEFAULT_SETTINGS, ...(parsed.success ? parsed.data : {}) };
}

export function saveSettings(values: Settings) {
  const valid = settingsSchema.parse(values);
  const db = getDb();
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(valid)) {
      tx.insert(schema.settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
        .run();
    }
  });
}
