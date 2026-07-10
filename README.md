# VPF — Centre de Performance (V1)

Web app mobile-first (PWA) de suivi des joueurs du Centre de Performance VPF : planning
hebdomadaire, discipline, séances basket & préparation physique, statistiques match,
bilans hebdomadaires, notifications push.

**Stack** : Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (auth,
Postgres, RLS) · Web Push (VAPID) · Vercel.

---

## 🔗 Liens (à garder sous la main)

| Quoi | URL |
| --- | --- |
| **Production (la vraie app)** | **<https://vpf-app.vercel.app>** |
| Local (dev) | <http://localhost:3000> — ou **3001** si un autre projet occupe déjà le 3000 (le terminal `npm run dev` affiche le bon port) |
| Repo GitHub | <https://github.com/project-lucas/vpf-app> |
| Dashboard Vercel | <https://vercel.com/leviva-s-projects/vpf-app> |
| Dashboard Supabase | <https://supabase.com/dashboard/project/epjylrcwdnqtyvcgempl> |

> ⚠️ **Pièges connus**
> - L'URL de prod est bien `vpf-app.vercel.app` — **pas** `vpf.vercel.app` (ce domaine
>   appartient à quelqu'un d'autre : 404 garanti, et ne jamais y saisir ses identifiants).
> - La prod et le local utilisent **la même base Supabase** : mêmes comptes, mêmes données.
> - Un `git push` **ne déploie pas** la prod (projet Vercel non connecté au repo). Déployer =
>   `vercel deploy --prod` puis `vercel alias set <url-du-déploiement> vpf-app.vercel.app`.

Comptes de démo : voir [Comptes de test](#3-appliquer-le-schéma-et-les-données-de-test)
(mot de passe commun `vpf-demo-2026`).

---

## Mise en place (première fois)

### 1. Créer le projet Supabase

1. Créer un projet sur [supabase.com](https://supabase.com) (région `eu-west` conseillée).
2. Dans **Settings → API**, récupérer :
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ secret, jamais côté client)
3. Dans **Settings → Database → Connection string (URI)**, récupérer la chaîne de
   connexion → `DATABASE_URL` (utilisée uniquement pour appliquer les migrations).

### 2. Configurer l'environnement

```bash
cp .env.local.example .env.local
# remplir les valeurs Supabase, puis :
npm install
npm run vapid    # génère les clés VAPID -> copier dans .env.local
npm run icons    # génère les icônes PWA placeholder
```

Choisir aussi un `CRON_SECRET` aléatoire (n'importe quelle chaîne longue).

### 3. Appliquer le schéma et les données de test

```bash
npm run migrate   # applique supabase/migrations/*.sql (idempotent)
npm run seed      # crée admin, 2 coachs, 5 joueurs, 4 séances, données de démo
```

Comptes de test (mot de passe commun : `vpf-demo-2026`) :

| Rôle   | Email                 |
| ------ | --------------------- |
| Admin  | `admin@vpf.fr`        |
| Coach  | `coach.karim@vpf.fr`  |
| Coach  | `coach.sarah@vpf.fr`  |
| Joueur | `joueur.lucas@vpf.fr` (+ nina, theo, emma, adam) |

### 4. Lancer en local

```bash
npm run dev
# http://localhost:3000  (ou 3001 si le port 3000 est occupé — lire la sortie du terminal)
```

> Les notifications push nécessitent HTTPS (elles fonctionnent en production, et sur
> `localhost` avec Chrome).
>
> ⚠️ Ne jamais lancer `npm run build` pendant que `npm run dev` tourne (corrompt `.next`) —
> valider avec `npm run typecheck` + `npm run lint`.

---

## Déploiement sur Vercel

Le projet est déjà déployé (voir [Liens](#-liens-à-garder-sous-la-main)). Pour mettre la
prod à jour :

```bash
vercel deploy --prod
vercel alias set <url-du-nouveau-deploiement> vpf-app.vercel.app
```

(Le push GitHub ne déclenche **aucun** déploiement : le projet Vercel n'est pas connecté
au repo. L'alias public est manuel, il ne suit pas la production tout seul.)

Première installation ailleurs : importer le repo dans Vercel, renseigner **toutes** les
variables de `.env.local.example` dans *Project → Settings → Environment Variables*
(sauf `DATABASE_URL`, optionnelle), avec `NEXT_PUBLIC_APP_URL` = l'URL de production
(ex. `https://vpf-app.vercel.app`).

### Tâche planifiée (rappels push + clôture des jours)

La route `GET /api/cron/notifications` doit être appelée **toutes les 10 minutes**.

✅ **Déjà en place** : le job tourne dans Supabase via `pg_cron` + `pg_net` (la base
appelle elle-même l'endpoint de prod). Scripts :

```bash
npm run setup:cron   # (ré)installe le job pg_cron + test bout en bout
npm run check:cron   # dernières exécutions + codes HTTP
```

Ce cron gère : rappel 30 min avant chaque événement, rappel bilan du dimanche 18h45,
clôture quotidienne à minuit (un jour ignoré casse la série) et résumé hebdo du lundi,
calculés en heure de Paris.

### Auth Supabase (production)

Dans **Authentication → URL Configuration**, mettre `Site URL` = URL de production.

---

## Architecture

```
src/
  app/
    (auth)/          login, invitation/[token], onboarding
    (player)/        planning, dashboard, basket, physique, parametres
    (coach)/coach/   dashboard, planning, joueurs, joueurs/[id], bibliotheque,
                     club (admin uniquement : supervision des coachs, création de
                     coach, invitations, archivage), parametres
    actions/         server actions (auth, planning, player, coach, admin, settings)
    api/cron/notifications/  route cron sécurisée
  components/        UI réutilisable (BottomNav, planning, sessions, library…)
  lib/               dates Paris, discipline, supabase clients, push, constantes FR
  middleware.ts      session + garde par rôle + blocage joueurs archivés
supabase/migrations/ 0001 schéma · 0002 RLS · 0003 triggers · … · 0021 (appliquées via npm run migrate)
scripts/             migrate, seed, seed-programmes, vapid, icons, setup-pg-cron, check-pg-cron
```

> Les admins utilisent l'interface coach (ils encadrent leurs propres joueurs) avec un
> onglet **Club** en plus : vue par coach (discipline, alertes, bilans) + fiche coach
> détaillée qui regroupe la gestion des coachs, les invitations et l'archivage.

### Sécurité (RLS)

- Un joueur ne voit **que ses propres données** ; il ne peut ni modifier son profil
  (verrouillé après le questionnaire initial), ni supprimer une réalisation ou une
  statistique match, ni voir la bibliothèque en dehors de ses séances affectées.
- Un coach ne voit que **ses joueurs actifs** (les archivés disparaissent
  automatiquement de tout : helper SQL `is_coach_of`).
- Les colonnes sensibles (`role`, `coach_id`, `status`…) sont protégées par des
  column grants : aucune escalade possible depuis un client.
- Les flux privilégiés (inscription par invitation — consommation atomique du token,
  onboarding, archivage + ban auth, cron) passent par le `service_role` côté serveur.

### Logo

Le logo n'apparaît que sur la page de connexion (placeholder « VPF »). Pour le vrai
logo : remplacer le bloc dans `src/app/(auth)/login/page.tsx` et écraser
`public/icons/icon-192.png` / `icon-512.png`.

## Commandes

| Commande            | Rôle                                    |
| ------------------- | --------------------------------------- |
| `npm run dev`       | serveur de développement                |
| `npm run build`     | build de production                     |
| `npm run typecheck` | vérification TypeScript                 |
| `npm run migrate`   | applique les migrations SQL             |
| `npm run seed`      | données de test                         |
| `npm run vapid`     | génère les clés VAPID                   |
| `npm run icons`     | régénère les icônes PWA placeholder     |
| `npm run seed:programmes` | séances programmes par poste (contenu de prod) |
| `npm run setup:cron` | installe le cron pg_cron dans Supabase |
| `npm run check:cron` | vérifie les exécutions du cron          |
