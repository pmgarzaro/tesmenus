import { getSettings } from "@/lib/settings";
import { aiConfigured } from "./gemini";

/** AI is used when the server has a key and the household has not turned it off. */
export function aiEnabledFor(householdId: number): boolean {
  return aiConfigured() && getSettings(householdId).aiEnabled;
}
