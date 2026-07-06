# Cadre de réception d'un changement de design (VPF)

But : livrer un design **complet et cohérent, sans zone oubliée**. À remplir AVANT de lancer l'implémentation. Une case non cochée = une source d'incohérence.

---

## 0. Décisions de cadrage (à trancher en premier)

- [ ] **Remplacement** du design actuel, ou **évolution** ? (si évolution, lister ce qui est gardé)
- [ ] Périmètre : quels écrans ? (Séances / Planning / Dashboard / Profil / auth / **coach** / **admin** ?)
- [ ] On garde le scope `.ed` (joueur isolé) ou on unifie joueur + coach + admin ?
- [ ] Base de départ : on **finit d'abord** les sections dashboard restées en navy, ou on les fold dans ce nouveau design ?
- [ ] Contrainte back-end : inchangé ? (par défaut : oui, mêmes champs/actions)

## 1. Design system (tokens) — 1 seul endroit de vérité

- [ ] Couleurs (hex exacts) + rôle de chaque couleur (fond, texte, accent, états)
- [ ] Règle d'accent (où l'accent a le droit d'apparaître / interdit)
- [ ] Typo : familles + graisses + casse + line-height + usage de chacune
- [ ] Échelle d'espacement, rayons de coins, épaisseurs de filets/bordures, ombres
- [ ] Mode sombre ? (oui/non)

## 2. Inventaire EXHAUSTIF des surfaces (le point qui a manqué la dernière fois)

Pour **chaque écran**, lister TOUT, pas seulement le haut :

- [ ] Hero / en-tête
- [ ] Contenu principal (toutes les sections, y compris repliées/onglets secondaires)
- [ ] **Dashboard spécifiquement** : courbe de progression (recharts), radar, liste de matchs, salle des trophées, carte gamification/XP, habitudes/activités, bilan hebdo, totaux carrière, saisie de match
- [ ] **Modales** : check-in, détail d'événement, formulaire de match, détail d'habitude, ajout de séance
- [ ] **États** : vide, chargement (skeleton), erreur, succès
- [ ] Navigation basse + boutons flottants (WhatsApp coach)
- [ ] Toasts / feedback / bursts +XP / confettis / célébrations

## 3. Par écran — la maquette doit montrer

- [ ] État **rempli** ET état **vide**
- [ ] Chaque **variante d'un composant** (bouton actif/inactif/désactivé, onglet sélectionné/non, champ vide/rempli/erreur)
- [ ] Comportement **responsive** (≈390px de référence)
- [ ] Les micro-interactions attendues (hover, tap, transitions)

## 4. Composants réutilisables — nommer + définir chaque variante

Reprendre l'inventaire existant (`src/components/editorial/`) et pour chaque composant :
nom · variantes · états · où il est utilisé.

## 5. Livraison attendue (definition of done)

- [ ] Tokens centralisés, aucune couleur/police en dur
- [ ] Zéro régression : lister les **actions** à re-tester (valider séance/événement, cocher habitude, enregistrer fiche, changer mdp, upload avatar, toggle notifs, saisir match, bilan hebdo)
- [ ] Cibles ≥44px, aria-label sur boutons icônes
- [ ] `npx tsc --noEmit` + `npx eslint .` clean (pas de `npm run build` pendant `next dev`)
- [ ] **Vérif visuelle connecté** sur les 4 écrans (l'agent ne peut pas se logger : à faire côté humain, ou fournir un accès)

---

## Squelette de prompt à me donner

```
Refonte design « <NOM> ». Périmètre : <écrans>. <Remplacement|Évolution> du design actuel.
Back-end intact (mêmes champs/actions).

DESIGN SYSTEM
Couleurs : <hex + rôles>. Accent : <règle>.
Typo : <familles/graisses/casse/usage>.
Composition : <espacement, coins, filets, ombres>. Mode sombre : <oui/non>.

COMPOSANTS (nom · variantes · états) : <liste>

ÉCRANS (pour chacun : hero, contenu COMPLET, modales, états vide/chargement/erreur) :
- Dashboard : <… + explicitement les sections d'analyse profondes>
- Planning : <…>
- Séances : <…>
- Profil : <…>

LIVRAISON : tokens centralisés, zéro régression (actions listées), a11y ≥44px,
tsc + eslint clean. Maquettes jointes : <liste des captures, état rempli ET vide>.
```

## Astuce anti-erreurs
Joins **une maquette par état** (rempli + vide) et **cite explicitement** les sections
« invisibles » (analyses dashboard, modales). Ce qui n'est pas dans la maquette est deviné —
c'est exactement ce qui crée les demi-refontes.
