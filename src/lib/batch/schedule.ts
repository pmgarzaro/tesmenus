// Batch cooking timeline: list scheduling for one cook (no LLM).
// Active tasks (cutting, sautéing) need the cook; passive ones (oven,
// simmering, resting) run on their own and only hold their equipment.
import type { STEP_TYPES } from "@/db/schema";
import { fold } from "@/lib/recipes/normalize";
import { guessStep } from "@/lib/recipes/steps";

export type BatchStep = {
  text: string;
  durationMinutes: number | null;
  type: (typeof STEP_TYPES)[number];
  equipment: string | null;
  temperature: number | null;
};

export type BatchRecipe = { key: string; title: string; steps: BatchStep[] };

export type TimelineTask = {
  id: string; // `${recipeKey}:${stepIndex}`
  recipeKey: string;
  recipeTitle: string;
  stepIndex: number;
  text: string;
  start: number; // minutes from the start of the session
  end: number;
  active: boolean;
  equipment: string | null;
  temperature: number | null;
  /** Duration missing in the recipe, a default was used. */
  estimated: boolean;
  /** Oven already hot at this temperature: preheating skipped. */
  merged: boolean;
};

export type Schedule = { tasks: TimelineTask[]; totalMinutes: number; separateMinutes: number };

const DEFAULT_MINUTES = { preparation: 10, cuisson: 15, repos: 10 } as const;
const CAPACITY: Record<string, number> = { four: 2, plaque: 3, robot: 1, mixeur: 1, "micro-ondes": 1, "cocotte-minute": 1 };
const PREHEAT = /\bprechauff/;

// Raw meat / fish dirty the board: cut them after vegetables.
const DIRTY = /\b(viande|boeuf|porc|poulet|volaille|dinde|agneau|veau|lardon|jambon|saucisse|poisson|saumon|cabillaud|crevette|filet|escalope|magret)\b/;

type Task = TimelineTask & { duration: number; preds: string[]; priority: number; dirty: number };

function toTasks(r: BatchRecipe): Task[] {
  return r.steps.map((s, i) => {
    const guess = guessStep(s.text);
    const equipment = s.equipment ?? guess.equipment;
    const estimated = s.durationMinutes === null;
    const t = fold(s.text);
    const preheat = PREHEAT.test(t);
    const duration = s.durationMinutes ?? (preheat ? 10 : DEFAULT_MINUTES[s.type]);
    // Long cooking and resting run unattended; short pan work needs the cook.
    const active =
      !preheat && s.type !== "repos" && (s.type === "preparation" ? equipment !== "four" : equipment !== "four" && duration < 15);
    return {
      id: `${r.key}:${i}`,
      recipeKey: r.key,
      recipeTitle: r.title,
      stepIndex: i,
      text: s.text,
      start: 0,
      end: 0,
      active,
      equipment: equipment === "four" || CAPACITY[equipment ?? ""] ? equipment : null,
      temperature: equipment === "four" ? (s.temperature ?? guess.temperature) : null,
      estimated,
      merged: false,
      duration,
      preds: i > 0 ? [`${r.key}:${i - 1}`] : [],
      priority: 0,
      dirty: s.type === "preparation" && DIRTY.test(t) ? 1 : 0,
    };
  });
}

export function scheduleBatch(recipes: BatchRecipe[]): Schedule {
  const tasks = recipes.flatMap(toTasks);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  // Priority: longest chain from this task to the end of its recipe.
  for (const r of recipes) {
    let tail = 0;
    for (let i = r.steps.length - 1; i >= 0; i--) {
      const t = byId.get(`${r.key}:${i}`)!;
      tail += t.duration;
      t.priority = tail;
    }
  }

  const done = new Set<string>();
  const running: Task[] = [];
  const pending = new Set(tasks.map((t) => t.id));
  let now = 0;
  let cookFreeAt = 0;
  // Oven: recipes holding it (from preheating to the end of their oven cooking) and their temperature.
  const ovenHolders = new Map<string, number | null>();
  const ovenHotAt = new Map<number, number>(); // temperature → time it is hot

  const ready = (t: Task) => t.preds.every((p) => done.has(p) && byId.get(p)!.end <= now);
  const inUse = (eq: string) => running.filter((r) => r.equipment === eq && r.end > now);

  const pendingOvenSteps = (recipeKey: string) =>
    [...pending].some((id) => {
      const x = byId.get(id)!;
      return x.recipeKey === recipeKey && x.equipment === "four";
    });

  const canUseEquipment = (t: Task) => {
    if (!t.equipment) return true;
    if (t.equipment === "four") {
      const others = [...ovenHolders].filter(([key]) => key !== t.recipeKey);
      if (others.length >= CAPACITY.four) return false;
      return others.every(([, temp]) => !temp || !t.temperature || temp === t.temperature);
    }
    return inUse(t.equipment).length < (CAPACITY[t.equipment] ?? 1);
  };

  const startTask = (t: Task) => {
    if (t.equipment === "four") {
      const temp = t.temperature ?? ovenHolders.get(t.recipeKey) ?? null;
      if (PREHEAT.test(fold(t.text)) && temp !== null && ovenHotAt.has(temp)) {
        // Oven already heating / hot at this temperature: just wait until it is hot.
        t.duration = Math.max(0, ovenHotAt.get(temp)! - now);
        t.merged = true;
      }
      ovenHolders.set(t.recipeKey, temp);
      if (temp !== null && PREHEAT.test(fold(t.text)) && !ovenHotAt.has(temp)) ovenHotAt.set(temp, now + t.duration);
    }
    t.start = now;
    t.end = now + t.duration;
    if (t.active) cookFreeAt = t.end;
    running.push(t);
    pending.delete(t.id);
  };

  let guard = 0;
  while (pending.size > 0 && guard++ < 10_000) {
    // Finish what is over; a recipe releases the oven after its last oven step.
    for (const r of running) {
      if (r.end > now || done.has(r.id)) continue;
      done.add(r.id);
      if (r.equipment === "four" && !pendingOvenSteps(r.recipeKey) && !running.some((x) => x !== r && x.recipeKey === r.recipeKey && x.equipment === "four" && x.end > now)) {
        ovenHolders.delete(r.recipeKey);
      }
    }
    // Oven empty: it cools down, the next preheat starts from scratch.
    if (ovenHolders.size === 0) ovenHotAt.clear();

    const candidates = [...pending].map((id) => byId.get(id)!).filter(ready);
    // Passive tasks start as soon as their equipment allows (longest first).
    for (const t of candidates.filter((c) => !c.active).sort((a, b) => b.priority - a.priority)) {
      if (canUseEquipment(t)) startTask(t);
    }
    // The cook takes the most urgent active task; on near-ties, clean before dirty.
    if (cookFreeAt <= now) {
      const active = candidates.filter((c) => c.active && pending.has(c.id) && canUseEquipment(c));
      active.sort((a, b) => (Math.abs(a.priority - b.priority) <= 10 ? a.dirty - b.dirty : 0) || b.priority - a.priority);
      if (active[0]) startTask(active[0]);
    }
    // Next event.
    const next = [...running.filter((r) => r.end > now).map((r) => r.end), cookFreeAt].filter((x) => x > now);
    const anyReadyNow = [...pending].some((id) => {
      const t = byId.get(id)!;
      return ready(t) && (t.active ? cookFreeAt <= now : true) && canUseEquipment(t);
    });
    if (anyReadyNow) continue;
    if (next.length === 0) {
      // Nothing running and nothing startable: should not happen, avoid a dead loop.
      for (const id of pending) startTask(byId.get(id)!);
      break;
    }
    now = Math.min(...next);
  }

  const out = tasks
    .map(({ duration: _d, preds: _p, priority: _pr, dirty: _di, ...t }) => t)
    .sort((a, b) => a.start - b.start || Number(b.active) - Number(a.active) || a.id.localeCompare(b.id));
  const totalMinutes = Math.max(0, ...out.map((t) => t.end));
  const separateMinutes = recipes.reduce(
    (sum, r) => sum + toTasks(r).reduce((s, t) => s + t.duration, 0),
    0,
  );
  return { tasks: out, totalMinutes, separateMinutes };
}

/** Every recipe step appears exactly once in the timeline. */
export function missingSteps(recipes: BatchRecipe[], schedule: Schedule): string[] {
  const seen = new Map<string, number>();
  for (const t of schedule.tasks) seen.set(t.id, (seen.get(t.id) ?? 0) + 1);
  return recipes.flatMap((r) =>
    r.steps.map((_, i) => `${r.key}:${i}`).filter((id) => seen.get(id) !== 1),
  );
}
