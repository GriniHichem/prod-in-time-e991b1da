
# Améliorer la fiabilité de création/modification des règles (Notifications & Validations)

## Constat

Les deux éditeurs actuels (`src/components/notifications/RuleEditorDialog.tsx` et `src/components/validations/RuleEditorDialog.tsx`) souffrent des mêmes faiblesses :

- **Champs libres non vérifiés** : `event_type`, `module`, `action_type`, `entity_type` sont des `<Input>` texte. Une faute de frappe = règle qui ne se déclenche jamais (silencieux).
- **Conditions illisibles** : côté Notifications c'est un JSON brut (`{"all":[…]}`), côté Validations un objet caché. Aucun utilisateur métier ne peut le maintenir.
- **Pas de garde-fous** : aucune détection de doublon (deux règles identiques actives), aucune alerte si `target_roles` est vide (règle qui n'envoie rien à personne), aucune validation que `validator_roles` est non vide pour une règle bloquante.
- **Pas de prévisualisation** : impossible de tester si la règle se déclencherait sur un cas réel avant de sauver.
- **Schémas désynchronisés** : le moteur `validation.ts` accepte `{or:[…], min_duration_minutes, ecart_seuil_pct, min_age_hours, …}`, mais l'éditeur n'expose rien — l'admin doit deviner.
- **Audit incomplet côté Validations** : la création/édition d'une règle n'est pas tracée dans `audit_logs` (seul Notifications le fait).
- **Aucun test** des règles : pas de "dry run" pour vérifier le matching avant activation.

## Objectifs

1. Guider l'utilisateur avec des **catalogues centralisés** (modules / events / actions / entités) au lieu de saisie libre.
2. Remplacer le **JSON brut** par un **constructeur visuel de conditions** (avec fallback JSON pour experts).
3. Ajouter des **validations de cohérence** avant sauvegarde (warnings non bloquants + erreurs bloquantes).
4. Détecter les **doublons et conflits** au moment d'enregistrer.
5. Offrir un **dry run** : "Tester cette règle avec ces données" → indique si elle matcherait.
6. **Auditer** systématiquement create/update/delete pour les deux types de règles.
7. Préserver tout le code existant (rétro-compatibilité : règles déjà en base continuent à fonctionner).

## Plan technique

### 1. Catalogues partagés — `src/lib/ruleCatalog.ts` (nouveau)

Source unique de vérité pour modules, events, actions, entités, opérateurs.

```ts
export const MODULES = [
  { value: "tickets", label: "Tickets / GMAO", group: "Maintenance" },
  { value: "interventions", label: "Interventions", group: "Maintenance" },
  { value: "pdr_stock", label: "Stock PDR", group: "Maintenance" },
  { value: "consommations", label: "Consommations", group: "GPAO" },
  // …complet
];

export const NOTIF_EVENTS_BY_MODULE: Record<string, Array<{value: string; label: string; sampleContext: Record<string, unknown>}>> = {
  tickets: [
    { value: "ticket_created", label: "Ticket créé", sampleContext: { priority: "high", machine_criticality: "A" } },
    { value: "ticket_resolved", label: "Ticket résolu", sampleContext: { duration_minutes: 90 } },
    // …
  ],
  // …
};

export const VALIDATION_ACTIONS_BY_MODULE: Record<string, Array<{value: string; label: string; entity: string; sampleContext: Record<string, unknown>}>> = {
  pdr_stock: [
    { value: "correction", label: "Correction de stock", entity: "pdr_movement", sampleContext: { ecart_pct: 15 } },
    { value: "inventaire", label: "Ajustement inventaire", entity: "pdr_movement", sampleContext: { ecart_pct: 8 } },
    // …
  ],
  // …
};

export const CONDITION_FIELDS: Record<string, Array<{key: string; label: string; type: "number"|"string"|"enum"; values?: string[]}>> = {
  // par module : champs disponibles dans le `context` runtime
  tickets: [
    { key: "priority", label: "Priorité", type: "enum", values: ["low","medium","high","critical"] },
    { key: "machine_criticality", label: "Criticité machine", type: "enum", values: ["A","B","C","D"] },
    { key: "duration_minutes", label: "Durée (min)", type: "number" },
  ],
  // …
};

export const ROLES = [/* unique source */];
```

Les deux éditeurs importent ce catalogue. Les sélecteurs `event_type` / `action_type` deviennent dépendants du module choisi (cascade).

### 2. Constructeur de conditions — `src/components/rules/ConditionBuilder.tsx` (nouveau)

Composant réutilisable :

```text
[ ALL ▼ ]   ← all/any
  ├── [Champ ▼: priority] [op ▼: =] [valeur: high]   [×]
  ├── [Champ ▼: duration_minutes] [op ▼: ≥] [valeur: 30]   [×]
  └── [+ ajouter une condition]   [+ ajouter un sous-groupe]
```

- Champs proposés selon le module sélectionné (depuis `CONDITION_FIELDS`).
- Opérateurs adaptés au type (`=, ≠, >, ≥, <, ≤, dans, contient`).
- Bouton **"Voir le JSON"** → mode expert (édition brute, parser sécurisé).
- Le composant émet l'objet final compatible avec :
  - le format `notifications.ts` (`{all:[{field,op,value}]}`)
  - le format `validation.ts` (`{or:[…], min_duration_minutes, …}`) via un adaptateur de sortie.

### 3. Pré-flight checks — `src/lib/ruleValidation.ts` (nouveau)

Fonction `validateRulePayload(type, payload, existingRules)` qui retourne :

```ts
{ errors: string[]; warnings: string[] }
```

Règles vérifiées :

**Erreurs (bloquent la sauvegarde)** :
- Nom vide
- Module / event / action non listés dans le catalogue (sauf si admin coche "Forcer valeur custom")
- Règle de validation `enforcement="blocking"` sans `validator_roles` ni `validator_users`
- JSON conditions invalide
- Opérateurs numériques avec valeur non numérique

**Warnings (affichés mais non bloquants)** :
- `target_roles` vide ET `target_users` vide → "Cette règle ne notifiera personne"
- Règle identique déjà active (même module + event + conditions sérialisées)
- Sévérité `critical` + canal `in_app` seul (pas d'email) → "Critique sans email ?"
- Mode `blocking` sur module terrain (`tickets`, `interventions`) → "Risque de blocage opérationnel"
- Heures silencieuses activées sur règle critique

Les warnings s'affichent dans une bannière `<Alert>` au-dessus du footer ; un bouton "Enregistrer quand même" est présenté.

### 4. Dry run — bouton "Tester la règle"

Dans chaque éditeur, sous les conditions :

```
[Tester avec un exemple ▾]
{ priority: "high", duration_minutes: 90 }   ← textarea pré-rempli depuis sampleContext
[ Lancer le test ]   →  ✓ Cette règle se déclencherait  /  ✗ Conditions non satisfaites
```

- Notifications : appelle `evaluateConditions(sample, conditions)` (déjà exporté).
- Validations : appelle `matchConditions(conditions, sample)` — il faut **l'exporter** depuis `src/lib/validation.ts` (actuellement privée).

### 5. Détection de doublons — au chargement de la liste

Dans `NotificationRulesAdmin.tsx` et `ValidationRulesAdmin.tsx`, après `fetchRules`, regrouper par `(module, event_type|action_type, hash(conditions))`. Afficher un badge `Doublon` discret sur les règles dupliquées avec tooltip indiquant les IDs en conflit. Pas de suppression auto — juste un signal.

### 6. Audit complet pour Validation Rules

Ajouter dans `src/components/validations/RuleEditorDialog.tsx` les appels `logAudit()` pour `create`/`update` (pattern identique à Notifications). Ajouter aussi `logAudit` pour `delete` et `toggleActive` dans `ValidationRulesAdmin.tsx`.

### 7. UX cohérente entre les deux dialogues

Les deux éditeurs partagent désormais la même structure visuelle :

```text
┌─ Identité ───────────────────────────────────┐
│ Nom *   [_______]   [✓ Active] [✓ Critique]  │
│ Description (libre)                          │
└──────────────────────────────────────────────┘
┌─ Cible ──────────────────────────────────────┐
│ Module *  [Sélecteur ▼]                      │
│ Événement * (ou Action *) [Sélecteur ▼]      │
│ Type d'entité [Sélecteur ▼ - optionnel]      │
└──────────────────────────────────────────────┘
┌─ Conditions de déclenchement ────────────────┐
│ [ConditionBuilder]   [JSON expert ▾]         │
│ [Tester avec un exemple]                     │
└──────────────────────────────────────────────┘
┌─ Destinataires / Validateurs ────────────────┐
│ Rôles  [chips multi-select]                  │
│ Utilisateurs spécifiques [combobox] (notif)  │
└──────────────────────────────────────────────┘
┌─ Délivrance (notif) / Application (valid) ───┐
│ Canaux / Fréquence  /  Mode + Priorité       │
└──────────────────────────────────────────────┘

⚠ Warnings (si présents)            [Annuler] [Enregistrer]
```

### 8. Aucune migration DB nécessaire

Tous les schémas existants (`notification_rules`, `validation_rules`) supportent déjà `conditions JSONB`. Aucune colonne ajoutée, aucune contrainte modifiée, **rétro-compatibilité totale** des règles existantes.

## Fichiers touchés

**Nouveaux**
- `src/lib/ruleCatalog.ts`
- `src/lib/ruleValidation.ts`
- `src/components/rules/ConditionBuilder.tsx`
- `src/components/rules/RulePreflight.tsx` (bannière warnings + dry run)

**Modifiés**
- `src/components/notifications/RuleEditorDialog.tsx` → utilise catalogue + ConditionBuilder + preflight
- `src/components/validations/RuleEditorDialog.tsx` → idem + audit
- `src/lib/validation.ts` → exporter `matchConditions` pour le dry run
- `src/pages/parametres/NotificationRulesAdmin.tsx` → badges doublons
- `src/pages/parametres/ValidationRulesAdmin.tsx` → badges doublons + audit toggle/delete
- `MANUAL.md` → section "Création de règles fiables"

**Pas touchés**
- Moteurs `triggerNotification` et `checkValidationRequired` — formats d'entrée inchangés.
- Tables Supabase — aucun changement de schéma.
- Workflows en cours d'exécution — règles existantes continuent de tourner.

## Critères de validation

- Créer une règle Notification sans destinataire → warning visible, sauvegarde possible si confirmée.
- Créer une règle Validation `blocking` sans validator_roles → erreur bloquante.
- Saisir `{ priority: "high" }` dans le testeur d'une règle "ticket_resolved si priority=high" → ✓ vert.
- Faute de frappe sur module → impossible (dropdown).
- Toute création/modification/suppression apparaît dans `/audit`.
- Règles existantes en base s'affichent et s'éditent sans perte de données.
