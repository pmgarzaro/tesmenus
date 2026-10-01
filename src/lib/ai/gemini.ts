// Google Gemini (free tier possible) for the jobs rules do badly: reading
// handwritten recipes, structuring messy text, understanding free-form
// planning wishes. Optional: without GEMINI_API_KEY the app uses its rules.
import type { z } from "zod";

export class AiError extends Error {}

const BASE_URL = () => process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
const MODEL = () => process.env.GEMINI_MODEL ?? "gemini-flash-latest";
const TIMEOUT_MS = 60_000;

export const aiConfigured = () => Boolean(process.env.GEMINI_API_KEY);

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

async function call(parts: Part[], schema: object): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL()}/models/${MODEL()}:generateContent`, {
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
  if (res.status === 429) throw new AiError("Quota gratuit de l'IA atteint pour le moment : réessaie plus tard.");
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    const body = await res.text().catch(() => "");
    console.error("Gemini", res.status, body.slice(0, 500));
    throw new AiError(/API key|API_KEY/i.test(body) ? "Clé GEMINI_API_KEY invalide." : "Requête refusée par l'IA.");
  }
  if (!res.ok) throw new AiError(`L'IA a renvoyé une erreur (${res.status}).`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) throw new AiError("L'IA a refusé de traiter ce contenu.");
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new AiError("Réponse vide de l'IA.");
  return text;
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
    const text = await call([...parts, ...extra], opts.schema);
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
