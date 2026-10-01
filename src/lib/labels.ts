import type { AISLES, MEAL_TYPES, STEP_TYPES } from "@/db/schema";

export const AISLE_LABELS: Record<(typeof AISLES)[number], string> = {
  "fruits-legumes": "Fruits & légumes",
  boucherie: "Boucherie",
  poissonnerie: "Poissonnerie",
  cremerie: "Crèmerie",
  epicerie: "Épicerie",
  surgeles: "Surgelés",
  boulangerie: "Boulangerie",
  autre: "Autre",
};

export const MEAL_TYPE_LABELS: Record<(typeof MEAL_TYPES)[number], string> = {
  entree: "Entrée",
  plat: "Plat",
  dessert: "Dessert",
  autre: "Autre",
};

export const STEP_TYPE_LABELS: Record<(typeof STEP_TYPES)[number], string> = {
  preparation: "Préparation",
  cuisson: "Cuisson",
  repos: "Repos",
};

export const EQUIPMENT_SUGGESTIONS = [
  "four",
  "plaque",
  "robot",
  "mixeur",
  "micro-ondes",
  "cocotte-minute",
  "friteuse à air",
];

export function formatMinutes(min: number | null | undefined): string {
  if (!min) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}
