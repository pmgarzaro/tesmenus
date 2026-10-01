// Post-it colours on the fridge door: by kind of dish, so the library reads at a glance.
import { fold } from "@/lib/recipes/normalize";

export type NoteStyle = { note: string; magnet: string };

const KINDS: [RegExp, NoteStyle][] = [
  [/\b(poisson|fruits de mer)\b/, { note: "note-blue", magnet: "magnet-blue" }],
  [/\b(viande|boeuf|porc|poulet|volaille|agneau|veau)\b/, { note: "note-peach", magnet: "magnet-red" }],
  [/\b(vege|vegetarien|vegan)\b/, { note: "note-mint", magnet: "magnet-green" }],
  [/\b(dessert|gouter|sucre)\b/, { note: "note-lilac", magnet: "magnet-violet" }],
];

export function noteForTags(tags: string[], mealType?: string): NoteStyle {
  const t = fold([...tags, mealType === "dessert" ? "dessert" : ""].join(" "));
  return KINDS.find(([re]) => re.test(t))?.[1] ?? { note: "note-yellow", magnet: "magnet-yellow" };
}

const CYCLE: NoteStyle[] = [
  { note: "note-yellow", magnet: "magnet-red" },
  { note: "note-mint", magnet: "magnet-blue" },
  { note: "note-peach", magnet: "magnet-green" },
  { note: "note-blue", magnet: "magnet-yellow" },
  { note: "note-lilac", magnet: "magnet-red" },
];

/** Varied colours for a series of notes (days of the week…). */
export const noteAt = (i: number): NoteStyle => CYCLE[i % CYCLE.length];
/** Slight, alternating tilt: hand-placed, not messy. */
export const tiltAt = (i: number) => (i % 3 === 0 ? "tilt-l" : i % 3 === 1 ? "tilt-r" : "");
