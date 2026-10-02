import { expect, test } from "@playwright/test";

// The main journey of the app, on a phone: account → recipes → plan →
// shopping list → batch cooking → cook mode. Requires `npm run build` first.
test("parcours principal", async ({ page }) => {
  // First account
  await page.goto("/");
  await expect(page).toHaveURL(/\/signup/);
  await page.fill("[name=name]", "Paul");
  await page.fill("[name=email]", "paul@example.com");
  await page.fill("[name=password]", "motdepasse1");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/recettes/);

  // Sample recipes
  await page.goto("/reglages");
  await page.getByText("Charger les recettes d'exemple").click();
  await page.goto("/recettes");
  await expect(page.locator("main ul li")).toHaveCount(8);

  // A recipe typed by hand, ingredients pasted
  await page.getByRole("button", { name: "Ajouter une recette" }).click();
  await page.getByText("Saisie manuelle").click();
  await page.getByPlaceholder("Titre de la recette").fill("Omelette");
  await page.getByText("Coller une liste").click();
  await page.getByPlaceholder(/Un ingrédient par ligne/).fill("4 œufs\n1 pincée de sel\n20 g de poudre de perlimpinpin");
  await page.getByText("Ajouter ces ingrédients").click();
  await page.getByLabel("Étape 1").fill("Battre les œufs et cuire 3 min à la poêle.");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { name: "Omelette" })).toBeVisible();
  await expect(page.getByText("4 œufs")).toBeVisible();

  // Calories: an unknown ingredient filled by hand counts in the total
  await expect(page.getByText("aliment inconnu")).toBeVisible();
  const before = Number((await page.getByTestId("kcal").textContent())!.replace(/\D/g, ""));
  await page.getByRole("button", { name: "Renseigner" }).click();
  await page.getByLabel("Calories (kcal)").fill("500");
  await page.getByLabel("Protéines (g)").fill("10");
  await page.locator("form").getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("aliment inconnu")).toHaveCount(0);
  // 20 g at 500 kcal / 100 g = 100 kcal for 4 portions
  await expect(page.getByTestId("kcal")).toHaveText(new RegExp(`≈ (${before + 24}|${before + 25}|${before + 26}) kcal`));

  // Weekly plan
  await page.goto("/planning/nouveau");
  await page.locator("input[type=date]").fill("2026-10-05");
  await page.getByRole("button", { name: "Générer le planning" }).click();
  await expect(page).toHaveURL(/\/planning\/\d+/);
  await expect(page.getByText(/^Restes : /).first()).toBeVisible();

  // Saved as a template, then reused another week
  const planUrl = page.url();
  await page.getByRole("button", { name: "Sauvegarder comme modèle" }).click();
  await page.getByLabel("Nom du modèle").fill("Semaine type");
  await page.getByRole("button", { name: "Sauver" }).click();
  await expect(page.getByText("Modèle « Semaine type » enregistré")).toBeVisible();
  await page.goto("/planning/historique");
  await page.getByRole("button", { name: /^Semaine type \d+ jours/ }).click();
  await page.getByLabel("À partir du").fill("2026-10-19");
  await page.getByRole("button", { name: "Utiliser" }).click();
  await expect(page.getByText(/^Du 19 octobre/)).toBeVisible();
  await expect(page.getByText(/^Restes : /).first()).toBeVisible();
  await page.goto(planUrl);

  // Shopping list
  await page.getByText("Liste de courses de ce planning").click();
  await expect(page).toHaveURL(/\/courses\/\d+/);
  const name = await page.locator("main section li span.truncate").first().textContent();
  const item = () => page.locator("main section li").filter({ has: page.locator(`span.truncate:text-is("${name}")`) });
  await item().locator("input[type=checkbox]").check();
  await expect(page.getByText(/^1\/\d+ dans le panier/)).toBeVisible();
  await page.reload();
  await expect(item().locator("input[type=checkbox]")).toBeChecked(); // moved to the bottom of its aisle

  // Batch cooking + cook mode
  await page.goto("/batch/nouveau");
  await page.locator("form > button").last().click();
  await expect(page).toHaveURL(/\/batch\/\d+$/);
  await expect(page.getByText("3. Déroulé")).toBeVisible();
  await page.getByText("Mode cuisine").click();
  await expect(page.getByText(/Étape 1\//)).toBeVisible();
  await page.getByRole("button", { name: "Suivant" }).click();
  await expect(page.getByText(/Étape 2\//)).toBeVisible();
});
