// Heuristics to type a recipe step from its text (no LLM). Shared by manual
// entry and the imports. Runs on server and client.
import type { STEP_TYPES } from "@/db/schema";
import { fold } from "./normalize";

export type StepGuess = {
  type: (typeof STEP_TYPES)[number];
  durationMinutes: number | null;
  equipment: string | null;
  temperature: number | null;
};

const COOKING =
  /\b(cui(re|sez|sson|t)|enfourne|mijot|rotir|roti|griller|grill|bouillir|bouillon|frire|frit|saisi|dore[rz]?|faire revenir|faites revenir|revenir|fondre|caramelis|reduire|chauffer|chauffe|poele|saute[rz]?|bouillante|ebullition|braiser|pocher|blanchir|torrefi)/;
const RESTING = /\b(repos|reposer|refrigerat|frigo|mariner|marinade|lever|pousser|refroidir|tiedir|figer|prendre au frais)/;

const EQUIPMENT: [string, RegExp][] = [
  ["four", /\b(four|enfourne|gratiner|thermostat|th\.? ?\d)/],
  ["robot", /\b(robot|petrin|petrir au robot|thermomix|batteur)/],
  ["mixeur", /\b(mixe[rz]?|mixeur|blender|plongeant)/],
  ["micro-ondes", /\bmicro-?ondes?\b/],
  ["cocotte-minute", /\b(cocotte-minute|autocuiseur)/],
  ["plaque", /\b(poele|casserole|sauteuse|cocotte|wok|faitout|marmite|feu (doux|vif|moyen)|faire revenir|faites revenir|plaque)/],
];

/** Longest duration mentioned: "20 min", "1 h 30", "1h", "2 heures". */
function parseDuration(t: string): number | null {
  let best: number | null = null;
  const keep = (m: number) => (best = Math.max(best ?? 0, m));
  for (const m of t.matchAll(/(\d+)\s*(?:h|heures?)\s*(\d+)?(?!\d)/g)) {
    keep(Number(m[1]) * 60 + Number(m[2] ?? 0));
  }
  for (const m of t.matchAll(/(\d+)\s*(?:-|a)?\s*(\d+)?\s*(?:min|minutes?|mn)\b/g)) {
    keep(Number(m[2] ?? m[1]));
  }
  return best;
}

/** "180 °C", "180°", "th. 6" (×30). */
function parseTemperature(t: string): number | null {
  const c = t.match(/(\d{2,3})\s*°\s*c?/) ?? t.match(/(\d{2,3})\s*degres/);
  if (c) return Number(c[1]);
  const th = t.match(/\b(?:th\.?|thermostat)\s*(\d{1,2})\b/);
  if (th) return Number(th[1]) * 30;
  // "enfourner à 200" (unit lost or omitted): plausible oven temperatures only.
  const bare = t.match(/\ba\s+(\d{3})\b(?!\s*(?:g|ml|cl|min))/);
  return bare && Number(bare[1]) >= 100 && Number(bare[1]) <= 300 ? Number(bare[1]) : null;
}

export function guessStep(text: string): StepGuess {
  const t = fold(text);
  const equipment = EQUIPMENT.find(([, re]) => re.test(t))?.[0] ?? null;
  const type: StepGuess["type"] = RESTING.test(t)
    ? "repos"
    : COOKING.test(t) || equipment === "four"
      ? "cuisson"
      : "preparation";
  return {
    type: /\bprechauff/.test(t) ? "preparation" : type,
    durationMinutes: parseDuration(t),
    equipment,
    temperature: equipment === "four" ? parseTemperature(t) : null,
  };
}

/** Splits pasted instructions into steps: one per line, numbering removed. */
export function splitSteps(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(?:étape\s*\d+\s*[.,):-]?|\d+\s*[.,)/:-](?!\d))\s*/i, "").replace(/^\s*[-•*·]\s*/, "").trim())
    .filter(Boolean);
}
