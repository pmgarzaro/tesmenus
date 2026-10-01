import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseIsoDuration, parseTextDuration } from "./build";
import { ImportError, fetchPage, isPrivateAddress } from "./fetch";
import { importFromHtml, importFromText, importFromUrl } from "./index";

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "__fixtures__", name));

describe("durations", () => {
  it.each([["PT20M", 20], ["PT1H30M", 90], ["PT1H", 60], ["P0DT0H45M", 45], ["PT0M", null], ["bad", null]])(
    "%s", (iso, min) => expect(parseIsoDuration(iso)).toBe(min),
  );
  it.each([["1 h 30", 90], ["45 min", 45], ["2h", 120], ["20 minutes", 20]])(
    "%s", (t, min) => expect(parseTextDuration(t)).toBe(min),
  );
});

describe("JSON-LD import", () => {
  it("reads a Marmiton-like page", () => {
    const { draft, flags, method, warnings } = importFromHtml(fixture("marmiton.html").toString(), "https://ex.com/chili");
    expect(method).toBe("jsonld");
    expect(warnings).toEqual([]);
    expect(draft).toMatchObject({
      title: "Chili con carne facile",
      description: "Un chili généreux et parfumé.",
      servings: 4,
      prepMinutes: 20,
      cookMinutes: 60,
      mealType: "plat",
      sourceUrl: "https://ex.com/chili",
      freezable: true, // chili
    });
    expect(draft.ingredients).toHaveLength(9);
    expect(draft.ingredients[0]).toMatchObject({ quantity: 500, unit: "g", label: "boeuf haché" });
    expect(draft.ingredients[7]).toMatchObject({ quantity: 2, unit: "cas", label: "huile d'olive" });
    expect(draft.ingredients[8]).toMatchObject({ quantity: null, label: "Sel, poivre" });
    expect(draft.steps).toHaveLength(5);
    expect(draft.steps[3]).toMatchObject({ type: "cuisson", durationMinutes: 45, equipment: "plaque" });
    expect(draft.tags).toEqual(expect.arrayContaining(["viande", "chili con carne", "épicé"]));
    expect(draft.tags).not.toContain("recette facile");
    expect(draft.tags).not.toContain("plat principal");
    expect(flags).toMatchObject({ tags: "guess", fridgeDays: "guess", freezable: "guess" });
    expect(flags.servings).toBeUndefined();
    expect(flags.ingredients).toBeUndefined();
  });

  it("reads @graph, HowToSection and computes cooking time from the total", () => {
    const { draft, flags } = importFromHtml(fixture("750g.html").toString());
    expect(draft.title).toBe("Gratin dauphinois & crème");
    expect(draft.servings).toBe(6);
    expect(draft.prepMinutes).toBe(25);
    expect(draft.cookMinutes).toBe(60);
    expect(draft.ingredients[0]).toMatchObject({ quantity: 1.2, unit: "kg", label: "pommes de terre" });
    expect(draft.ingredients[4]).toMatchObject({ quantity: 0.5, unit: "cac", label: "noix de muscade" });
    expect(draft.steps.map((s) => s.text)).toEqual([
      "Préchauffez le four à 160°C (th. 5-6).",
      "Épluchez et coupez les pommes de terre en fines rondelles.",
      "Versez la crème et le lait sur les pommes de terre. Enfournez pour 1 h.",
    ]);
    expect(draft.steps[0]).toMatchObject({ equipment: "four", temperature: 160, type: "preparation" });
    expect(draft.steps[2]).toMatchObject({ equipment: "four", durationMinutes: 60, type: "cuisson" });
    expect(draft.tags).toEqual(expect.arrayContaining(["végé", "four"]));
    expect(flags.mealType).toBe("guess");
  });
});

describe("HTML fallback", () => {
  it("uses headings followed by lists", () => {
    const html = new TextDecoder("latin1").decode(fixture("blog-latin1.html"));
    const { draft, method, warnings } = importFromHtml(html);
    expect(method).toBe("html");
    expect(warnings[0]).toMatch(/approximative/);
    expect(draft.title).toBe("Tarte aux pommes de mamie");
    expect(draft.ingredients.map((i) => i.label)).toEqual(["pâte brisée", "pommes", "sucre", "sucre vanillé"]);
    expect(draft.steps).toHaveLength(4);
    expect(draft.steps[3]).toMatchObject({ durationMinutes: 35, type: "cuisson" });
    expect(draft.steps.some((s) => s.text.includes("Super"))).toBe(false);
    expect(draft.servings).toBe(4);
  });

  it("handles <br>-separated ingredients and paragraph steps", () => {
    const { draft } = importFromHtml(fixture("blog-br.html").toString());
    expect(draft.ingredients.map((i) => i.label)).toEqual([
      "potimarron", "pommes de terre", "oignon", "crème liquide", "bouillon de légumes",
    ]);
    expect(draft.steps.map((s) => s.text)).toEqual([
      "Couper le potimarron en morceaux.",
      "Faire revenir l'oignon dans une casserole.",
      "Ajouter les légumes et le bouillon, cuire 25 min puis mixer.",
    ]);
    expect(draft.freezable).toBe(true); // velouté
  });

  it("reads microdata", () => {
    const html = `<div itemscope itemtype="https://schema.org/Recipe"><h1 itemprop="name">Crêpes</h1>
      <span itemprop="recipeYield">8 crêpes</span>
      <ul><li itemprop="recipeIngredient">250 g de farine</li><li itemprop="recipeIngredient">4 œufs</li></ul>
      <div itemprop="recipeInstructions"><p>Mélanger.</p><p>Laisser reposer 1 h.</p></div></div>`;
    const { draft } = importFromHtml(html);
    expect(draft).toMatchObject({ title: "Crêpes", servings: 8 });
    expect(draft.ingredients).toHaveLength(2);
    expect(draft.steps[1]).toMatchObject({ type: "repos", durationMinutes: 60 });
  });
});

describe("pasted text", () => {
  it("parses an Instagram-like caption", async () => {
    const { draft, flags } = await importFromText(`🍝 Pâtes crémeuses au saumon
Prêtes en 20 minutes !
Pour 2 personnes

Ingrédients :
- 200 g de pâtes
- 1 pavé de saumon
- 15 cl de crème
- 1/2 citron

Préparation :
1. Cuire les pâtes 10 min.
2. Poêler le saumon 5 min.
3. Mélanger avec la crème et le citron.

#pasta #saumon #recettefacile`);
    expect(draft.title).toBe("🍝 Pâtes crémeuses au saumon");
    expect(draft.description).toBe("Prêtes en 20 minutes !");
    expect(draft.servings).toBe(2);
    expect(draft.ingredients).toHaveLength(4);
    expect(draft.ingredients[3]).toMatchObject({ quantity: 0.5, label: "citron" });
    expect(draft.steps).toHaveLength(3);
    expect(draft.tags).toContain("poisson");
    expect(draft.fridgeDays).toBe(2);
    expect(flags.prepMinutes).toBe("missing");
  });

  it("splits text without headings", async () => {
    const { draft } = await importFromText("Omelette\n3 œufs\n1 pincée de sel\nBattre les œufs avec le sel.\nCuire 3 min à la poêle.");
    expect(draft.title).toBe("Omelette");
    expect(draft.ingredients.map((i) => i.label)).toEqual(["œufs", "sel"]);
    expect(draft.steps).toHaveLength(2);
    expect(draft.servings).toBe(4);
  });

  it("does not take a sub-heading for servings", async () => {
    const { draft } = await importFromText("Tarte\nPour 6 personnes\nIngrédients\nPour la pâte : 250 g de farine\n125 g de beurre\nPréparation\nMélanger.");
    expect(draft.servings).toBe(6);
    expect(draft.ingredients[0].label).toMatch(/farine/);
  });

  it("flags lines whose quantity was not understood", async () => {
    const { flags } = await importFromText("Test\nIngrédients\n200 g de farine\nun peu de 3 épices\nPréparation\nMélanger");
    expect(flags.ingredients).toEqual({ 1: "guess" });
  });
});

describe("isPrivateAddress", () => {
  it.each([
    ["127.0.0.1", true], ["10.1.2.3", true], ["192.168.1.1", true], ["172.20.0.1", true],
    ["169.254.169.254", true], ["100.64.0.1", true], ["0.0.0.0", true], ["::1", true],
    ["fd00::1", true], ["fe80::1", true], ["::ffff:127.0.0.1", true],
    ["8.8.8.8", false], ["151.101.1.1", false], ["2606:4700::1111", false], ["172.32.0.1", false],
  ])("%s → %s", (ip, priv) => expect(isPrivateAddress(ip)).toBe(priv));
});

describe("fetchPage", () => {
  let server: http.Server;
  let base: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/marmiton") return res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(fixture("marmiton.html"));
      if (req.url === "/latin1") return res.writeHead(200, { "Content-Type": "text/html" }).end(fixture("blog-latin1.html"));
      if (req.url === "/redirect") return res.writeHead(301, { Location: "/marmiton" }).end();
      if (req.url === "/loop") return res.writeHead(302, { Location: "/loop" }).end();
      if (req.url === "/forbidden") return res.writeHead(403).end();
      if (req.url === "/pdf") return res.writeHead(200, { "Content-Type": "application/pdf" }).end("%PDF");
      if (req.url === "/empty") return res.writeHead(200, { "Content-Type": "text/html" }).end("<p>Rien ici</p>");
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  const withPrivate = async <T>(fn: () => Promise<T>) => {
    process.env.IMPORT_ALLOW_PRIVATE = "1";
    try {
      return await fn();
    } finally {
      delete process.env.IMPORT_ALLOW_PRIVATE;
    }
  };

  it("refuses internal addresses and other schemes", async () => {
    await expect(fetchPage(`${base}/marmiton`)).rejects.toThrow("n'est pas autorisée");
    await expect(fetchPage("http://169.254.169.254/latest/meta-data")).rejects.toThrow(ImportError);
    await expect(fetchPage("file:///etc/passwd")).rejects.toThrow("http(s)");
    await expect(fetchPage("pas une url")).rejects.toThrow("Adresse invalide");
  });

  it("follows redirects and imports", () =>
    withPrivate(async () => {
      const r = await importFromUrl(`${base}/redirect`);
      expect(r.draft.title).toBe("Chili con carne facile");
      expect(r.draft.sourceUrl).toBe(`${base}/redirect`);
    }));

  it("decodes latin-1 pages", () =>
    withPrivate(async () => {
      const { html } = await fetchPage(`${base}/latin1`);
      expect(html).toContain("Ingrédients");
      expect(html).toContain("Préparation");
    }));

  it("explains failures", () =>
    withPrivate(async () => {
      await expect(fetchPage(`${base}/loop`)).rejects.toThrow("redirections");
      await expect(fetchPage(`${base}/forbidden`)).rejects.toThrow("Coller un texte");
      await expect(fetchPage(`${base}/nope`)).rejects.toThrow("erreur 404");
      await expect(fetchPage(`${base}/pdf`)).rejects.toThrow("page web");
      await expect(importFromUrl(`${base}/empty`)).rejects.toThrow("Aucune recette");
    }));
});
