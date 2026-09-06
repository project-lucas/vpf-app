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

**Les admins utilisent l'interface coach** (ils encadrent leurs propres joueurs) avec en plus l'onglet Staff (`/coach/club`) : supervision par coach + gestion des coachs, invitations et archivage. L'admin invite aussi **ses propres** joueurs directement depuis `/coach/joueurs` (même composant `CoachInvitations`, `coachId` = lui-même). Conséquences structurantes :

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

### Deux offres joueur (perf / formation)

Chaque fiche joueur porte une `offer` (`players.offer`, migration 0026) choisie par le **coach** — à l'invitation puis modifiable dans la fiche. Stripe est hors application : rien n'est dérivé d'un paiement.

- `formation` (offre 2) est le **défaut** : tout est développé en mode formation, c'est `perf` qui retire. Deux différences à ce jour : l'**onglet Hygiène de vie** et les **fils privés avec les admins** (cf. Messagerie). Tout le reste (planning, dashboard, objectifs mesurables, séances, bilans) est identique.
- La liste de ce que chaque offre débloque vit dans `src/lib/offers.ts` — ajouter une restriction = ajouter un helper là, jamais un `=== "perf"` disséminé dans les pages.
- Changer d'offre ne touche **aucune donnée** : l'onglet disparaît/réapparaît, l'historique (hygiène, objectifs, progression) reste intact dans les deux sens. Côté coach, tout reste visible quelle que soit l'offre.
- Aucun grant client sur la colonne : l'écriture passe par le service_role après lecture RLS (`setPlayerOffer`), comme `availability`. La saisie d'hygiène est aussi verrouillée en RLS (`is_formation()`).

### Messagerie : des canaux, pas un fil unique

Un joueur porte **un fil par canal** (`conversation_messages.channel_admin_id`, migration 0034) :

- `channel_admin_id = null` — le fil coach & parents : joueur, coach référent, parents, admins en supervision. C'est le seul fil d'un joueur **perf**.
- `channel_admin_id = <staff>` — un fil privé par **porteur** : chaque admin, **et le coach référent du joueur** (0037). **Offre formation uniquement.** Le lisent : le joueur, le porteur, et tous les admins (supervision assumée — un coach référent sait que Lucas et Maxime voient son fil). Les parents ne voient jamais un fil privé. Le nom de colonne date de 0034 ; sa sémantique est « staff porteur », pas « admin ».

Points structurants :

- La RLS (0034, élargie en 0037 via `is_private_channel_owner`) est seule juge de l'audience d'un canal ; `src/lib/conversations.ts` est la seule source du « qui a quels fils » — `listPrivateChannelOwners(playerId)` = coach référent puis admins. `getConversationChannels` prend `includePrivate: true | "own" | false` (admin / coach référent / parent). Les prénoms passent par le service_role : la RLS de `profiles` ne les donne pas à un joueur.
- **Libellés** : le fil `null` s'appelle **« Global »** partout (joueur, fiche, boîte) ; un fil privé porte le **prénom** de son porteur. Ne pas réintroduire « Coach & parents » / « Fil X ».
- Les **notifications suivent le canal** : un message d'un fil privé ne prévient que le joueur et l'admin porteur — jamais le coach, les parents ni l'autre admin.
- `conversation_reads` porte un marqueur **par canal** et n'a plus de clé primaire (index uniques partiels : le canal coach est un NULL). Ne jamais y remettre un upsert PostgREST — passer par `touchRead` (update puis insert, doublon 23505 toléré).
- Côté joueur, les canaux s'affichent en onglets (`ConversationPanel`) avec pastille rouge sur le non-lu, reprise sur l'onglet Profil de la barre du bas. Côté admin, `/coach/messages` liste tous les fils privés.

### Messages riches : pièces jointes, vocaux, édition (0036)

Un message porte au plus **une** pièce jointe (`attachment_path/kind/name/size/duration`) et peut n'avoir que ça — le corps est facultatif dès qu'un fichier l'accompagne, jamais vide sans lui.

- **Bucket `messages` PRIVÉ**, contrairement à `avatars`/`videos`/`fiches`. On ne stocke jamais d'URL en base, seulement le chemin : `getConversationMessages` fabrique des URL signées (service_role) après que la RLS a prouvé l'accès au canal. Ne jamais rendre ce bucket public ni servir `attachment_path` tel quel.
- Le chemin est `<player_id>/<uuid>.<ext>` : c'est **le premier dossier qui porte l'accès** (`can_access_message_file`). Un upload hors du dossier du joueur est refusé côté storage *et* par `cleanAttachment`.
- Le fichier part **avant** le message (upload direct navigateur, une server action plafonnerait à quelques Mo). Corollaire : un dépôt abandonné doit être nettoyé — `discardMessageAttachment`. Supprimer un message supprime son fichier.
- Les photos sont **réduites côté client** (1600 px, JPEG 0.82) avant l'upload ; l'original repart tel quel si le navigateur ne sait pas décoder (HEIC).
- **Édition** : seul l'auteur, seul le corps (`grant update (body)` — la pièce jointe et le canal ne se réécrivent pas). `edited_at` est posé par un trigger, jamais par le client, et l'interface affiche « modifié ». Un admin modère en supprimant, il n'édite pas.
- **Temps réel** : `conversation_messages` est publiée (`supabase_realtime`) ; l'événement sert de simple signal, la lecture repasse par la server action sous RLS (l'événement ne porte ni le nom de l'auteur ni l'URL signée). Le sondage 30 s reste en filet.
- **Entrée n'envoie qu'à la souris** (`pointer: fine`). Au doigt elle saute une ligne — un téléphone n'a pas de touche Maj, et le retour à la ligne était impossible.
- **Un fil s'ouvre toujours sur le dernier message.** Poser `scrollTop` au montage ne suffit pas : dans la fiche joueur, `Tabs` monte tous ses contenus et masque les inactifs (`display: none`), donc le fil naît à hauteur nulle. C'est un `ResizeObserver` sur le contenu qui recale — ne pas le remplacer par un simple effet de montage.

### Pastilles de non-lu : personne ne rate un message

Chaque interface porte la messagerie sur UN onglet, et cet onglet porte la pastille :

| Qui | Onglet | Portée |
|---|---|---|
| Joueur | Profil (`/parametres`) | ses canaux, hors fils privés s'il est repassé en perf |
| Coach / admin | Joueurs (`/coach/joueurs`) | les fils de SES joueurs (filtre `coach_id` explicite) |
| Parent | Messages (`/parent/messages`) | le fil coach & parents de son enfant |

- Le layout (serveur) pose la valeur initiale ; `BottomNav` la rafraîchit ensuite via `getNavUnreadFlag` (30 s + retour sur l'onglet du navigateur). Sans ce guet, un joueur planté sur son planning ne verrait jamais rien arriver. La valeur vivante **remplace** celle du serveur dès la première mesure, et repart à zéro à chaque navigation.
- Côté staff, la pastille ne suffit pas à savoir QUI attend : la liste des joueurs marque chaque carte concernée et l'Accueil ouvre son tableau d'affichage sur le compteur **Messages** (en or dès qu'il y en a) et remonte « Message en attente » **en tête de « À savoir »** (ex-« À traiter »).

### « À savoir » : le récap d'alertes de l'accueil staff

Le moteur vit dans `src/lib/alerts.ts` (`buildPlayerAlerts`, `rankAlertRows`, `getSessionCoverage`) — la page affiche, elle ne décide pas. **Une ligne par joueur qui cumule ses alertes** en puces teintées (exception assumée à « une pilule par ligne » : c'est le nombre de puces qui dit l'urgence) ; un joueur pour qui tout va bien n'apparaît pas, la carte dit alors une phrase calme. Deux niveaux : `danger` (message en attente, douleur ≥ 5 sur un check-in de 7 j, séances sans jour donc invisibles côté joueur) et `warning` (planning vide, aucune séance technique / physique affectée, discipline < 60 %, silence ≥ 30 j ou aucun échange pour un compte de plus de 30 j, bilan de la semaine passée manquant pour un compte de plus de 7 j). Un joueur blessé / en vacances ne remonte que messages et douleur. Tri : critiques d'abord, puis le plus de puces, puis A → Z ; le lien ouvre la fiche sur l'onglet de la première alerte.

**Périmètre** : c'est le seul bloc de l'accueil qui couvre **tout le club pour un admin** (perf et formation), le prénom du coach référent accompagnant les joueurs d'un collègue ; le tableau d'affichage et les panneaux de la `DisclosureBar` restent filtrés sur `coach_id`. Ajouter une alerte = ajouter un cas dans `buildPlayerAlerts`, jamais une liste à part dans la page.
- Tout part de `getStaffUnreadPlayerIds` (`src/lib/conversations.ts`) — un seul balayage borné pour la barre, la liste et le dashboard. Ne pas en écrire un second ailleurs.

### La boîte de réception vit dans Joueurs (vue Messages)

Il n'y a **qu'un seul endroit** pour les fils : la liste des joueurs (`/coach/joueurs`, `PlayersList`), dont la **vue Messages s'ouvre en premier**. L'onglet Messages de la barre du bas a été retiré (doublon avec la fiche) ; **c'est Joueurs qui porte la pastille**. `/coach/messages` ne sert plus qu'au **relais entre admins** (fils privés d'un collègue, entrée « Relais messages » du `StaffMenu`) et à l'ouverture d'un fil par URL ; sans `joueur`, un coach y est redirigé vers Joueurs.

- **Une ligne = UN joueur, jamais un canal.** Pas d'étiquette de canal dans la liste : le fil à ouvrir (celui qui attend, sinon le plus récent) est choisi côté serveur et suit le lien. **Cliquer une ligne ouvre directement la conversation** dans la fiche (`?onglet=messages&canal=…`) — plus de composeur replié dans la liste : on écrit à un seul endroit.
- **La vue Messages ne montre pas l'aperçu du dernier message** (un fil se lit dans le fil) et la charge envoyée au navigateur ne le porte donc plus. En revanche elle dit **tout ce qu'un coach veut savoir avant d'ouvrir** : ligne aérée (`Row airy`) avec un **avatar à initiales** (`PlayerAvatar`) à gauche, le nom, puis une ligne de **signaux** (`PlayerSignals`) — dispo si elle n'est pas « disponible », discipline, semaine fait/prévu, énergie et douleur du dernier check-in, offre. Un signal est **muet s'il n'a rien à dire** (pas de check-in → rien) et **gris tant qu'il n'alerte pas** (rouge : blessé, discipline faible, douleur ≥ 5 ; orange : vacances, énergie ≤ 4). À droite : l'ancienneté du dernier échange, **une pastille rouge à icône message** quand il y a du non-lu, le menu. Les signaux sont du texte, pas des badges : la règle « une pilule par ligne » tient, et l'œil va droit au rouge. Dans les autres vues, l'avatar porte la pastille de non-lu sur son coin (à la place de la pastille de gauche de `Row`).
- **C'est le seul écran staff SANS filtre `coach_id`** : un admin y voit **tout le club** (perf et formation), **ses** joueurs regroupés en tête (`is_mine`, sur-titre « Mes joueurs » / « Autres joueurs du club »), le tri de la vue s'appliquant à l'intérieur de chaque groupe. Un coach ne voit que les siens — la RLS ne lui rend rien d'autre. Ailleurs (Accueil, moyennes, alertes), le filtre `coach_id` reste la règle.
- **La pastille rouge ne va qu'à mes joueurs** : elle dit « ça t'attend », et le fil d'un joueur d'un collègue est à lui. Le reste du club se lit en gris. C'est ce qui garde l'accord entre la pastille de l'onglet, le compteur de la page et `hasStaffUnread`.

- « Mes fils » (`getStaffInbox`) réunit une ligne par **(joueur, canal)** : le fil global de chaque joueur du périmètre demandé (`scope` — par défaut ses joueurs, la liste lui passe tous ceux qu'elle affiche), plus ses propres fils privés s'il est admin. Les fils privés d'un collègue restent sur leur onglet `?fil=<admin>` (`getAdminInbox`) — c'est du relais, pas du quotidien.
- **Tri par récence pure**, non-lus signalés en rouge (pastille pleine + nom en gras + fond `danger-soft`) : l'ordre d'une messagerie, pas d'une file de tâches. Les fils sans aucun message sont repliés dans un `<details>` en bas — sinon quinze lignes « Aucun message » enterrent les vraies conversations.
- Le canal ouvert passe par `?canal=staff|<adminId>` ; `?fil=` ne sert qu'à l'onglet de relais.
- `markConversationRead` fait un `revalidatePath("/coach/messages")` : sans ça, revenir sur la liste dans les 30 s (`staleTimes`) réafficherait en rouge un fil qu'on vient de lire.

### Interface staff : le système visuel (refonte du 3/9/2026)

Le côté coach/admin a sa passe de design, distincte du thème éditorial joueur (navy conservé, gestes empruntés). Les règles, dans `src/components/ui/` :

- **Deux niveaux de surface** : `Card` (blanc, ombre) = **ce qui demande une action** (répondre, saisir, valider) ; `Section` (plate, sur-titre + filet) = ce qui se consulte. Ne pas remettre une liste consultative dans une Card.
- **Une pilule par ligne au plus** (`Badge`). `neutral` est en creux (liseré, sans fond) ; `danger`/`warning` = à traiter / à surveiller ; `success` = confirmation ponctuelle, jamais un état permanent (« aucune alerte » ne se dit pas en vert, il ne se dit pas). `navy` = étiquette forte (offre, rôle).
- **Trois niveaux de titre** : `PageHeader` → `CardTitle` → `SectionTitle` (sur-titre capitales espacées).
- **`Row`** = la ligne de liste commune (joueurs, boîte de réception, coachs, santé, activité) : pastille rouge à gauche réservée à « attend une action », valeur à droite. Avec `href`, seul le corps est un lien — la zone `right` peut porter un bouton ou un menu sans imbriquer deux `<a>`.
- **`StatStrip`** remplace les grilles de `StatCard` côté staff (bandeau de chiffres sur une ligne).
- **`DisclosureBar`** = le geste unique du « secondaire » : une rangée d'icônes, un panneau déplié à la fois, contenus montés d'entrée (`hidden`). Dashboard (Santé, Matchs, Discipline, Activité), Joueurs (Inviter), Staff (Annonces, Nouveau coach).
- **Navigation** : 4 onglets en bas (Accueil · Joueurs · Planning · Séances) ; Staff, Relais messages (admin) et Réglages dans `StaffMenu` (initiales, en haut à droite, posé par le layout). La pastille de non-lu est sur **Joueurs**.
- **Deux signatures basket, pas de décor** : le `StatStrip` est un **tableau d'affichage** (fond navy, liseré or, chiffres Barlow — le seul élément sombre d'une page, en haut) ; `PageHeader` porte les **lignes du demi-terrain** en filigrane (`CourtLines`, 6 % d'opacité). Ne pas ajouter d'illustration, de ballon ni d'icône « basket » ailleurs : la signature tient parce qu'elle est discrète et unique.
- Une `Row` avec `href` mais sans `right` affiche un chevron : une ligne cliquable se signale toujours.
- **Une seule liste de joueurs** (`/coach/joueurs`, `PlayersList`) à quatre vues — Messages / Discipline / Santé / Semaine — alimentées par `getHealthByPlayer` et `getWeekTracking` (`src/lib/coach-data.ts`). Les listes « Santé » et « Discipline » du dashboard vivent dans la DisclosureBar ; le « Suivi par joueur » du planning a disparu au profit de la vue Semaine. `RowMenu` (⋯) sur chaque ligne : Écrire · Fiche · Disponibilité. **Tri par défaut « Priorité »** : message en attente, puis douleur ≥ 5, puis discipline faible, puis A → Z.
- **Fiche joueur : 5 onglets** — Messages (premier, pastille) · Semaine (sous-onglets Planning / Bilans / Habitudes — le sous-onglet **Planning sert à planifier** : bandeau « Semaine en cours » (jauge + 7 jours), puis `DisclosureBar` Focus / Pointages / Historique, puis la semaine type ; l'éditeur (`PlanningEditor`, partagé avec l'écran joueur) garde son formulaire **replié** : bouton général en tête ou « + » sur chaque jour, qui l'ouvre sous ce jour avec le jour présélectionné ; le champ Jour est **multi-sélection** — `addPlannedEvent` accepte `weekday: number | number[]`, crée une ligne par jour libre et signale les jours déjà pris à cette heure au lieu de tout refuser) · Programme (sous-onglets Technique / Physique / Routine / Hygiène via `Tabs variant="sub"`) · Stats · Fiche (profil, notifications, parents, objectifs, notes privées). `?onglet=<clé>` ouvre directement un onglet (`Tabs initialKey`). Jusqu'à 5 onglets, `Tabs` est un bloc segmenté pleine largeur (tous visibles) ; au-delà, une bande qui défile. La **tête de fiche** est alignée sur le fil ouvert : nom + WhatsApp + menu ⋯ (dispo dedans, plus de sélecteur à trois boutons), puis une ligne de pilules — dispo, offre, semaine, dernier check-in.
- **Relais admin** (`InboxList`, `/coach/messages`) : réponse depuis la liste (la ligne se déplie sur un `MessageComposer` complet), filtre Non lus, recherche. Le fil ouvert porte une ligne de contexte (dispo, discipline, dernier check-in) et un lien vers la fiche.

### Séances sur plusieurs jours (sans migration)

Une affectation = un jour = **un pointage** (`session_completions` référence l'affectation, pas la séance — modèle 0035). « Lundi et jeudi » = deux lignes, « chaque jour » (case à cocher du `WeekdayPicker`) = sept. `assignSession(sessionId, playerIds, weekdays[])` dédoublonne **par jour** ; la case « Chaque jour » n'est pas réservée aux routines, c'est juste un raccourci. Côté joueur rien ne change : `SessionsDayTabs` lit déjà par jour.

### Conventions transverses

- **Dates/heures : tout est calculé en heure de Paris** via `src/lib/dates.ts` (le serveur Vercel est en UTC). Ne jamais utiliser `new Date()` brut pour de la logique métier de jour/heure.
- **Gamification dérivée, jamais stockée** : XP, niveaux, badges (`src/lib/gamification.ts`) sont recalculés depuis les données existantes (événements pointés, habitudes, séances, matchs). Ne pas ajouter de colonne de compteur XP.
- **Design « éditorial » joueur** : les écrans joueur redessinés utilisent le thème « Retro Varsity » scopé sous la classe `.ed`, composants dans `src/components/editorial/`. Ne pas mélanger avec le style navy d'origine hors de ce scope.
- Après une action serveur, ne pas rajouter de `router.refresh()` (passe perf : revalidation gérée par les actions, `staleTimes` 30 s).
