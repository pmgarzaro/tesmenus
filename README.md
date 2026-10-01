# Tes menus

Application web perso de planification de repas pour le foyer : recettes, planning de la semaine, liste de courses et batch cooking.

Tout tourne en local, **sans API payante** : pas de LLM. L'import des recettes repose sur le JSON-LD `schema.org/Recipe`, l'analyse heuristique du HTML ou du texte, et l'OCR local pour les photos. Le planning et le batch cooking sont calculés par des algorithmes en code.

## Comptes et foyers

- Chaque compte appartient à un **foyer**. Les membres d'un foyer partagent les mêmes recettes, plannings et listes de courses ; les foyers sont isolés les uns des autres.
- Au premier lancement, l'inscription est ouverte pour créer **le premier compte** (et son foyer).
- Ensuite, l'inscription se fait uniquement **sur invitation**, depuis *Réglages → Mon foyer* :
  - **Inviter dans mon foyer** : la personne rejoint ton foyer (conjoint·e, colocataire) ;
  - **Inviter un nouveau foyer** : la personne obtient son propre espace, vide et séparé (ami·e, collègue). Elle pourra à son tour inviter les membres de son foyer.
- Les liens sont valables 7 jours et utilisables une seule fois.
- Mots de passe hachés (scrypt). Pas de récupération par e-mail : un mot de passe se change depuis *Réglages → Mon compte*.
- L'export JSON ne contient que les données du foyer de la personne connectée.

## Import de recettes

- **Lien** : la page est téléchargée par le serveur, puis la recette est lue dans les données structurées `schema.org/Recipe` (JSON-LD) présentes sur la plupart des sites. À défaut : microdonnées, puis titres « Ingrédients » / « Préparation » suivis de listes.
- **Photo** (livre, fiche papier, une ou plusieurs pages) : lecture du texte en local avec Tesseract (modèle français inclus, aucune API payante), redressement automatique des photos prises de côté, lignes lues avec peu de confiance signalées. Bien adapté aux recettes imprimées, peu fiable sur l'écriture manuscrite. La photo est conservée (≤ 1600 px) et visible depuis la fiche recette, uniquement par les membres du foyer.
- **Texte collé** (légende Instagram, e-mail…) : découpage par sections, ou à défaut ligne par ligne.
- Toujours suivi d'un **écran de relecture** : les champs incertains (tags proposés, conservation, quantités non reconnues…) sont encadrés en orange.
- Sur Android, une fois l'appli ajoutée à l'écran d'accueil, « Partager → Tes menus » depuis une page de recette lance l'import.
- Sécurité : seules les adresses publiques http(s) sont acceptées (pas d'accès au réseau interne du serveur), 12 s et 4 Mo maximum.

## Planning

- **Génération** (code déterministe, sans IA) : le soir on cuisine pour plusieurs repas (réglage « portions par recette ») et le midi suivant mange les restes ; le premier midi est cuisiné pour le foyer. Pas de recette répétée sur la période, celles de la semaine précédente évitées, alternance viande / poisson / végé (d'après les tags), préférence pour les recettes qui partagent des ingrédients. Plusieurs tirages sont comparés et le meilleur est gardé.
- **Contraintes** à la création : temps maximum par jour, recettes à inclure, uniquement des plats congelables, tags à éviter.
- **Édition** d'un repas : autre recette au hasard, choix dans la bibliothèque, échange avec un autre repas, restes d'un repas précédent, repas extérieur, portions ; « Tout relancer » pour la semaine entière.
- **Historique** des plannings ; l'onglet Planning ouvre celui en cours.
- Les dates suivent le fuseau `APP_TIMEZONE` (défaut `Europe/Paris`).

## Stack

Next.js 16 (App Router) + TypeScript, Drizzle ORM sur SQLite (`better-sqlite3`), Tailwind CSS 4, zod, Vitest.

## Développement

```bash
cp .env.example .env      # optionnel
npm install
npm run dev               # http://localhost:3000
```

Au premier lancement, l'appli propose de créer le premier compte. Les recettes d'exemple se chargent depuis *Réglages*.

Au démarrage, la base `data/app.db` est créée et les migrations (`drizzle/`) sont appliquées automatiquement.

| Commande | Rôle |
|---|---|
| `npm test` | Tests unitaires (Vitest) |
| `npm run lint` | Vérification TypeScript |
| `npm run db:generate` | Génère une migration après modification de `src/db/schema.ts` |
| `npm run db:seed` | Ajoute les recettes d'exemple aux foyers dont la bibliothèque est vide |

## Déploiement (Docker)

```bash
docker compose up -d --build
```

- La base SQLite et les images uploadées sont dans `./data` (volume monté).
- **Sauvegarde** : copier le dossier `data/`, ou utiliser *Réglages → Exporter toute la base (JSON)* (`/api/export`).
- Les recettes d'exemple peuvent être chargées depuis *Réglages*.

## Déploiement sur Railway

Le dépôt contient un `railway.json` : Railway construit le `Dockerfile` et vérifie `/api/health`.

1. **New Project → Deploy from GitHub repo** → choisir ce dépôt.
2. **Variables** : aucune n'est obligatoire. `SESSION_SECRET` est optionnelle (sinon un secret est généré dans le volume).
3. **Volume** (indispensable, sinon la base est effacée à chaque déploiement) : clic droit sur le service → *Attach volume*, point de montage `/app/data`. L'appli détecte automatiquement le volume via `RAILWAY_VOLUME_MOUNT_PATH`.
4. **Settings → Networking → Generate Domain** pour obtenir l'URL publique.
5. Ouvrir l'URL et **créer le premier compte tout de suite** : tant qu'aucun compte n'existe, l'inscription est ouverte.

Le port (`PORT`) est fourni par Railway et le cookie de session passe automatiquement en `Secure` en HTTPS.

## Variables d'environnement

| Variable | Description |
|---|---|
| `SESSION_SECRET` | Secret de signature du cookie (optionnel, généré sinon) |
| `DATA_DIR` | Dossier des données (défaut : volume Railway, sinon `./data`) |
| `IMPORT_ALLOW_PRIVATE` | `1` autorise l'import depuis des adresses locales (tests uniquement, jamais en production) |
| `APP_TIMEZONE` | Fuseau horaire pour « aujourd'hui » (défaut `Europe/Paris`) |
| `COOKIE_SECURE` | Force `true`/`false` ; par défaut détecté selon HTTPS |

## Avancement

1. ✅ Squelette Next.js + SQLite + schéma + comptes et foyers + Docker / Railway
2. ✅ CRUD recettes manuel + bibliothèque (recherche, filtres, portions)
3. ✅ Import par lien (JSON-LD, puis structure HTML) et par texte collé
4. ✅ Import par photo (OCR local Tesseract) + écran de relecture
5. ✅ Planning (génération + édition + historique)
6. ⬜ Liste de courses (agrégation + conversion + rayons)
7. ⬜ Batch cooking (fiche + mode cuisine)
8. ⬜ Finitions mobile, tests
