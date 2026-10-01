import { seedIfEmpty } from "../src/db/seed";

const n = seedIfEmpty();
console.log(n ? `${n} recettes d'exemple ajoutées.` : "La bibliothèque n'est pas vide, rien à faire.");
