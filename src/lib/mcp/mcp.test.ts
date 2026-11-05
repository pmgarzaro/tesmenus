// End to end through the route handlers: OAuth (registration, PKCE, refresh)
// then MCP JSON-RPC calls on /mcp.
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tesmenus-mcp-"));
delete process.env.PUBLIC_URL;
const { getDb, schema } = await import("@/db");
const { seedIfEmpty } = await import("@/db/seed");
const { createPlan, getPlan } = await import("@/lib/planning/repo");
const { getRecipe } = await import("@/lib/recipes/repo");
const { roundForKitchen, scaleQuantity } = await import("@/lib/recipes/units");
const { today } = await import("@/lib/planning/dates");
const oauth = await import("./oauth");
const mcpRoute = await import("@/app/mcp/route");
const registerRoute = await import("@/app/oauth/register/route");
const tokenRoute = await import("@/app/oauth/token/route");
const prmRoute = await import("@/app/.well-known/oauth-protected-resource/[[...path]]/route");
const asRoute = await import("@/app/.well-known/oauth-authorization-server/[[...path]]/route");

const ORIGIN = "https://menus.example";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
let userId: number;
let otherUserId: number;
let householdId: number;
let accessToken: string;

const b64url = (b: Buffer) => b.toString("base64url");

function post(url: string, body: string, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", body, headers: { host: "menus.example", "x-forwarded-proto": "https", ...headers } });
}

async function rpc(method: string, params: unknown, token: string | null = accessToken) {
  const res = await mcpRoute.POST(
    post(`${ORIGIN}/mcp`, JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    }),
  );
  return res;
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = await rpc("tools/call", { name, arguments: args });
  expect(res.status).toBe(200);
  const body = await res.json();
  const result = body.result as { isError?: boolean; content: { text: string }[]; structuredContent?: unknown };
  return { isError: !!result.isError, text: result.content[0].text, data: result.structuredContent as any };
}

beforeAll(async () => {
  const db = getDb();
  const [h, h2] = ["A", "B"].map((name) => db.insert(schema.households).values({ name }).returning().get().id);
  householdId = h;
  userId = db.insert(schema.users).values({ householdId: h, name: "Me", email: "me@x", passwordHash: "x" }).returning().get().id;
  otherUserId = db.insert(schema.users).values({ householdId: h2, name: "O", email: "o@x", passwordHash: "x" }).returning().get().id;
  seedIfEmpty(h);
  seedIfEmpty(h2);
});

describe("OAuth", () => {
  it("publishes discovery metadata", async () => {
    const prm = await prmRoute.GET(new Request(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`, { headers: { host: "menus.example", "x-forwarded-proto": "https" } }));
    expect(await prm.json()).toMatchObject({ resource: `${ORIGIN}/mcp`, authorization_servers: [ORIGIN] });
    const as = await asRoute.GET(new Request(`${ORIGIN}/.well-known/oauth-authorization-server`, { headers: { host: "menus.example", "x-forwarded-proto": "https" } }));
    expect(await as.json()).toMatchObject({
      issuer: ORIGIN,
      registration_endpoint: `${ORIGIN}/oauth/register`,
      code_challenge_methods_supported: ["S256"],
    });
  });

  it("rejects /mcp without a valid token (401 + resource metadata)", async () => {
    for (const token of [null, "nope"]) {
      const res = await rpc("tools/list", {}, token);
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`);
    }
  });

  it("registers a client, exchanges a PKCE code, refreshes with rotation", async () => {
    const reg = await registerRoute.POST(
      post(`${ORIGIN}/oauth/register`, JSON.stringify({ client_name: "Claude", redirect_uris: [REDIRECT] }), { "content-type": "application/json" }),
    );
    expect(reg.status).toBe(201);
    const client = await reg.json();
    expect(client.client_secret).toBeUndefined();

    const bad = await registerRoute.POST(post(`${ORIGIN}/oauth/register`, JSON.stringify({ redirect_uris: ["http://evil.example/cb"] })));
    expect(bad.status).toBe(400);

    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash("sha256").update(verifier).digest());
    const params = {
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "xyz",
    };
    expect(oauth.validateAuthorize({ ...params, redirect_uri: "https://evil.example/cb" })).toMatchObject({ ok: false, redirectTo: null });
    expect(oauth.validateAuthorize({ ...params, code_challenge_method: "plain" })).toMatchObject({ ok: false });
    const check = oauth.validateAuthorize(params);
    if (!check.ok) throw new Error("authorize rejected");
    const redirect = new URL(oauth.approve(userId, check.value, ORIGIN));
    expect(redirect.searchParams.get("state")).toBe("xyz");
    const code = redirect.searchParams.get("code")!;

    const exchange = (v: string) =>
      tokenRoute.POST(
        post(
          `${ORIGIN}/oauth/token`,
          new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: v, client_id: client.client_id, redirect_uri: REDIRECT }).toString(),
          { "content-type": "application/x-www-form-urlencoded" },
        ),
      );
    const wrong = await exchange(b64url(randomBytes(32)));
    expect(wrong.status).toBe(400);
    // The code was consumed by the failed attempt: no second chance.
    expect((await exchange(verifier)).status).toBe(400);

    // New code, right verifier.
    const code2 = new URL(oauth.approve(userId, check.value, ORIGIN)).searchParams.get("code")!;
    const ok = await tokenRoute.POST(
      post(
        `${ORIGIN}/oauth/token`,
        new URLSearchParams({ grant_type: "authorization_code", code: code2, code_verifier: verifier, client_id: client.client_id }).toString(),
      ),
    );
    expect(ok.status).toBe(200);
    const tokens = await ok.json();
    expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: 3600 });

    const refresh = (t: string) =>
      tokenRoute.POST(
        post(`${ORIGIN}/oauth/token`, new URLSearchParams({ grant_type: "refresh_token", refresh_token: t, client_id: client.client_id }).toString()),
      );
    const refreshed = await refresh(tokens.refresh_token);
    expect(refreshed.status).toBe(200);
    expect((await refresh(tokens.refresh_token)).status).toBe(400); // rotated
    accessToken = (await refreshed.json()).access_token;

    expect(oauth.listConnections(userId)).toEqual([expect.objectContaining({ clientId: client.client_id, name: "Claude" })]);
  });

  it("supports confidential clients", async () => {
    const client = oauth.registerClient({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_basic" });
    expect(client.client_secret).toBeTruthy();
    const basic = (secret: string) => `Basic ${Buffer.from(`${client.client_id}:${secret}`).toString("base64")}`;
    const form = new URLSearchParams({ grant_type: "refresh_token", refresh_token: "x" });
    expect(() => oauth.authenticateClient(form, basic("wrong"))).toThrow(/Secret/);
    expect(oauth.authenticateClient(form, basic(client.client_secret!)).clientId).toBe(client.client_id);
  });

  it("accepts the optional static token", async () => {
    process.env.MCP_TOKEN = "s".repeat(40);
    process.env.MCP_TOKEN_EMAIL = "me@x";
    expect(oauth.verifyAccessToken(`Bearer ${"s".repeat(40)}`)).toEqual({ userId, householdId });
    process.env.MCP_TOKEN = "short";
    expect(oauth.verifyAccessToken("Bearer short")).toBeNull();
    delete process.env.MCP_TOKEN;
  });
});

describe("MCP tools", () => {
  it("lists the tools", async () => {
    const res = await rpc("tools/list", {});
    const names = (await res.json()).result.tools.map((t: { name: string }) => t.name);
    expect(names.sort()).toEqual(
      [
        "delete_meal_log",
        "get_meal_log",
        "get_nutrition_targets",
        "get_planned_meals",
        "get_recipe",
        "log_meal",
        "search_recipes",
        "set_nutrition_targets",
        "update_meal_log",
      ].sort(),
    );
  });

  it("returns tonight's planned dinner and its recipe for 1 serving, as the app shows it", async () => {
    const date = today();
    const { id } = createPlan(householdId, { startDate: date, days: 2, slots: ["midi", "soir"], constraints: {} });
    const dinner = getPlan(householdId, id)!.entries.find((e) => e.date === date && e.slot === "soir")!;

    const planned = await call("get_planned_meals", {});
    expect(planned.data.date).toBe(date);
    const meal = planned.data.meals.find((m: { slot: string }) => m.slot === "dinner");
    expect(meal).toMatchObject({ recipe_id: dinner.recipeId, servings_planned: dinner.servings, is_leftover: false });

    const recipe = await call("get_recipe", { recipe_id: meal.recipe_id, servings: 1 });
    const stored = getRecipe(householdId, meal.recipe_id)!;
    expect(recipe.data.app_nutrition_per_serving).toMatchObject({
      kcal: expect.any(Number),
      protein_g: expect.any(Number),
      carbs_g: expect.any(Number),
      fat_g: expect.any(Number),
    });
    expect(recipe.data).toMatchObject({ id: stored.id, name: stored.title, base_servings: stored.servings, servings: 1, steps: null });
    expect(recipe.data.ingredients.map((i: { amount: number | null }) => i.amount)).toEqual(
      stored.ingredients.map((i) => {
        const q = scaleQuantity(i.quantity, stored.servings, 1);
        return q === null ? null : roundForKitchen(q, i.unit);
      }),
    );
    expect(JSON.parse(recipe.text)).toEqual(recipe.data);
    const withSteps = await call("get_recipe", { recipe_id: meal.recipe_id, include_steps: true });
    expect(withSteps.data.servings).toBe(stored.servings);
    expect(withSteps.data.steps).toHaveLength(stored.steps.length);

    // Leftovers on the next day point back to the dinner.
    const next = await call("get_planned_meals", { date: getPlan(householdId, id)!.entries.at(-1)!.date });
    expect(next.data.meals.find((m: { is_leftover: boolean }) => m.is_leftover)).toMatchObject({ slot: "lunch", leftover_of: { date, slot: "dinner" } });
  });

  it("searches recipes of the household", async () => {
    const res = await call("search_recipes", { query: "chili" });
    expect(res.data.results).toEqual([expect.objectContaining({ name: "Chili con carne" })]);
    const other = await call("get_recipe", {
      recipe_id: getDb().select().from(schema.recipes).all().find((r) => r.householdId !== householdId)!.id,
    });
    expect(other).toMatchObject({ isError: true, text: expect.stringMatching(/introuvable/) });
  });

  it("keeps the food journal and reports the day against targets", async () => {
    const date = "2026-11-05";
    const breakfast = await call("log_meal", {
      date,
      slot: "breakfast",
      description: "1 egg muffin protéiné + café au lait",
      est_kcal: 480,
      est_protein_g: 35,
    });
    expect(breakfast.data).toMatchObject({ id: expect.any(Number), slot: "breakfast", est_kcal: 480, recipe_id: null });
    await call("log_meal", { date, slot: "dinner", description: "Chili", est_kcal: 700 });
    const fixed = await call("update_meal_log", { id: breakfast.data.id, est_kcal: 500 });
    expect(fixed.data).toMatchObject({ est_kcal: 500, est_protein_g: 35, description: "1 egg muffin protéiné + café au lait" });

    const log = await call("get_meal_log", { date_from: date });
    expect(log.data.totals_by_date).toEqual([
      {
        date,
        est_kcal: 1200,
        est_protein_g: 35,
        est_carbs_g: 0,
        est_fat_g: 0,
        entries: 2,
        entries_without_estimate: 1,
        entries_without_macros: 2,
      },
    ]);
    const pasta = await call("log_meal", { date, slot: "lunch", description: "Pâtes", est_kcal: 600, est_protein_g: 20, est_carbs_g: 90, est_fat_g: 15 });
    expect(pasta.data).toMatchObject({ est_carbs_g: 90, est_fat_g: 15 });
    expect((await call("update_meal_log", { id: pasta.data.id, est_fat_g: 18 })).data).toMatchObject({ est_carbs_g: 90, est_fat_g: 18 });
    expect((await call("get_meal_log", { date_from: date })).data.totals_by_date[0]).toMatchObject({ est_carbs_g: 90, est_fat_g: 18 });
    await call("delete_meal_log", { id: pasta.data.id });
    expect(await call("get_nutrition_targets")).toMatchObject({ data: { kcal_per_day: 2170, protein_g: 140, is_default: true } });
    expect((await call("get_nutrition_targets")).data).toMatchObject({ carbs_g: null, fat_g: null });
    await call("set_nutrition_targets", { kcal_per_day: 2100, protein_g: 140, carbs_g: 230, fat_g: 70, notes: "85 kg" });
    // Omitted carbs / fat / notes are kept.
    await call("set_nutrition_targets", { kcal_per_day: 2050, protein_g: 140 });
    expect((await call("get_nutrition_targets")).data).toMatchObject({
      kcal_per_day: 2050,
      carbs_g: 230,
      fat_g: 70,
      notes: "85 kg",
      is_default: false,
    });

    expect(await call("delete_meal_log", { id: breakfast.data.id })).toMatchObject({ data: { deleted: true } });
    expect(await call("delete_meal_log", { id: breakfast.data.id })).toMatchObject({ isError: true });

    // Visible in the app's service for this user only.
    expect(getDb().select().from(schema.mealLog).all().every((e) => e.userId === userId && e.userId !== otherUserId)).toBe(true);
  });

  it("reports invalid input as a clear tool error", async () => {
    const badSlot = await call("log_meal", { slot: "brunch", description: "x" });
    expect(badSlot.isError).toBe(true);
    expect(badSlot.text).toMatch(/Créneau inconnu/);
    const badDate = await call("get_planned_meals", { date: "2026-13-01" });
    expect(badDate.isError).toBe(true);
    expect(badDate.text).toMatch(/Date invalide/);
    const range = await call("get_meal_log", { date_from: "2026-11-06", date_to: "2026-11-01" });
    expect(range).toMatchObject({ isError: true });
  });
});
