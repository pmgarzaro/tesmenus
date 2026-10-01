# Tes menus

Application web perso de planification de repas pour le foyer : recettes, planning de la semaine, liste de courses et batch cooking.

Tout tourne en local, **sans API payante** : pas de LLM. L'import des recettes repose sur le JSON-LD `schema.org/Recipe`, l'analyse heuristique du HTML ou du texte, et l'OCR local pour les photos. Le planning et le batch cooking sont calculés par des algorithmes en code.

## Stack

Next.js 16 (App Router) + TypeScript, Drizzle ORM sur SQLite (`better-sqlite3`), Tailwind CSS 4, zod, Vitest.

## Développement

```bash
cp .env.example .env      # définir APP_PASSWORD
npm install
npm run db:seed           # optionnel : 8 recettes d'exemple
npm run dev               # http://localhost:3000
```

Au démarrage, la base `data/app.db` est créée et les migrations (`drizzle/`) sont appliquées automatiquement.

| Commande | Rôle |
|---|---|
| `npm test` | Tests unitaires (Vitest) |
| `npm run lint` | Vérification TypeScript |
| `npm run db:generate` | Génère une migration après modification de `src/db/schema.ts` |
| `npm run db:seed` | Ajoute les recettes d'exemple si la bibliothèque est vide |

## Déploiement (Docker)

```bash
echo "APP_PASSWORD=monmotdepasse" > .env
docker compose up -d --build
```

- La base SQLite et les images uploadées sont dans `./data` (volume monté).
- **Sauvegarde** : copier le dossier `data/`, ou utiliser *Réglages → Exporter toute la base (JSON)* (`/api/export`).
- Les recettes d'exemple peuvent être chargées depuis *Réglages*.
- Derrière un reverse proxy HTTPS, passer `COOKIE_SECURE=true`.

## Variables d'environnement

| Variable | Description |
|---|---|
| `APP_PASSWORD` | Mot de passe partagé (obligatoire) |
| `SESSION_SECRET` | Secret de signature du cookie (par défaut : `APP_PASSWORD`) |
| `DATA_DIR` | Dossier des données (défaut `./data`) |
| `COOKIE_SECURE` | `true` pour un cookie `Secure` (HTTPS) |

## Avancement

1. ✅ Squelette Next.js + SQLite + schéma + auth par mot de passe + Docker
2. ⬜ CRUD recettes manuel + bibliothèque
3. ⬜ Import par URL (JSON-LD puis heuristique HTML)
4. ⬜ Import par photo (OCR local) + écran de relecture
5. ⬜ Planning (génération + édition)
6. ⬜ Liste de courses (agrégation + conversion + rayons)
7. ⬜ Batch cooking (fiche + mode cuisine)
8. ⬜ Finitions mobile, tests
