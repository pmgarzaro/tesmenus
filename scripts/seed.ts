import { getDb, schema } from "../src/db";
import { seedIfEmpty } from "../src/db/seed";

// Adds the sample recipes to every household whose library is empty.
const households = getDb().select().from(schema.households).all();
if (households.length === 0) console.log("Aucun foyer : crée d'abord un compte dans l'appli.");
for (const h of households) {
  const n = seedIfEmpty(h.id);
  console.log(`${h.name} : ${n ? `${n} recettes d'exemple ajoutées` : "bibliothèque non vide, rien à faire"}.`);
}
