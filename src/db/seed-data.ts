import type { AISLES, MEAL_TYPES, STEP_TYPES, UNITS } from "./schema";

type Aisle = (typeof AISLES)[number];
type Unit = (typeof UNITS)[number];

export type SeedRecipe = {
  title: string;
  description?: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  mealType: (typeof MEAL_TYPES)[number];
  tags: string[];
  fridgeDays: number;
  freezable: boolean;
  // [nom normalisé, rayon, quantité, unité, libellé original]
  ingredients: [string, Aisle, number | null, Unit | null, string][];
  // [texte, durée min, type, équipement, température]
  steps: [string, number | null, (typeof STEP_TYPES)[number], string | null, number | null][];
};

export const SEED_RECIPES: SeedRecipe[] = [
  {
    title: "Chili con carne",
    servings: 4,
    prepMinutes: 20,
    cookMinutes: 60,
    mealType: "plat",
    tags: ["viande", "mijoté"],
    fridgeDays: 3,
    freezable: true,
    ingredients: [
      ["boeuf haché", "boucherie", 500, "g", "500 g de bœuf haché"],
      ["oignon", "fruits-legumes", 2, "piece", "2 oignons"],
      ["ail", "fruits-legumes", 2, "gousse", "2 gousses d'ail"],
      ["poivron rouge", "fruits-legumes", 1, "piece", "1 poivron rouge"],
      ["haricots rouges", "epicerie", 1, "boite", "1 boîte de haricots rouges"],
      ["tomates concassées", "epicerie", 400, "g", "400 g de tomates concassées"],
      ["cumin", "epicerie", 1, "cac", "1 c. à c. de cumin"],
      ["huile d'olive", "epicerie", 2, "cas", "2 c. à s. d'huile d'olive"],
    ],
    steps: [
      ["Émincer les oignons, hacher l'ail, couper le poivron en dés.", 10, "preparation", null, null],
      ["Faire revenir oignons et ail dans l'huile.", 5, "cuisson", "plaque", null],
      ["Ajouter le bœuf et le faire dorer.", 8, "cuisson", "plaque", null],
      ["Ajouter poivron, tomates, cumin ; laisser mijoter à couvert.", 40, "cuisson", "plaque", null],
      ["Ajouter les haricots égouttés et poursuivre la cuisson.", 10, "cuisson", "plaque", null],
    ],
  },
  {
    title: "Gratin dauphinois",
    servings: 4,
    prepMinutes: 20,
    cookMinutes: 60,
    mealType: "plat",
    tags: ["végé", "four"],
    fridgeDays: 3,
    freezable: false,
    ingredients: [
      ["pomme de terre", "fruits-legumes", 1, "kg", "1 kg de pommes de terre"],
      ["crème liquide", "cremerie", 40, "cl", "40 cl de crème liquide"],
      ["lait", "cremerie", 30, "cl", "30 cl de lait"],
      ["ail", "fruits-legumes", 1, "gousse", "1 gousse d'ail"],
      ["noix de muscade", "epicerie", 1, "pincee", "1 pincée de muscade"],
    ],
    steps: [
      ["Préchauffer le four à 180 °C.", 10, "preparation", "four", 180],
      ["Éplucher et trancher finement les pommes de terre.", 15, "preparation", null, null],
      ["Frotter le plat avec l'ail, disposer les pommes de terre, couvrir de lait et crème muscadés.", 5, "preparation", null, null],
      ["Enfourner.", 60, "cuisson", "four", 180],
    ],
  },
  {
    title: "Saumon au four et brocolis",
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 20,
    mealType: "plat",
    tags: ["poisson", "rapide", "four"],
    fridgeDays: 2,
    freezable: false,
    ingredients: [
      ["pavé de saumon", "poissonnerie", 4, "piece", "4 pavés de saumon"],
      ["brocoli", "fruits-legumes", 1, "piece", "1 brocoli"],
      ["citron", "fruits-legumes", 1, "piece", "1 citron"],
      ["huile d'olive", "epicerie", 2, "cas", "2 c. à s. d'huile d'olive"],
      ["aneth", "fruits-legumes", 1, "botte", "1 botte d'aneth"],
    ],
    steps: [
      ["Préchauffer le four à 200 °C.", 10, "preparation", "four", 200],
      ["Détailler le brocoli en fleurettes, presser le citron, ciseler l'aneth.", 10, "preparation", null, null],
      ["Disposer saumon et brocoli sur une plaque, arroser d'huile et de citron, parsemer d'aneth.", 3, "preparation", null, null],
      ["Enfourner.", 18, "cuisson", "four", 200],
    ],
  },
  {
    title: "Curry de pois chiches",
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 25,
    mealType: "plat",
    tags: ["végé", "épicé"],
    fridgeDays: 4,
    freezable: true,
    ingredients: [
      ["pois chiches", "epicerie", 2, "boite", "2 boîtes de pois chiches"],
      ["lait de coco", "epicerie", 40, "cl", "40 cl de lait de coco"],
      ["oignon", "fruits-legumes", 1, "piece", "1 oignon"],
      ["ail", "fruits-legumes", 2, "gousse", "2 gousses d'ail"],
      ["gingembre", "fruits-legumes", 20, "g", "20 g de gingembre frais"],
      ["épinards", "fruits-legumes", 200, "g", "200 g d'épinards"],
      ["curry en poudre", "epicerie", 2, "cas", "2 c. à s. de curry"],
      ["riz basmati", "epicerie", 300, "g", "300 g de riz basmati"],
    ],
    steps: [
      ["Émincer l'oignon, hacher l'ail et le gingembre.", 8, "preparation", null, null],
      ["Faire revenir oignon, ail, gingembre et curry.", 5, "cuisson", "plaque", null],
      ["Ajouter pois chiches égouttés et lait de coco, laisser mijoter.", 15, "cuisson", "plaque", null],
      ["Cuire le riz.", 12, "cuisson", "plaque", null],
      ["Ajouter les épinards en fin de cuisson.", 3, "cuisson", "plaque", null],
    ],
  },
  {
    title: "Poulet rôti aux légumes",
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 75,
    mealType: "plat",
    tags: ["viande", "four"],
    fridgeDays: 3,
    freezable: true,
    ingredients: [
      ["poulet entier", "boucherie", 1, "piece", "1 poulet fermier (1,5 kg)"],
      ["carotte", "fruits-legumes", 4, "piece", "4 carottes"],
      ["pomme de terre", "fruits-legumes", 600, "g", "600 g de pommes de terre grenaille"],
      ["oignon", "fruits-legumes", 2, "piece", "2 oignons"],
      ["thym", "fruits-legumes", 1, "botte", "1 botte de thym"],
      ["huile d'olive", "epicerie", 3, "cas", "3 c. à s. d'huile d'olive"],
    ],
    steps: [
      ["Préchauffer le four à 200 °C.", 10, "preparation", "four", 200],
      ["Éplucher et couper carottes, pommes de terre et oignons en morceaux.", 15, "preparation", null, null],
      ["Placer le poulet sur les légumes, arroser d'huile, ajouter le thym.", 3, "preparation", null, null],
      ["Enfourner en arrosant à mi-cuisson.", 75, "cuisson", "four", 200],
      ["Laisser reposer le poulet avant de découper.", 10, "repos", null, null],
    ],
  },
  {
    title: "Soupe de lentilles corail",
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 25,
    mealType: "plat",
    tags: ["végé", "soupe"],
    fridgeDays: 4,
    freezable: true,
    ingredients: [
      ["lentilles corail", "epicerie", 250, "g", "250 g de lentilles corail"],
      ["carotte", "fruits-legumes", 2, "piece", "2 carottes"],
      ["oignon", "fruits-legumes", 1, "piece", "1 oignon"],
      ["lait de coco", "epicerie", 20, "cl", "20 cl de lait de coco"],
      ["bouillon de légumes", "epicerie", 1, "l", "1 l de bouillon de légumes"],
      ["cumin", "epicerie", 1, "cac", "1 c. à c. de cumin"],
    ],
    steps: [
      ["Émincer l'oignon, couper les carottes en rondelles.", 8, "preparation", null, null],
      ["Faire suer l'oignon avec le cumin.", 4, "cuisson", "plaque", null],
      ["Ajouter carottes, lentilles et bouillon ; cuire.", 20, "cuisson", "plaque", null],
      ["Ajouter le lait de coco et mixer.", 3, "preparation", "mixeur", null],
    ],
  },
  {
    title: "Pâtes à la bolognaise",
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 45,
    mealType: "plat",
    tags: ["viande", "pâtes"],
    fridgeDays: 3,
    freezable: true,
    ingredients: [
      ["boeuf haché", "boucherie", 400, "g", "400 g de bœuf haché"],
      ["oignon", "fruits-legumes", 1, "piece", "1 oignon"],
      ["carotte", "fruits-legumes", 1, "piece", "1 carotte"],
      ["céleri", "fruits-legumes", 1, "piece", "1 branche de céleri"],
      ["tomates concassées", "epicerie", 800, "g", "800 g de tomates concassées"],
      ["spaghetti", "epicerie", 400, "g", "400 g de spaghetti"],
      ["parmesan", "cremerie", 50, "g", "50 g de parmesan"],
    ],
    steps: [
      ["Hacher finement oignon, carotte et céleri.", 10, "preparation", null, null],
      ["Faire revenir les légumes puis la viande.", 10, "cuisson", "plaque", null],
      ["Ajouter les tomates et laisser mijoter.", 35, "cuisson", "plaque", null],
      ["Cuire les pâtes.", 10, "cuisson", "plaque", null],
      ["Râper le parmesan.", 2, "preparation", null, null],
    ],
  },
  {
    title: "Quiche poireaux et chèvre",
    servings: 6,
    prepMinutes: 20,
    cookMinutes: 35,
    mealType: "plat",
    tags: ["végé", "four"],
    fridgeDays: 3,
    freezable: true,
    ingredients: [
      ["pâte brisée", "cremerie", 1, "piece", "1 pâte brisée"],
      ["poireau", "fruits-legumes", 3, "piece", "3 poireaux"],
      ["fromage de chèvre", "cremerie", 150, "g", "150 g de bûche de chèvre"],
      ["oeuf", "cremerie", 3, "piece", "3 œufs"],
      ["crème liquide", "cremerie", 20, "cl", "20 cl de crème"],
      ["beurre", "cremerie", 20, "g", "20 g de beurre"],
    ],
    steps: [
      ["Préchauffer le four à 180 °C.", 10, "preparation", "four", 180],
      ["Émincer les poireaux et les faire fondre au beurre.", 15, "cuisson", "plaque", null],
      ["Battre œufs et crème, trancher le chèvre.", 5, "preparation", null, null],
      ["Garnir la pâte et enfourner.", 35, "cuisson", "four", 180],
    ],
  },
];
