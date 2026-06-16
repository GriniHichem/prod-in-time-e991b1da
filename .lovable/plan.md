# Plan — Suite de tests complète du moteur de validation

Objectif : garantir, par des tests automatisés exhaustifs, que les règles de validation se comportent exactement comme configurées dans l'UI — sans bug ni régression silencieuse. Aucune logique métier n'est modifiée ; on ajoute uniquement des tests (et, si un test révèle un vrai défaut, on le corrigera ponctuellement).

## Périmètre

Le moteur (`src/lib/validation.ts`) contient :
- Fonctions pures : `matchConditions`, `countConditions`, `checkValidationRequired` (sélection déterministe), `createValidationRequest` (auto-approve), `approve/reject/cancelValidationRequest`, `markTargetValidationStatus`.
- Constantes d'affichage : `STATUS_LABEL`, `PRIORITY_LABEL`, etc.

Test existant : `src/test/rules/match-conditions-validation.test.ts` (couvre déjà partiellement `matchConditions` + `countConditions`). On le complète et on ajoute de nouveaux fichiers.

## Fichiers de test à créer / compléter

```text
src/test/rules/
  match-conditions-validation.test.ts   (compléter)
  check-validation-required.test.ts      (nouveau)
  create-validation-request.test.ts      (nouveau)
  validation-decisions.test.ts           (nouveau)
  validation-display.test.ts             (nouveau)
```

### 1. `match-conditions-validation.test.ts` — compléter
Cas manquants à ajouter :
- Champs absents du contexte (`undefined`) pour chaque opérateur (gt/gte/lt/lte/contains/eq/neq) → comportement attendu défini et figé.
- Valeurs booléennes (`is_active`, `auto`) avec `eq`/`neq`.
- Format natif avec `combinator` invalide / `rules` absent → ne plante pas.
- Format legacy : tableau d'égalité (`{ statut: ["a","b"] }`), `min_age_hours`, `or` imbriqué, écart négatif vs `ecart_seuil_pct` (valeur absolue).
- `conditions = null` → `true` (toujours déclenché).

### 2. `check-validation-required.test.ts` — sélection déterministe (nouveau)
Mock de `@/integrations/supabase/client` via le mock centralisé (`src/test/__mocks__/supabase.ts`), en surchargeant `validation_rules` pour chaque scénario :
- Aucune règle active → `{ rule: null, enforcement: "none" }`.
- Une seule règle correspondante → renvoyée avec son enforcement.
- Plusieurs règles : priorité supérieure gagne (`critical` > `high` > `medium` > `low`).
- Priorités égales : règle avec `entity_type` non nul (plus spécifique) gagne sur règle générique.
- Priorité + spécificité égales : règle avec le plus de conditions gagne.
- Règle dont les `conditions` ne matchent pas le contexte → exclue.
- Erreur backend (mock qui rejette) → fallback sûr `{ rule: null, enforcement: "none" }` (jamais d'exception remontée).

### 3. `create-validation-request.test.ts` — création + auto-approve (nouveau)
Mock de `supabase.auth.getUser`, `from("validation_requests").insert`, et des dépendances (`logAudit`, `triggerNotification`, `@/lib/audit`) :
- Sans utilisateur connecté → `null`, aucun insert.
- Règle `blocking` → statut `submitted`, `is_blocking = true`, `applied_at = null`.
- Règle `post_hoc` sans auto-approve → statut `pending_post_hoc`, `applied_at` renseigné.
- Règle `post_hoc` + `auto_approve_if_low_risk = true` + priorité `low` → statut `approved`, `validation_comment` = "Auto-approuvée (risque faible)", `validated_at` renseigné.
- `auto_approve_if_low_risk = true` mais priorité `medium`/`high` → PAS auto-approuvée.
- Affectation `assigned_validator_role`/`assigned_validator_user_id` depuis la règle.
- `changed_fields` calculé depuis old/proposed values.
- Notification déclenchée uniquement si `validator_roles` non vide.

### 4. `validation-decisions.test.ts` — approve / reject / cancel (nouveau)
- `approveValidationRequest` blocking → statut `applied` + `applied_at`.
- `approveValidationRequest` post_hoc → statut `approved`, et `markTargetValidationStatus` appelée sur la bonne table (`tickets`, `interventions`, `pdr_stock_movements`, `consumptions`).
- `rejectValidationRequest` → statut `rejected` + `rejection_reason`, marquage cible `rejected`.
- `cancelValidationRequest` → statut `cancelled`, filtre `submitted_by_user_id` (un utilisateur ne peut annuler que ses demandes).
- Sans utilisateur → `false` partout.
- Erreur d'update backend → `false`.

### 5. `validation-display.test.ts` — cohérence des libellés (nouveau)
- Chaque `ValidationStatus` a un `STATUS_LABEL` et un `STATUS_BADGE_CLASS`.
- Chaque `ValidationPriority` a `PRIORITY_LABEL` et `PRIORITY_BADGE_CLASS`.
- Chaque `ValidationEnforcement` a `ENFORCEMENT_LABEL`.
Ces tests verrouillent l'exhaustivité si un nouveau statut/priorité est ajouté plus tard.

## Détails techniques

- Réutilisation du mock centralisé `src/test/__mocks__/supabase.ts` (déjà utilisé par les autres suites), avec `vi.mock("@/integrations/supabase/client")` et surcharge ciblée des données par test via un `createQueryBuilder` paramétrable. Si le builder actuel ne permet pas de simuler une erreur ou des données par-table dynamiques, on ajoute un petit helper local au fichier de test (sans toucher au mock partagé) pour ne pas casser les autres suites.
- `logAudit`, `triggerNotification`, `sanitizeValues`, `computeChangedFields` seront mockés (`vi.mock`) pour isoler la logique et asserter les appels.
- Aucune migration, aucun changement de schéma.

## Validation
- Lancement de la suite Vitest complète ; objectif : tous les nouveaux tests au vert et aucune régression sur les suites existantes.
- Si un test met en évidence un vrai bug du moteur, correction minimale et ciblée dans `src/lib/validation.ts`, signalée explicitement.

## Estimation
~45–60 cas de test répartis sur 5 fichiers, couvrant matching, sélection déterministe, auto-approve, décisions, marquage cible et exhaustivité d'affichage.
