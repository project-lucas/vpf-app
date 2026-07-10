# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

VPF — Centre de Performance : PWA mobile-first de suivi de joueurs de basket (planning, séances, discipline, gamification, bilans, push). Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (auth, Postgres, RLS) · Web Push (VAPID) · Vercel. Toute l'UI, les commentaires et les données sont en **français**.

## Commandes

```bash
npm run dev          # serveur de dev (port 3000, ou 3001 si occupé — lire la sortie)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .
npm run migrate      # applique supabase/migrations/*.sql (idempotent, via DATABASE_URL)
npm run seed         # données de démo (admin, coachs, joueurs — mdp vpf-demo-2026)
npm run seed:programmes  # séances des programmes par poste (contenu de prod)
npm run setup:cron   # (ré)installe le job pg_cron dans Supabase + test bout en bout
npm run check:cron   # dernières exécutions du cron + codes HTTP
```

Il n'y a **pas de suite de tests** — la validation standard est `npm run typecheck` + `npm run lint`.

### ⚠️ Pièges critiques

- **Ne jamais lancer `npm run build` pendant que `npm run dev` tourne** : ça corrompt `.next`. Valider avec typecheck + lint uniquement.
- **La prod et le local partagent la même base Supabase** : mêmes comptes, mêmes données. Toute migration ou seed appliqué en local touche la prod.
- **`git push` ne déploie rien** (projet Vercel non connecté au repo). Déployer = `vercel deploy --prod` puis `vercel alias set <url-du-déploiement> vpf-app.vercel.app` (l'alias est manuel, il ne suit pas tout seul).
- L'URL de prod est `vpf-app.vercel.app` — **pas** `vpf.vercel.app` (domaine tiers).

## Architecture

### Routing par rôle (App Router)

Deux groupes de routes avec layout et navigation propres :

- `src/app/(player)/` — planning, dashboard, basket, physique, paramètres
- `src/app/(coach)/coach/` — dashboard, planning, joueurs, bibliothèque, club, paramètres
- `src/app/(auth)/` — login, invitation/[token], onboarding

**Les admins utilisent l'interface coach** (ils encadrent leurs propres joueurs) avec en plus l'onglet `/coach/club` : supervision par coach + gestion des coachs, invitations et archivage. Conséquences structurantes :

- Les pages coach passent un `coachId` explicite à `getPlayersWithDiscipline` (la RLS renvoie TOUS les joueurs à un admin — sans ce filtre, il verrait tout le club dans « ses » joueurs).
- Les pages `/coach/club` vérifient `role === "admin"` côté serveur et redirigent sinon (le middleware ne distingue pas coach/admin sous `/coach`).
- `getNavRole()` (`src/lib/auth.ts`) donne le rôle sans requête DB dans le cas courant (cookie `vpf-nav`) — pour adapter l'UI, jamais comme preuve d'autorisation.

`src/middleware.ts` est le garde central : session Supabase + redirection stricte par rôle (joueur → préfixes joueur, coach/admin → `/coach`), blocage des joueurs archivés, redirection onboarding. Le rôle est mis en cache 15 min dans le cookie httpOnly `vpf-nav` (lié à l'user id) pour éviter une requête `profiles` à chaque navigation — seuls les états stables sont cachés, les états transitoires (onboarding, archivage) re-vérifient la base.

### Mutations : server actions uniquement

Toutes les écritures passent par `src/app/actions/` (auth, planning, player, coach, admin, habits, settings). Pas de route API pour les mutations ; la seule route API est `GET /api/cron/notifications` (sécurisée par `CRON_SECRET`), appelée toutes les 10 min par un job `pg_cron` + `pg_net` **dans Supabase** (la base appelle l'endpoint de prod elle-même).

### Deux niveaux d'accès Supabase

- `src/lib/supabase/server.ts` / `client.ts` — client standard soumis à la RLS. Utiliser `getAuthProfile()` (`src/lib/auth.ts`) pour récupérer user + profil côté serveur.
- `src/lib/supabase/admin.ts` — `createAdminClient()` avec `service_role`, contourne la RLS. **Uniquement** côté serveur, réservé aux flux privilégiés : consommation atomique de token d'invitation, onboarding, archivage + ban auth, cron.

La sécurité repose sur la RLS (migration `0002`) : un joueur ne voit que ses données, un coach que ses joueurs actifs (helper SQL `is_coach_of`), colonnes sensibles (`role`, `coach_id`, `status`…) protégées par column grants. Ne pas « réparer » un problème d'accès en passant au client admin — vérifier d'abord la policy.

### Migrations

`supabase/migrations/0001…00NN_*.sql`, numérotées, appliquées dans l'ordre par `npm run migrate` (idempotent). Toute évolution de schéma = nouveau fichier numéroté, jamais de modification d'une migration existante.

### Conventions transverses

- **Dates/heures : tout est calculé en heure de Paris** via `src/lib/dates.ts` (le serveur Vercel est en UTC). Ne jamais utiliser `new Date()` brut pour de la logique métier de jour/heure.
- **Gamification dérivée, jamais stockée** : XP, niveaux, badges (`src/lib/gamification.ts`) sont recalculés depuis les données existantes (événements pointés, habitudes, séances, matchs). Ne pas ajouter de colonne de compteur XP.
- **Design « éditorial » joueur** : les écrans joueur redessinés utilisent le thème « Retro Varsity » scopé sous la classe `.ed`, composants dans `src/components/editorial/`. Ne pas mélanger avec le style navy d'origine hors de ce scope.
- Après une action serveur, ne pas rajouter de `router.refresh()` (passe perf : revalidation gérée par les actions, `staleTimes` 30 s).
