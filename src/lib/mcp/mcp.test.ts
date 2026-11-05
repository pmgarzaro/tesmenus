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
        "create_recipe",
        "create_meal_plan",
        "set_planned_meal",
        "get_shopping_list",
        "log_body_measurement",
        "get_body_measurements",
        "delete_body_measurement",
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

  it("creates plans, changes meals and lists shopping for a period", async () => {
    const { addDays } = await import("@/lib/planning/dates");
    const { getShoppingList } = await import("@/lib/shopping/repo");
    const id = (title: string) => getDb().select().from(schema.recipes).all().find((r) => r.householdId === householdId && r.title === title)!.id;
    // A plan already runs from today (previous test): the next one starts after it.
    const auto = await call("create_meal_plan", { days: 3, exclude_tags: ["Poisson"] });
    expect(auto.isError).toBe(false);
    const start = auto.data.start_date;
    expect(start > today()).toBe(true);
    expect(auto.data.meals).toHaveLength(6);
    const fish = getDb().select().from(schema.recipes).all().filter((r) => r.tags.includes("poisson")).map((r) => r.id);
    expect(auto.data.meals.some((m: { recipe_id: number }) => fish.includes(m.recipe_id))).toBe(false);

    // Overlap refused with the next free date.
    expect(await call("create_meal_plan", { start_date: start, days: 2 })).toMatchObject({ isError: true, text: expect.stringMatching(/chevauchent/) });

    // Chosen meals only.
    const chili = id("Chili con carne");
    const chosen = await call("create_meal_plan", {
      start_date: addDays(start, 3),
      days: 2,
      meals: [
        { date: addDays(start, 3), slot: "dinner", recipe_id: chili },
        { date: addDays(start, 4), slot: "dinner", eating_out: true },
      ],
    });
    expect(chosen.isError).toBe(false);
    const meal = (d: string, s: string) => chosen.data.meals.find((m: { date: string; slot: string }) => m.date === d && m.slot === s);
    expect(meal(addDays(start, 3), "dinner")).toMatchObject({ recipe_id: chili, servings_planned: 4 });
    expect(meal(addDays(start, 4), "lunch")).toMatchObject({ is_leftover: true, recipe_id: chili, leftover_of: { date: addDays(start, 3), slot: "dinner" } });
    expect(meal(addDays(start, 4), "dinner")).toMatchObject({ is_eating_out: true });
    expect(meal(addDays(start, 3), "lunch")).toMatchObject({ recipe_id: null, is_eating_out: false });

    // Change a meal.
    const gratin = id("Gratin dauphinois");
    const changed = await call("set_planned_meal", { date: addDays(start, 3), slot: "lunch", recipe_id: gratin, servings: 3 });
    expect(changed.data.meals.find((m: { date: string; slot: string }) => m.date === addDays(start, 3) && m.slot === "lunch")).toMatchObject({
      recipe_id: gratin,
      servings_planned: 3,
    });
    expect(await call("set_planned_meal", { date: addDays(start, 3), slot: "lunch", clear: true, eating_out: true })).toMatchObject({ isError: true });
    expect(await call("set_planned_meal", { date: "2030-01-01", slot: "lunch", clear: true })).toMatchObject({
      isError: true,
      text: expect.stringMatching(/Aucun planning/),
    });

    // Shopping list for that day: gratin (3 portions) + chili (4), same as the app's list for the period.
    const shop = await call("get_shopping_list", { date_from: addDays(start, 3), date_to: addDays(start, 3) });
    expect(new Set(shop.data.recipes)).toEqual(new Set(["Gratin dauphinois", "Chili con carne"]));
    const appList = getShoppingList(householdId, chosen.data.plan_id, addDays(start, 3), addDays(start, 3))!;
    expect(shop.data.items.map((i: { name: string; amount: string }) => [i.name, i.amount]).sort()).toEqual(
      appList.items.map((i) => [i.name, i.amount || null]).sort(),
    );
    // The next day only has leftovers and eating out: nothing to buy.
    expect((await call("get_shopping_list", { date_from: addDays(start, 4), date_to: addDays(start, 4) })).data.items).toEqual([]);
  });

  it("searches recipes of the household", async () => {
    const res = await call("search_recipes", { query: "chili" });
    expect(res.data.results).toEqual([expect.objectContaining({ name: "Chili con carne" })]);
    const other = await call("get_recipe", {
      recipe_id: getDb().select().from(schema.recipes).all().find((r) => r.householdId !== householdId)!.id,
    });
    expect(other).toMatchObject({ isError: true, text: expect.stringMatching(/introuvable/) });
  });

  it("creates recipes in the household", async () => {
    const created = await call("create_recipe", {
      name: "Bowl poulet patate douce",
      servings: 2,
      tags: ["Viande", "rapide"],
      prep_min: 15,
      cook_min: 25,
      fridge_days: 3,
      ingredients: [
        { amount: 300, unit: "g", name: "blanc de poulet" },
        { amount: 1, unit: null, name: "patate douce" },
        { amount: 2, unit: "c. à soupe", name: "huile d'olive" },
        { amount: 1, unit: "cuillère à café", name: "paprika" },
        { name: "sel, poivre" },
      ],
      steps: [
        "Préchauffer le four à 200 °C et cuire la patate douce en dés 25 min.",
        { text: "Saisir le poulet à la poêle.", duration_min: 8 },
      ],
    });
    expect(created.isError).toBe(false);
    expect(created.data).toMatchObject({
      name: "Bowl poulet patate douce",
      base_servings: 2,
      tags: ["viande", "rapide"],
      ingredients: [
        { amount: 300, unit: "g", name: "blanc de poulet" },
        { amount: 1, unit: null, name: "patate douce" },
        { amount: 2, unit: "c. à soupe", name: "huile d'olive" },
        { amount: 1, unit: "c. à café", name: "paprika" },
        { amount: null, unit: null, name: "sel, poivre" },
      ],
      steps: [expect.stringContaining("four"), "Saisir le poulet à la poêle."],
    });
    const stored = getRecipe(householdId, created.data.id)!;
    expect(stored).toMatchObject({ householdId, sourceType: "manuel", fridgeDays: 3, mealType: "plat" });
    expect(stored.steps[0]).toMatchObject({ equipment: "four", temperature: 200, durationMinutes: 25 });
    expect(stored.steps[1]).toMatchObject({ durationMinutes: 8 });
    expect((await call("search_recipes", { query: "patate douce" })).data.results).toEqual([
      expect.objectContaining({ id: created.data.id }),
    ]);
    // Halved like any recipe.
    expect((await call("get_recipe", { recipe_id: created.data.id, servings: 1 })).data.ingredients[0]).toMatchObject({ amount: 150 });

    expect(await call("create_recipe", { name: "bowl poulet PATATE douce", servings: 2, ingredients: [{ amount: 1, name: "x" }] })).toMatchObject({
      isError: true,
      text: expect.stringMatching(/existe déjà/),
    });
    expect(
      (await call("create_recipe", { name: "Bowl poulet patate douce", servings: 2, ingredients: [{ amount: 1, name: "x" }], allow_duplicate: true })).isError,
    ).toBe(false);
    expect(await call("create_recipe", { name: "X", servings: 2, ingredients: [{ amount: 1, unit: "poignée", name: "x" }] })).toMatchObject({
      isError: true,
      text: expect.stringMatching(/Unité inconnue/),
    });
    expect((await call("create_recipe", { name: "Y", servings: 2, ingredients: [] })).isError).toBe(true);
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

  it("tracks weight and measurements", async () => {
    const t = today();
    const { addDays } = await import("@/lib/planning/dates");
    await call("log_body_measurement", { date: addDays(t, -14), weight_kg: 86, waist_cm: 98 });
    await call("log_body_measurement", { date: addDays(t, -7), weight_kg: 85.5 });
    const now = await call("log_body_measurement", { weight_kg: 85 });
    expect(now.data).toMatchObject({ date: t, weight_kg: 85, waist_cm: null });
    expect((await call("log_body_measurement", { waist_cm: 96.5 })).data).toMatchObject({ weight_kg: 85, waist_cm: 96.5 });

    await call("set_nutrition_targets", { kcal_per_day: 2050, protein_g: 140, goal_weight_kg: 78 });
    const res = await call("get_body_measurements");
    expect(res.data.entries).toHaveLength(3);
    expect(res.data.weight_trend.at(-1)).toEqual({ date: t, weight_kg: 85, avg_7d: 85 });
    expect(res.data.summary.weight_kg).toMatchObject({ change: -1, rate_per_week: -0.5 });
    expect(res.data.summary.waist_cm).toMatchObject({ change: -1.5 });
    expect(res.data).toMatchObject({ latest_weight: { date: t, weight_kg: 85 }, goal_weight_kg: 78 });

    expect(await call("delete_body_measurement", { date: t })).toMatchObject({ data: { deleted: true } });
    expect(await call("delete_body_measurement", { date: t })).toMatchObject({ isError: true });
    expect(await call("log_body_measurement", { weight_kg: 1000 })).toMatchObject({ isError: true });
    expect(await call("log_body_measurement", {})).toMatchObject({ isError: true, text: expect.stringMatching(/au moins une mesure/) });
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
