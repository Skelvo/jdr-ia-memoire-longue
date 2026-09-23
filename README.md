# jdr-ia-memoire-longue

App de jeu de rôle / histoires interactives avec IA à mémoire longue. Voir [`SPEC.md`](./SPEC.md) pour la spec complète (vision, stack, modèle de mémoire, plan par phases).

**État actuel : Phase 1 — pipeline de mémoire + écrans de base (auth, création d'histoire, jeu). Branché sur un vrai projet Supabase ; il manque encore les clés `ANTHROPIC_API_KEY` (et `VOYAGE_API_KEY` pour la Phase 2) pour tourner de bout en bout.**

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Supabase (Postgres + Auth + RLS + pgvector)
- Claude Sonnet 5 (narration) / Claude Haiku 4.5 (tâches de fond)

## Démarrer en local

```bash
npm install
cp .env.example .env.local   # puis renseigner les clés (voir ci-dessous)
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Variables d'environnement

Voir `.env.example`. Aucune clé ne doit être committée.

- `ANTHROPIC_API_KEY` — clé API Anthropic (Claude).
- `VOYAGE_API_KEY` — clé API Voyage AI (embeddings, Phase 2). Provisoire, à trancher (SPEC.md §13).
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — projet Supabase, côté client.
- `SUPABASE_SERVICE_ROLE_KEY` — côté serveur uniquement, ne jamais exposer au client.

## Base de données

Le schéma Phase 1 est dans `supabase/migrations/0001_init.sql` (tables `worlds`,
`world_state`, `world_state_history`, `messages`, `summaries`, `memories`,
`usage_daily`, avec Row Level Security sur toutes les tables).

À appliquer sur un projet Supabase via le CLI (`supabase db push`) ou en collant le
contenu du fichier dans l'éditeur SQL du dashboard Supabase.

## Écrans

- `/login` — connexion par magic link (Supabase Auth).
- `/new` — création de l'histoire (genre, ton, pitch, personnage). Phase 1 : une
  seule histoire par joueur.
- `/play/[worldId]` — écran de jeu : chat plein écran, réponse du MJ en streaming,
  indicateur discret "Carnet mis à jour".
- `/` redirige automatiquement vers le bon écran selon l'état du joueur.

## Pipeline d'un tour

- `POST /api/turn` — vérifie l'auth et la propriété du monde (RLS), construit le
  contexte (fiche du monde + résumés + fenêtre récente), appelle Claude Sonnet 5 en
  streaming (SSE), sauvegarde le tour.
- `POST /api/worker/update-memory` — déclenché en arrière-plan après chaque tour :
  met à jour la fiche du monde (JSON Patch), extrait les souvenirs marquants, génère
  les résumés tous les 20 tours.

Détails complets : `SPEC.md` §3, §5, §7.

## Prochaines étapes

1. Renseigner `ANTHROPIC_API_KEY` dans `.env.local` pour pouvoir jouer en vrai.
2. Trancher les questions ouvertes restantes de `SPEC.md` §13 (nom définitif, quotas,
   web/PWA vs natif, ligne éditoriale). Embeddings : Voyage AI (`voyage-3`), déjà
   choisi.
3. Souvenirs sémantiques (embeddings + pgvector), écran Carnet, annuler/régénérer un
   tour — Phase 2 (`SPEC.md` §12).
4. Script de test "mémoire à 150 tours" (`SPEC.md` §11).
