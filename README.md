# VPF — Centre de Performance (V1)

Web app mobile-first (PWA) de suivi des joueurs du Centre de Performance VPF : planning
hebdomadaire, discipline, séances basket & préparation physique, statistiques match,
bilans hebdomadaires, notifications push.

**Stack** : Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (auth,
Postgres, RLS) · Web Push (VAPID) · Vercel.

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
# http://localhost:3000
```

> Les notifications push nécessitent HTTPS (elles fonctionnent en production, et sur
> `localhost` avec Chrome).

---

## Déploiement sur Vercel

1. Pousser le repo sur GitHub et importer le projet dans Vercel.
2. Renseigner **toutes** les variables de `.env.local.example` dans
   *Project → Settings → Environment Variables* (sauf `DATABASE_URL`, optionnelle),
   avec `NEXT_PUBLIC_APP_URL` = l'URL de production (ex. `https://vpf.vercel.app`).
3. Déployer.

### Tâche planifiée (rappels push + clôture de semaine)

La route `GET /api/cron/notifications` doit être appelée **toutes les 10 minutes** :

- **Vercel Pro** : le fichier `vercel.json` configure le cron automatiquement.
  Ajouter la variable `CRON_SECRET` (Vercel l'envoie en header `Authorization`).
- **Gratuit** : créer un job sur [cron-job.org](https://cron-job.org) qui appelle
  `https://VOTRE-URL/api/cron/notifications?secret=VOTRE_CRON_SECRET` toutes les 10 min.

Ce cron gère : rappel 30 min avant chaque événement, rappel bilan du dimanche 18h45,
et la clôture hebdomadaire (matérialisation des événements non pointés + résumé de
discipline), calculés en heure de Paris.

### Auth Supabase (production)

Dans **Authentication → URL Configuration**, mettre `Site URL` = URL de production.

---

## Architecture

```
src/
  app/
    (auth)/          login, invitation/[token], onboarding
    (player)/        planning, dashboard, basket, physique, parametres
    (coach)/coach/   dashboard, joueurs, joueurs/[id], bibliotheque, parametres
    (admin)/admin/   dashboard, coachs, bibliotheque, invitations, exclusion, parametres
    actions/         server actions (auth, planning, player, coach, admin, settings)
    api/cron/notifications/  route cron sécurisée
  components/        UI réutilisable (BottomNav, planning, sessions, library…)
  lib/               dates Paris, discipline, supabase clients, push, constantes FR
  middleware.ts      session + garde par rôle + blocage joueurs archivés
supabase/migrations/ 0001 schéma · 0002 RLS · 0003 triggers
scripts/             migrate, seed, vapid, icons
```

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
