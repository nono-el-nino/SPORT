# CLUB 74

Carnet d'entraînement personnel : PWA iPhone, hors ligne, inspirée du graphisme des compétitions sportives des années 1960–1970.

- **Aujourd'hui** : prochaine séance A/B (alternance selon les séances réellement terminées), semaine compacte (basket, match, jogging, prévu/réalisé), poids vers l'objectif.
- **Séance** : écran dédié, charge et reps préremplies, validation d'une série en un geste, « Machine prise ? », minuteur de repos facultatif, sauvegarde après chaque action, reprise automatique.
- **Carnet** : historique, progression des charges par exercice, courbe du poids et moyenne hebdomadaire, « Le point ».

## Démarrer

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

Le dossier `dist/` est un site statique (Netlify, Vercel, GitHub Pages, Cloudflare Pages…). Sur iPhone : Safari → Partager → « Sur l'écran d'accueil ». Une fois installée, l'app fonctionne hors ligne et les données sont mieux protégées par iOS.

## Architecture

| Fichier | Rôle |
| --- | --- |
| `src/lib/progression.ts` | Double progression déterministe (testée) |
| `src/lib/session.ts` | Logique du mode séance : préremplissage, variantes, validation |
| `src/lib/planning.ts` | Alternance A/B, semaine, moyennes de poids |
| `src/lib/facts.ts` | Faits chiffrés pour « Le point » + bilan local |
| `src/lib/store.ts`, `db.ts` | IndexedDB, écriture immédiate, fusion « dernier écrit gagne » |
| `src/lib/sync.ts` | Supabase sans SDK : code e-mail + PostgREST |
| `src/lib/backup.ts` | Export / import JSON intégral (l'import fusionne, n'efface jamais) |
| `src/styles/app.css` | Direction artistique |
| `supabase/` | Schéma SQL (RLS) et fonction Edge `le-point` |

### Règles de progression

1. Toutes les séries sous le haut de fourchette → même charge, +1 rep par série.
2. Toutes au maximum, exécution « maîtrisée » → hausse de l'incrément de l'exercice.
3. Qualité non renseignée → charge conservée, hausse proposée en un geste ; hausse automatique après une seconde séance réussie à la même charge.
4. Performances en baisse → jamais de hausse.
5. Deux baisses comparables (même charge, même nombre de séries) → allègement proposé (≈ −10 %), jamais imposé.
6. Chaque variante a son historique ; aucune équivalence barre / haltères / machine.

Voir `tests/progression.test.ts` (stagnation, séries incomplètes, charges mixtes, variantes, poids du corps).

### Données

- Tout est d'abord écrit dans IndexedDB. Les valeurs par défaut (programme, réglages) ne sont créées que si elles n'existent pas : une mise à jour de l'app ne remplace jamais l'historique.
- Identifiants stables (UUID ; date pour les pesées) : pas de doublons entre appareils.
- Chaque enregistrement porte un horodatage ; la version la plus récente gagne, côté client comme côté serveur.

## Synchronisation Supabase (facultatif)

1. Créer un projet Supabase, puis appliquer `supabase/migrations/20261108000000_club74.sql` (SQL Editor ou `supabase db push`).
2. Authentication → Providers → Email : activé. Dans le modèle d'e-mail « Magic Link », inclure `{{ .Token }}` pour recevoir un **code à 6 chiffres** (plus fiable qu'un lien dans une app installée).
3. Copier `.env.example` en `.env` avec l'URL et la clé publique `anon`, ou les saisir dans Réglages → Compte.

La table `club74_records` est protégée par RLS : chaque utilisateur ne voit que ses lignes.

## « Le point » (IA, facultatif)

Les clés ne sont jamais dans le client. Elles vivent dans les secrets de la fonction Edge :

```bash
supabase secrets set ANTHROPIC_API_KEY=... OPENAI_API_KEY=... AI_PROVIDER=anthropic
```

```bash
supabase functions deploy le-point
```

Modèles par défaut : `claude-opus-5-5` (effort bas, repli serveur activé en cas de refus) et `gpt-5-mini`, modifiables via `ANTHROPIC_MODEL` / `OPENAI_MODEL`. La fonction exige un utilisateur connecté (JWT Supabase), n'est appelée que sur action explicite, et ne reçoit que les faits calculés localement (visibles dans « Données transmises »). Sans connexion ou sans clé, l'app affiche le bilan factuel local.

## Icônes

`node scripts/icons.mjs` régénère les PNG à partir de la vraie police (nécessite Playwright).
