
# Module Inventaire — Plan détaillé

## Logique métier (inchangée, juste formalisée)

```text
Responsable Inventaire
   └── crée une CAMPAGNE (périmètre: familles/sous-familles, cibles: PDR + Organes)
        ├── assigne un SCOPE à Agent A  (familles/sous-familles autorisées)
        ├── assigne un SCOPE à Agent B  (mêmes familles → double comptage)
        └── (optionnel) prépare Agent C pour arbitrage

Agents A & B  →  comptent indépendamment chaque article de leur scope
                 (saisie qté + validation, puis VERROUILLAGE définitif)

Système        →  calcule l'écart |A − B| par article
                  ├── écart = 0       → conforme, qty_finale = A (= B)
                  └── écart ≠ 0       → article ajouté à la liste C

Agent C        →  recompte uniquement les articles en écart
                  ├── C = A           → conforme, qty_finale = C
                  ├── C = B           → conforme, qty_finale = C
                  └── C ≠ A et C ≠ B  → article renvoyé en RECOMPTAGE A & B
                                        (cycle round = 2, 3, …)
```

Règles d'or transversales :
- Saisie verrouillée dès validation (aucune modification possible, même par l'agent lui-même).
- Recherche article par scan QR / code-barres / code ERP, **mais uniquement si l'article appartient au scope autorisé** de l'agent — sinon refus explicite.
- Toute correction nécessite une demande d'annulation explicite par le Responsable Inventaire (audit obligatoire).

---

## Architecture

### Nouveaux rôles (enum `app_role`)
- `responsable_inventaire`
- `agent_inventaire`

Un même utilisateur peut cumuler les deux. Le rôle d'arbitre (C) n'est **pas** un rôle distinct : c'est un `agent_inventaire` désigné comme arbitre sur une campagne donnée.

### Tables

```text
inventory_campaigns
  id, code (auto INV-AAAAMM-####), label, description
  status: draft | en_cours | arbitrage | cloturee | annulee
  scope_pdr boolean, scope_organes boolean
  date_debut, date_fin_prevue, date_cloture
  responsable_id, created_by, ...audit

inventory_campaign_scopes        -- familles/sous-familles couvertes par la campagne
  campaign_id, family_id, include_children boolean
  -- (pour organes : pas de famille → géré via inventory_campaign_organe_targets)

inventory_assignments            -- A et B (et C plus tard) sur la campagne
  id, campaign_id, agent_id
  role: agent_a | agent_b | agent_c
  -- C est créé à la volée quand l'écart est détecté (passage en 'arbitrage')

inventory_assignment_scopes      -- familles/sous-familles autorisées par agent
  assignment_id, family_id, include_children boolean

inventory_targets                -- snapshot des articles à compter (gelé à l'ouverture)
  id, campaign_id
  entity_type: pdr | organe
  entity_id, entity_code, entity_label, family_id
  qty_systeme numeric             -- stock théorique au moment du snapshot
  current_round int default 1     -- 1, 2, 3… (cycles A/B re-comptage)
  status: a_compter | en_arbitrage | conforme | a_recompter | cloture

inventory_counts                 -- une ligne par (target, agent, round)
  id, target_id, assignment_id, round int
  qty_comptee numeric             -- 4 décimales (convention projet)
  validated_at timestamptz NOT NULL  -- verrouillage : tout est posé d'un coup
  notes
  UNIQUE (target_id, assignment_id, round)

inventory_results                -- résultat consolidé par target
  target_id PK, campaign_id
  qty_a, qty_b, qty_c             -- dernière valeur de chaque rôle (pour le round courant)
  ecart_ab, ecart_ac, ecart_bc
  qty_finale numeric              -- A (=B), ou C si C=A ou C=B
  decision: conforme_ab | conforme_c_eq_a | conforme_c_eq_b | recompte_ab | en_attente
  decided_at, decided_by
```

Conventions respectées : audit complet (`created_by`, `updated_by`, `motif`), précision numérique 4 décimales en grammes, codes auto-générés via trigger, RLS via `has_role()`.

### Fonctions / Triggers SQL

- `inv_ensure_targets(campaign_id)` — snapshot initial des articles dans le périmètre, fige `qty_systeme`.
- `inv_register_count(target_id, qty, notes)` — SECURITY DEFINER :
  1. Vérifie que l'agent est assigné, que `target.family_id` est dans son `assignment_scopes`,
  2. Refuse si un `inventory_counts` existe déjà pour `(target, agent, round)` → **verrouillage**,
  3. Insère le count, recalcule `inventory_results`, met à jour `target.status`.
- `inv_recompute_result(target_id)` — applique l'arbre de décision (A=B, C=A/B, sinon recompte) et incrémente `current_round` quand recompte A&B est requis.
- Trigger `tg_lock_inventory_counts` — refuse tout `UPDATE`/`DELETE` sur `inventory_counts` (sauf admin via demande de validation).
- `inv_close_campaign(campaign_id)` — refuse si des targets ne sont pas en `conforme_*` ; pousse `qty_finale` vers `pdr.stock_actuel` / mouvements `inventaire` (utilise les permissions existantes `can_inventory`).

### RLS
- `inventory_campaigns`, `inventory_assignments`, `inventory_*_scopes` : lecture/écriture pour `responsable_inventaire` + `admin`.
- `inventory_targets`, `inventory_counts`, `inventory_results` : lecture pour les agents assignés, écriture **uniquement** via les RPC `inv_register_count`.
- Audit `audit_logs` enrichi (module = `inventaire`).

---

## UI / Routes

```text
/inventaire                        → Dashboard (campagnes en cours, KPI, écarts)
/inventaire/campagnes              → Liste campagnes
/inventaire/campagnes/nouvelle     → Création (Responsable)
/inventaire/campagnes/:id          → Détail : périmètre, agents, avancement, écarts
/inventaire/compter/:campaignId    → Écran agent (mobile-first)
/parametres/inventaire             → (option) gabarits familles/scopes par défaut
```

Écran agent (kiosque/mobile, conventions Shift Apps existantes) :

```text
[ Famille ▼ ] → [ Sous-famille ▼ ]   (uniquement celles autorisées)
   └── liste articles à compter (badge : non compté / verrouillé)
[ 🔍 Scanner ] (ScanButton existant, allowedTypes=['pdr','organe'])
   └── si article hors scope → toast rouge "Hors périmètre autorisé"
   └── si déjà compté        → ouverture en lecture seule
   └── sinon                 → champ Qté + bouton "Valider et verrouiller"
                               (confirmation modale, irréversible)
```

Écran responsable :
- Vue tableau : article, qté A, qté B, écart, statut, bouton "Désigner C" (apparaît dès écart).
- Onglet "Liste C" : articles à arbitrer ; après validation C, recalcul automatique.
- Onglet "À recompter A&B" : génère un nouveau `round` et débloque la saisie pour A & B sur ces articles uniquement.
- Bouton "Clôturer la campagne" (impossible tant qu'il reste un target non conforme).

### Sidebar
- Nouveau groupe **Inventaire** (icône `ClipboardList`) visible si l'utilisateur a `responsable_inventaire`, `agent_inventaire`, ou `admin`.

---

## Sécurité & garde-fous

- Scan : on réutilise `resolveScannedCode` / `ScanButton` avec `allowedTypes=['pdr','organe']`. Une vérification serveur supplémentaire (RPC) refuse les articles hors scope.
- Verrouillage : trigger SQL bloque `UPDATE/DELETE` sur `inventory_counts` ; le frontend affiche les counts validés en lecture seule (input désactivé + cadenas).
- Aucun agent ne peut voir la quantité saisie par l'autre tant que la campagne est en `en_cours` (RLS filtrée par `assignment_id = mon_assignment`). Le responsable voit tout.
- Auto-numérotation `INV-AAAAMM-####` via trigger (cohérent avec `OF-`, `TKT-`).
- Audit de chaque comptage, écart détecté, recompte demandé, clôture campagne.

---

## Tests (Vitest)

- `inventory/scope.test.ts` — un agent ne peut compter que ses familles autorisées.
- `inventory/lock.test.ts` — `UPDATE` sur un count validé est rejeté.
- `inventory/decision-tree.test.ts` — arbre A=B, C=A, C=B, C≠A&B (round suivant).
- `inventory/snapshot.test.ts` — `inv_ensure_targets` capture bien `qty_systeme` au moment T.
- `inventory/scan-out-of-scope.test.ts` — refus serveur si scan hors périmètre.

---

## Livrables

1. Migration : tables + enums + triggers + RPC + RLS + ajout des 2 rôles à `app_role`.
2. Hooks : `useInventoryCampaigns`, `useInventoryAgentScope`, `useInventoryTargets`, `useInventoryCounts` (realtime sur les écarts).
3. Pages : Dashboard, Liste/Détail campagne, Écran agent, Écran arbitrage C.
4. Sidebar + permissions (`usePermissions` enrichi avec module `inventaire`).
5. Intégration `pdr_stock_movements` (type `inventaire`) à la clôture, via les permissions PDR existantes.
6. Tests Vitest + mémoire projet (`mem://features/inventory-double-count`).

Aucun changement de stratégie : double comptage A/B, arbitrage C avec règle C=A ou C=B, recompte A&B sinon, scope famille/sous-famille par agent, scan QR/code-barres autorisé uniquement dans le scope, saisie verrouillée après validation.
