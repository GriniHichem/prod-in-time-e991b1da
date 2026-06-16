# Audit & Refonte — Module Règles de Validation

## 1. État actuel (audit)

Le module repose sur 3 tables (`validation_rules`, `validation_requests`, `validation_permissions`) et 3 couches :
- **Admin** : `ValidationRulesAdmin.tsx` (liste en cartes + `RuleEditorDialog` avec ConditionBuilder visuel, mode expert JSON, dry-run, pré-flight).
- **Moteur** : `checkValidationRequired` + `matchConditions` + `createValidationRequest` (`src/lib/validation.ts`).
- **Points d'appel terrain** : `PdrDetail`, `TicketDetail`, `ConsumptionPage`.

### Problèmes détectés (par criticité)

**🔴 Bloquant — incohérence Moteur ↔ Builder (source de bugs silencieux)**
Le ConditionBuilder propose les opérateurs `>, ≥, <, ≤, ≠, contient`, mais `toValidationConditions` ne sait traduire que `≥/>` pour 3 champs précis (`duration_minutes`, `ecart_pct`, `age_hours`). Tous les autres opérateurs (`<`, `≤`, `≠`, `contient`, et `>` sur n'importe quel autre champ) **retombent silencieusement sur une égalité**. Résultat : une règle paraît correcte dans l'UI mais ne se déclenche jamais (ou se déclenche à tort). C'est le risque de fiabilité n°1.

**🔴 Table `validation_rules` vide** → aucun garde-fou actif aujourd'hui ; le module est dormant.

**🟠 Couverture partielle** : seuls 3 écrans appellent le moteur. Les actions du catalogue `of` (annulation, édition rétroactive), `interventions` (sortie PDR), `users`/`permissions` (changement de rôle/droit) ne sont jamais contrôlées.

**🟠 `auto_approve_if_low_risk`** existe en base et dans le formulaire mais n'est jamais évalué par le moteur.

**🟠 `validator_users`** existe en base mais l'éditeur ne permet de choisir que des rôles.

**🟡 Sélection de règle ambiguë** : `checkValidationRequired` renvoie la **première** règle active qui matche, sans tri par priorité/spécificité → comportement non déterministe si 2 règles se chevauchent.

**🟡 Admin peu lisible** : liste en 2 colonnes sans recherche, ni filtre par module/état, ni regroupement, ni compteur. Difficile à « maîtriser » dès qu'il y a 20+ règles.

**🟡 Pas de suivi des demandes bloquantes** : aucune relance/SLA sur une demande `submitted` qui reste en attente (risque de blocage terrain oublié).

## 2. Objectif

Un module **riche mais simple à paramétrer**, **fiable** (le moteur évalue exactement ce que l'UI affiche), avec simulation avant mise en production, sans introduire de régression.

## 3. Plan d'implémentation (par phases, testées)

### Phase 1 — Fiabiliser le moteur (priorité absolue, zéro régression)
- Réécrire `matchConditions` en moteur unique basé sur le format **`{combinator, rules:[{field, op, value}]}`** (même structure que le ConditionBuilder), avec support complet de `eq, neq, gt, gte, lt, lte, contains` et combinateur `all`/`any`.
- Conserver la **rétrocompatibilité** : `matchConditions` continue de lire l'ancien format (`min_duration_minutes`, `ecart_seuil_pct`, `or`, clés plates) via une normalisation interne.
- Simplifier `toValidationConditions` pour **persister le format natif du builder** (plus de raccourcis lossy) → ce que l'admin voit = ce que le moteur exécute.
- Évaluer enfin `auto_approve_if_low_risk` : si la règle matche mais que la priorité calculée est `low`, la demande post-hoc est auto-approuvée.
- Rendre le choix de règle déterministe : tri par `priority` (critical→low) puis spécificité (nb de conditions) dans `checkValidationRequired`.
- **Tests Vitest** : étendre `preflight-validation-rule.test.ts` + nouveau `match-conditions-validation.test.ts` couvrant chaque opérateur, `all/any`, et l'ancien format.

### Phase 2 — Éditeur de règles guidé (UX simple)
- `RuleEditorDialog` en **étapes claires** : Cible (module/action) → Déclencheurs (ConditionBuilder) → Mode & validateurs → Test → Récap.
- Ajouter la sélection de **validateurs nominatifs** (`validator_users`) en plus des rôles (combobox sur `profiles`).
- **Dry-run amélioré** : pré-remplir le contexte d'exemple par action (déjà dans `sampleContext`) + bouton « Tester sur les 50 dernières demandes/mouvements réels » pour estimer combien de cas auraient été capturés (lecture seule).
- Garder le mode expert JSON mais l'aligner sur le format natif.

### Phase 3 — Administration lisible et maîtrisable
- Refonte de `ValidationRulesAdmin` : barre de recherche, filtres (module, état actif, mode bloquant/post-hoc, priorité), **regroupement par module**, compteurs, badge « Doublon » conservé.
- Indicateur d'**impact** par règle (nb de demandes générées sur 30 j) via `validation_requests`.
- Activation/désactivation en masse + duplication d'une règle.

### Phase 4 — Couverture étendue (opt-in, sans rien casser)
- Brancher le gate de validation sur les actions manquantes du catalogue, une par une et derrière des règles existantes : `of` (annulation / édition rétroactive), `interventions` (sortie PDR). Les actions `users`/`permissions` restent optionnelles (à confirmer).
- Aucune action n'est bloquée tant qu'aucune règle active correspondante n'existe (comportement actuel préservé).

### Phase 5 — Robustesse opérationnelle
- Relance/alerte sur demandes `submitted` (bloquantes) en attente > seuil, via notification (réutilise `triggerNotification`, pas de nouveau module).
- Audit déjà en place sur create/update/delete/toggle — vérifier la complétude.

## 4. Détails techniques

- **Aucune migration de structure indispensable** en Phase 1–3 (les colonnes existent déjà). Une migration optionnelle ajoutera un index sur `validation_rules(module, action_type, is_active)` pour la performance de `checkValidationRequired`.
- **Migration de données** : convertir les conditions existantes au format natif est inutile (table vide) — on fournira à la place un **jeu de règles par défaut recommandées** (correction stock, conso hors-journée, annulation OF…) en `is_active=false` pour que l'admin les active en connaissance de cause.
- Fichiers principaux touchés : `src/lib/validation.ts`, `src/components/rules/ConditionBuilder.tsx`, `src/lib/ruleValidation.ts`, `src/components/validations/RuleEditorDialog.tsx`, `src/pages/parametres/ValidationRulesAdmin.tsx`, tests sous `src/test/rules/`.
- Garde-fou anti-régression : le format de conditions reste **lu** par l'ancien et le nouveau moteur ; `matchConditions` est couvert par tests avant tout déploiement.

## 5. Hors périmètre (sauf demande)
- Branchement validation sur `users`/`permissions` (sensible, à valider).
- Refonte des permissions de validation (déjà corrigée précédemment).

## Ordre de livraison
Phase 1 (moteur + tests) → Phase 2 (éditeur) → Phase 3 (admin) → Phase 4 (couverture) → Phase 5 (relances). Chaque phase est livrable et vérifiable indépendamment.
