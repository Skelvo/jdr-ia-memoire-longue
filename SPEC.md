# SPEC — App de jeu de rôle / histoires interactives avec IA à mémoire longue

Document de référence pour Claude Code. Nom du projet : **jdr-ia-memoire-longue** (provisoire).

## 0. Consignes de travail pour Claude Code

- Travaille **par phases** (voir §12). Ne passe à la phase suivante que quand la précédente est testée et validée.
- **Teste avant de livrer** : lance les tests, vérifie que ça tourne, corrige toi-même avant de présenter le résultat. Pas de code non vérifié.
- Si un choix technique important n'est pas tranché dans ce document, propose 2-3 options avec un avis, puis attends la réponse.
- Si une formulation, un nom ou un texte de l'interface paraît maladroit, le signaler et proposer des alternatives plutôt que de trancher seul.
- Interface et contenus **en français**. Code, commentaires et noms de variables **en anglais**.
- Ne jamais mettre de clé API dans le code : variables d'environnement uniquement (`.env.local`, fourni dans `.env.example`).
- Commits petits et clairs.

## 1. Vision

Une app où l'utilisateur vit une histoire de jeu de rôle avec une IA maître du jeu (MJ) qui se souvient de tout, sur des semaines ou des mois : personnages rencontrés, lieux, choix, objets, promesses, conséquences.

### Le problème qu'on résout

Les apps de chat IA existantes (PolyBuzz, Chai, Talkie, etc.) ont une mémoire qui se dégrade : le bot oublie le contexte, mélange les personnages, oublie son propre point de départ.

### Notre différenciation

1. **Mémoire longue réelle** : le monde reste cohérent après des centaines de messages.
2. **Mémoire visible et modifiable** : un "Carnet" que le joueur peut consulter et corriger (fiche du monde, personnages, quêtes). Chez les concurrents, la mémoire est une boîte noire.
3. **Pas de pubs envahissantes**, modération claire et prévisible.

### Ce que l'app n'est PAS (pour la v1)

- Pas de réseau social, pas de communauté, pas de création publique de personnages.
- Pas de multijoueur.
- Pas de voix, pas d'images générées.
- Pas de mode "compagnon romantique".

## 2. Stack technique

| Couche | Choix |
|---|---|
| Front | Next.js (App Router) + TypeScript + Tailwind, en PWA (installable sur téléphone) |
| Backend | Routes API Next.js (serverless) |
| Base de données | Supabase (Postgres + Auth + Row Level Security) |
| Recherche sémantique | pgvector (extension Supabase) |
| IA narration | Claude Sonnet 5 (`claude-sonnet-5`) |
| IA tâches de fond | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) |
| Embeddings | Voyage AI (`voyage-3` ou équivalent multilingue) — Anthropic ne fournit pas d'API d'embeddings. À défaut : OpenAI `text-embedding-3-small`. Vérifier la dimension du vecteur et l'adapter au schéma. |
| Streaming | Server-Sent Events (réponse du MJ affichée token par token) |
| Hébergement | Vercel |

Vérifier les tarifs et limites actuels de chaque API avant de calibrer le modèle économique.

Variables d'environnement attendues :

```
ANTHROPIC_API_KEY=
VOYAGE_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## 3. Principe fondamental : comment marche la mémoire

Le LLM n'a aucune mémoire propre. À chaque message du joueur, le backend construit un prompt contenant tout ce dont l'IA a besoin. La "mémoire longue" = notre système qui choisit quoi lui montrer.

### Les 4 couches de contexte (assemblées à chaque tour)

1. **Fiche du monde** (`world_state`) — JSON structuré, source de vérité : personnages, lieux, quêtes, relations, inventaire, faits établis. Toujours injectée en entier (cible < 2 500 tokens).
2. **Résumés hiérarchiques** (`summaries`) — l'histoire condensée. Tous les ~20 tours, on résume. Quand il y a trop de résumés, on fusionne les anciens en un méta-résumé.
3. **Souvenirs pertinents** (`memories`) — événements importants stockés avec embeddings. À chaque tour, on récupère les k=6 plus proches sémantiquement du message du joueur + du dernier échange.
4. **Fenêtre récente** (`messages`) — les ~16 derniers messages, verbatim.

### Mise à jour après chaque tour (asynchrone, avec Haiku)

1. Extrait les changements de la fiche du monde (diff JSON) et les applique.
2. Extrait les souvenirs marquants (importance 3 à 5 sur 5), les embedde et les stocke.
3. Tous les 20 tours : génère un résumé de la tranche écoulée.
4. Quand `summaries` de niveau 1 dépasse 5 entrées : fusionne en un résumé de niveau 2.

C'est cette boucle qui empêche la dégradation. **Ne pas la sauter, même en v1.**

## 4. Modèle de données (Supabase / Postgres)

Voir `supabase/migrations/0001_init.sql` pour le schéma exécutable.

Structure de la fiche du monde (`world_state.state`) :

```json
{
  "player": { "name": "", "traits": [], "goals": [], "inventory": [], "status": "" },
  "characters": [
    {
      "id": "elyra",
      "name": "Elyra",
      "description": "",
      "relation_to_player": "alliée méfiante",
      "status": "vivante",
      "last_seen": "Forge de Karn",
      "secrets_known_by_player": []
    }
  ],
  "locations": [ { "id": "", "name": "", "description": "", "notes": "" } ],
  "quests": [ { "id": "", "title": "", "status": "active|done|failed", "details": "" } ],
  "established_facts": [ "Le roi est mort depuis 3 ans." ],
  "world_rules": [ "La magie coûte de la mémoire à celui qui l'utilise." ],
  "timeline": [ { "turn": 12, "event": "Le joueur a brûlé le pont." } ]
}
```

Règle : le MJ ne doit jamais contredire `established_facts`, `characters` ni `world_rules`.

**Row Level Security obligatoire** sur toutes les tables : un utilisateur ne voit et ne modifie que ses propres mondes (`worlds.user_id = auth.uid()`, et les autres tables via jointure sur `world_id`).

## 5. Le pipeline d'un tour (endpoint `POST /api/turn`)

1. Vérifier l'auth et les quotas (§8).
2. Sauvegarder le message du joueur (`messages`).
3. Construire le contexte :
   - `system` : règles du MJ (§6) — avec `cache_control` (prompt caching) car identique à chaque tour.
   - Fiche du monde (JSON).
   - Derniers résumés (niveau 2 puis niveau 1 les plus récents).
   - Top-k souvenirs pertinents (recherche vectorielle sur : message du joueur + dernier message du MJ).
   - Fenêtre récente (16 derniers messages).
4. Appeler Claude Sonnet 5 en streaming, `max_tokens` ~ 900.
5. Streamer la réponse au client, la sauvegarder à la fin.
6. Déclencher en arrière-plan (ne pas bloquer la réponse) : `POST /api/worker/update-memory` (§7).
7. Mettre à jour `usage_daily`.

Prévoir une gestion propre des erreurs (timeout, rate limit API, réponse vide) avec retry limité et message clair côté joueur.

## 6. Prompt système du MJ (version de départ, à itérer)

```
Tu es le Maître du Jeu d'une histoire interactive en français.

RÔLE
- Tu narres le monde, tu incarnes tous les personnages non-joueurs, tu réagis aux actions du joueur.
- Tu ne joues jamais à la place du joueur : tu ne décides pas de ses actions, pensées ou paroles.
- Tu proposes des situations, des choix, des conséquences. Tu ne bloques pas l'histoire.

COHÉRENCE (règle absolue)
- Tu reçois une FICHE DU MONDE, des RÉSUMÉS et des SOUVENIRS. Ce sont des faits établis.
- Tu ne contredis jamais ces informations. Si le joueur en contredit une, tu intègres la contradiction comme un événement du jeu plutôt que de l'ignorer.
- Les personnages gardent leur personnalité, leurs souvenirs et leurs relations avec le joueur.
- Tu fais vivre les conséquences des actions passées, même anciennes. Les promesses, les dettes, les ennemis reviennent.

STYLE
- Français naturel, immersif, vivant. Pas de méta-commentaire sur ton fonctionnement.
- Réponses de 120 à 350 mots en général, plus courtes si le joueur agit vite.
- Termine en laissant la main au joueur (situation ouverte, pas de liste de choix systématique).
- Ton : {{tone}}. Genre : {{genre}}.

LIMITES
- Contenu adapté à un public adulte mais sans contenu sexuel explicite. Violence et thèmes sombres autorisés avec mesure.
- Aucun contenu sexuel impliquant des mineurs, aucune incitation à l'automutilation, aucun contenu haineux réel.
- Si le joueur semble en détresse réelle (hors fiction), sors doucement du jeu et réponds avec empathie.
```

Les variables `{{tone}}` et `{{genre}}` viennent de `worlds`.

## 7. Worker de mise à jour de la mémoire (Haiku)

### 7.1 Extraction après chaque tour

Entrée : fiche actuelle + dernier échange (joueur + MJ). Sortie : JSON strict, validé avec un schéma (zod).

```
Tu maintiens la mémoire d'un jeu de rôle. À partir de la FICHE ACTUELLE et du DERNIER ÉCHANGE, réponds avec :

{
  "state_patch": [ /* opérations JSON Patch (RFC 6902) à appliquer à la fiche */ ],
  "new_memories": [ { "content": "1-2 phrases factuelles", "importance": 1-5 } ]
}

Règles :
- N'ajoute que ce qui est NOUVEAU ou MODIFIÉ dans le dernier échange.
- Ne jamais supprimer un fait établi sauf s'il est explicitement invalidé dans l'échange.
- Une "memory" = un événement ou un fait qu'on voudra retrouver plus tard (rencontre, promesse, découverte...).
- importance 5 = change le cours de l'histoire, 3 = notable, 1-2 = à ignorer (ne pas retourner).
- Ne retourne que les mémoires d'importance >= 3.
- Réponds uniquement avec le JSON, sans texte ni balises.
```

Robustesse : valider le JSON, retry 1 fois en cas d'échec, sinon log l'erreur et continuer (ne jamais casser le jeu à cause du worker). Appliquer le patch de façon transactionnelle, incrémenter `version`, écrire dans `world_state_history`.

### 7.2 Résumés

- Tous les **20 tours** : résumé niveau 1 de la tranche (200-300 mots), centré sur les événements, décisions, relations, questions ouvertes.
- Quand il y a **> 5 résumés niveau 1** : fusion des 5 plus anciens en 1 résumé niveau 2 (300-400 mots).

### 7.3 Contrôle de taille de la fiche

Si `world_state` dépasse ~2 500 tokens : job de compaction (Haiku) qui archive les personnages/lieux inactifs depuis longtemps dans `memories` et les retire de la fiche active (ils reviennent via la recherche sémantique si le joueur les mentionne).

## 8. Coûts, quotas et limites

- Prompt caching sur le prompt système et la fiche.
- Quotas par utilisateur (gratuit : ex. 30 messages/jour, à ajuster), suivis dans `usage_daily`.
- `max_tokens` limité sur les réponses du MJ.
- Rate limit par IP et par utilisateur sur `/api/turn`.
- Un tableau de bord de coûts simple (script ou vue SQL) : coût moyen par tour, par utilisateur, par monde.
- Ne jamais autoriser un contexte qui grossit sans limite : chaque couche a un plafond de tokens.

Monétisation (plus tard, pas en v1) : abonnement mensuel avec plus de messages + meilleur modèle. Pas de pubs intrusives.

## 9. Interface (mobile first)

### Écrans v1

1. **Connexion / inscription** (email + magic link ou Google via Supabase Auth).
2. **Mes histoires** : liste des mondes, bouton "Nouvelle histoire".
3. **Création d'histoire** : choix d'un genre, d'un ton, d'un pitch de départ (templates + champ libre), création du personnage joueur (nom, description courte).
4. **Écran de jeu** : chat plein écran, réponse du MJ en streaming, champ de saisie en bas, bouton "Carnet".
5. **Carnet** (le point fort) : onglets Personnages / Lieux / Quêtes / Faits / Résumé. Le joueur peut modifier ou supprimer une entrée (la modification est enregistrée avec `source = 'player'` et prime sur l'IA).
6. **Paramètres** : quota du jour, suppression d'un monde, suppression du compte et export des données.

### Détails UX importants

- Streaming fluide, pas de saut de layout.
- Bouton "Régénérer la dernière réponse" et "Annuler le dernier tour" (doit aussi annuler les effets du worker sur la fiche via `world_state_history`).
- Un petit indicateur discret quand la mémoire est mise à jour ("Carnet mis à jour").
- Thème sombre par défaut, lisible pour de longues sessions.

## 10. Sécurité, modération, légal

- **Public 18+** : case à cocher / confirmation d'âge à l'inscription. Bien vérifier les règles de l'App Store si publication native un jour.
- **Modération des entrées** : filtre simple avant l'appel du MJ (mots-clés + éventuellement un appel Haiku de classification) pour bloquer le contenu clairement interdit (mineurs, incitation à la violence réelle, etc.).
- Bouton **"Signaler un problème"** sur chaque réponse du MJ.
- **RGPD** : politique de confidentialité, consentement, suppression complète des données à la demande, pas de revente de données. Conversations privées (pas de partage public en v1).
- Ne jamais logger les contenus des conversations dans des outils tiers sans nécessité.
- Clés API uniquement côté serveur.

## 11. Tests (indispensables)

### Test clé : la mémoire longue

Un script automatisé qui :

1. Crée un monde de test.
2. Simule 150 tours avec un joueur scripté.
3. Plante des faits aux tours 5, 15, 30 (ex. : "le forgeron s'appelle Karn et a peur du feu", "j'ai promis à Elyra de revenir avant l'hiver", "mon épée est cassée").
4. Aux tours 100, 120, 140, pose des questions de rappel via le jeu.
5. Vérifie automatiquement (LLM-juge Haiku ou correspondance de mots-clés) que le MJ s'en souvient et ne se contredit pas.
6. Sort un rapport : taux de rappel, contradictions, coût total, taille de la fiche.

### Autres tests

- Validation JSON du worker (cas de sortie invalide).
- RLS : un utilisateur A ne peut pas lire les données de B.
- Annulation d'un tour (restaure bien la fiche).
- Quotas et rate limiting.
- Comportement en cas de panne de l'API (message clair, pas de perte de données).

## 12. Plan par phases

### Phase 1 — Prototype de la mémoire (le plus important)

- Next.js + Supabase, auth, une seule histoire.
- Pipeline complet d'un tour (§5), fiche du monde, fenêtre récente, résumés.
- Écran de jeu simple avec streaming.
- Script de test 150 tours (§11).
- Objectif : prouver que la mémoire tient.

### Phase 2 — Mémoire sémantique + Carnet

- Embeddings + pgvector + souvenirs pertinents.
- Écran Carnet consultable et modifiable.
- Annuler / régénérer un tour.

### Phase 3 — Produit utilisable

- Création d'histoires (genres, tons, templates), liste des mondes.
- Quotas, coûts, tableau de bord.
- Modération, signalement, RGPD, paramètres.
- PWA installable.

### Phase 4 — Ouverture (plus tard)

- Monétisation, plusieurs types d'histoires, éventuellement modes "compagnon" ou "coach" en réutilisant le même moteur de mémoire.

## 13. Questions ouvertes (à trancher avant d'aller plus loin)

1. Nom du projet et identité visuelle.
2. Quota gratuit par jour et prix d'un éventuel abonnement.
3. Fournisseur d'embeddings définitif (Voyage AI vs OpenAI).
4. Web/PWA uniquement, ou application native plus tard (React Native / Expo) ?
5. Ligne éditoriale exacte sur les thèmes sombres et adultes.

## 14. Définition de "terminé" pour la Phase 1

- Je peux jouer une histoire de 150+ messages sur mon téléphone.
- Le MJ retrouve des faits plantés 100+ tours plus tôt.
- La fiche du monde se met à jour toute seule et reste sous 2 500 tokens.
- Le script de test passe et affiche un rapport lisible.
- Le coût moyen par tour est mesuré et affiché.
