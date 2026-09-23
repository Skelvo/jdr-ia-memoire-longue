# jdr-ia-memoire-longue

App de jeu de rôle / histoires interactives avec IA à mémoire longue. Voir [`SPEC.md`](./SPEC.md) pour la spec complète (vision, stack, modèle de mémoire, plan par phases).

**État actuel : Phase 1 — squelette du pipeline de mémoire, pas encore branché sur un vrai projet Supabase/Anthropic.**

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

## Pipeline d'un tour

- `POST /api/turn` — construit le contexte (fiche du monde + résumés + fenêtre
  récente), appelle Claude Sonnet 5 en streaming (SSE), sauvegarde le tour.
- `POST /api/worker/update-memory` — déclenché en arrière-plan après chaque tour :
  met à jour la fiche du monde (JSON Patch), extrait les souvenirs marquants, génère
  les résumés tous les 20 tours.

Détails complets : `SPEC.md` §3, §5, §7.

## Prochaines étapes

1. Créer un vrai projet Supabase et y appliquer la migration.
2. Trancher les questions ouvertes de `SPEC.md` §13 (nom définitif, quotas, fournisseur
   d'embeddings, web/PWA vs natif, ligne éditoriale).
3. Écran de jeu (chat + streaming) côté front.
4. Script de test "mémoire à 150 tours" (`SPEC.md` §11).
