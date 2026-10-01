// Google Gemini (free tier possible) for the jobs rules do badly: reading
// handwritten recipes, structuring messy text, understanding free-form
// planning wishes. Optional: without GEMINI_API_KEY the app uses its rules.
import type { z } from "zod";

export class AiError extends Error {}

const BASE_URL = () => process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
// Models tried in order: the free tier only covers some of them, and which
// ones changes over time and per project. GEMINI_MODEL (comma-separated) wins.
const DEFAULT_MODELS = [
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];
export const candidateModels = () =>
  (process.env.GEMINI_MODEL ?? "").split(",").map((m) => m.trim()).filter(Boolean).concat(DEFAULT_MODELS)
    .filter((m, i, all) => all.indexOf(m) === i);
const TIMEOUT_MS = 60_000;

/** Errors that mean "this model is not usable for this key": try the next one. */
class ModelUnavailable extends AiError {}

// Last model that answered, tried first next time.
let workingModel: string | null = null;

export const aiConfigured = () => Boolean(process.env.GEMINI_API_KEY);

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

async function callModel(model: string, parts: Part[], schema: object): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL()}/models/${model}:generateContent`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseJsonSchema: schema },
      }),
    });
  } catch {
    throw new AiError(controller.signal.aborted ? "L'IA met trop de temps à répondre." : "IA injoignable.");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Gemini", model, res.status, body.slice(0, 300));
    if (/API key not valid|API_KEY_INVALID/i.test(body)) throw new AiError("Clé GEMINI_API_KEY invalide.");
    if (res.status === 429) {
      throw new ModelUnavailable(/limit: 0\b|free_tier/i.test(body) ? "pas d'accès gratuit à ce modèle" : "quota gratuit atteint");
    }
    if (res.status === 404) throw new ModelUnavailable("modèle inconnu");
    if (res.status === 403) throw new ModelUnavailable("accès refusé à ce modèle");
    if (res.status >= 500) throw new ModelUnavailable(`erreur ${res.status} chez Google`);
    throw new AiError(`Requête refusée par l'IA (${res.status}).`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) throw new AiError("L'IA a refusé de traiter ce contenu.");
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new AiError("Réponse vide de l'IA.");
  return text;
}

/** Tries the models in order until one answers. Returns the text and the model used. */
async function call(parts: Part[], schema: object): Promise<{ text: string; model: string }> {
  const models = candidateModels();
  const order = workingModel && models.includes(workingModel) ? [workingModel, ...models.filter((m) => m !== workingModel)] : models;
  const failures: string[] = [];
  for (const model of order) {
    try {
      const text = await callModel(model, parts, schema);
      workingModel = model;
      return { text, model };
    } catch (e) {
      if (!(e instanceof ModelUnavailable)) throw e;
      failures.push(`${model} : ${e.message}`);
      if (workingModel === model) workingModel = null;
    }
  }
  const quota = failures.every((f) => f.endsWith("quota gratuit atteint"));
  throw new AiError(
    quota
      ? "Quota gratuit de l'IA atteint pour le moment : réessaie plus tard."
      : `Aucun modèle Gemini utilisable avec cette clé (${failures.join(" ; ")}).`,
  );
}

/**
 * Asks for JSON matching `schema` (JSON Schema sent to Gemini) and validates it
 * with `validator`. One retry if the answer is not valid JSON / does not fit.
 */
export async function generateJson<T>(opts: {
  prompt: string;
  images?: { data: Buffer; mimeType: string }[];
  schema: object;
  validator: z.ZodType<T>;
}): Promise<T> {
  if (!aiConfigured()) throw new AiError("IA non configurée (GEMINI_API_KEY absente).");
  const parts: Part[] = [
    { text: opts.prompt },
    ...(opts.images ?? []).map((i) => ({ inline_data: { mime_type: i.mimeType, data: i.data.toString("base64") } })),
  ];
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const extra: Part[] = attempt ? [{ text: `Ta réponse précédente était invalide (${lastError}). Réponds uniquement avec un JSON conforme au schéma.` }] : [];
    const { text } = await call([...parts, ...extra], opts.schema);
    let json: unknown;
    try {
      json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
      lastError = "JSON illisible";
      continue;
    }
    const parsed = opts.validator.safeParse(json);
    if (parsed.success) return parsed.data;
    lastError = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  }
  throw new AiError("L'IA a renvoyé une réponse inexploitable.");
}

/** For the settings page: which model answers with this key, or why none does. */
export async function testAi(): Promise<{ ok: true; model: string } | { ok: false; error: string }> {
  if (!aiConfigured()) return { ok: false, error: "GEMINI_API_KEY absente." };
  try {
    const { model } = await call([{ text: 'Réponds {"ok": true}.' }], { type: "object", properties: { ok: { type: "boolean" } } });
    return { ok: true, model };
  } catch (e) {
    return { ok: false, error: e instanceof AiError ? e.message : "Erreur inconnue." };
  }
}

/** Test helper. */
export function resetWorkingModel() {
  workingModel = null;
}
