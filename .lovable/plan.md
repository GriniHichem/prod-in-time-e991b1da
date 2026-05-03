
# PDR — Suivi par positions d'installation (hybride)

## Principe directeur
- Une **seule référence PDR stock** (ex. ROBINET-DN50) — jamais multipliée.
- Le suivi physique se fait via **positions d'installation** rattachées à un lien `pdr_entity_links` (Machine ou Équipement).
- Stock, mouvements, tickets, préventif et GPAO **inchangés**. La position devient un *attribut additionnel* de la consommation.

## 1) Schéma base de données (nouvelle migration)

### Table `pdr_install_positions`
Une ligne = une position physique sur un actif pour une PDR donnée.
```
id uuid pk
link_id uuid fk → pdr_entity_links(id) on delete cascade   -- (pdr_id, entity_type, entity_id)
position_index int not null         -- ordre d'affichage
designation text not null
description text
marker_x numeric    -- coordonnées 0-100 sur image principale (null = pas de repère)
marker_y numeric
statut text not null default 'active'  -- active | inactive | supprimee
-- Règles de durée de vie (par position, override possible du lien)
lifespan_mode text not null default 'time'   -- time | production | mixte | none
seuil_min numeric
seuil_max numeric
seuil_alerte_pct numeric default 80
unite_mesure text                  -- 'h', 'jours', 'unités', etc.
production_rule text               -- 'complete' | 'reparti' | 'coefficient' | 'manuel'
production_coefficient numeric default 1
compteur_manuel numeric            -- pour mode 'manuel'
created_at, updated_at, created_by, updated_by
```
Contraintes:
- `unique (link_id, position_index)` 
- check `statut in ('active','inactive','supprimee')`
- check `lifespan_mode in ('time','production','mixte','none')`
- check `production_rule in ('complete','reparti','coefficient','manuel') or null`
- trigger validation: si `lifespan_mode in ('production','mixte')` alors `production_rule` requis ; `seuil_max >= seuil_min` ; pas de suppression physique si historique existe (voir §3).

### Extension `pdr_instances` (suivi par position, additif)
Ajouter colonnes nullables:
```
position_id uuid fk → pdr_install_positions(id) on delete set null
compteur_pose_at numeric    -- snapshot du compteur production au moment de la pose
```
Aucune migration de données : les instances existantes restent rattachées seulement à machine/equipement/organe.

### Vue `pdr_position_status` (read-only, calculée)
Retourne pour chaque position active:
- `current_pdr_instance_id`, `pdr_id`, `date_pose`
- `compteur_actuel` (calculé selon `lifespan_mode` + `production_rule`)
- `compteur_max` (= `seuil_max`)
- `pct_consomme`, `compteur_restant`
- `niveau` (`vert` <60%, `orange` 60-90%, `rouge` >90% ou dépassé)
- `last_ticket_id`, `last_preventive_plan_id`

Calcul production:
- récupère la somme `quantite_produite` de `production_declarations` validées (jointes via `shifts.line_id` → ligne de la machine) entre `date_pose` et `now()`
- mode `complete` → somme brute
- mode `reparti` → somme / nb positions actives sur la même PDR/lien
- mode `coefficient` → somme × `production_coefficient`
- mode `manuel` → `compteur_manuel`

### Fonction `get_position_counter(position_id uuid) returns numeric`
Encapsule la logique pour réutilisation côté UI / triggers d'alerte.

### Audit
Triggers `audit_logs` standard sur INSERT/UPDATE/DELETE de `pdr_install_positions` + sur changement de `position_id` dans `pdr_instances` (motif obligatoire pour soft-delete).

### RLS
- SELECT : tout authentifié (cohérent avec `pdr_entity_links`).
- INSERT/UPDATE/DELETE : `admin`, `resp_maintenance`, `maintenancier`, `gestionnaire_magasin` (mêmes rôles que `pdr_entity_links`).

## 2) Onglet PDR enrichi (Machine + Équipement)

Fichiers : `src/pages/MachineDetail.tsx`, `src/pages/EquipmentDetail.tsx`.

Pour chaque ligne PDR de l'onglet PDR existant, ajouter:
- Switch **« Activer le suivi par positions »** (toggle = au moins 1 position existe).
- Si activé : bouton **« Gérer positions »** ouvre un nouveau composant `PdrPositionsManager`.

Nouveau composant `src/components/pdr/PdrPositionsManager.tsx`:
- Tableau des positions (désignation, statut, compteur %, dernier changement).
- Boutons : Ajouter / Modifier / Désactiver / Supprimer (logique).
- Onglet « Image » : affiche l'image principale de l'actif (réutilise `useEntityImages`) avec markers SVG cliquables/draggables (coordonnées 0-100 %). Tooltip = désignation. Liste textuelle alternative en dessous (mobile-first).
- Pour chaque position : édition inline du `lifespan_mode`, seuils, `production_rule`, coefficient, unité.

Hook `src/hooks/usePdrPositions.ts` :
- `usePdrPositions(linkId)` → liste + statuts calculés (via vue).
- mutations : `createPosition`, `updatePosition`, `softDeletePosition`, `setPositionMarker`.

## 3) Validations (côté DB + Zod côté UI)

- Position `active` → `designation` non vide (DB + Zod).
- Suppression physique impossible si `EXISTS (SELECT 1 FROM pdr_instances WHERE position_id = ...)` → forcer `statut = 'supprimee'` à la place. Trigger `BEFORE DELETE` qui RAISE EXCEPTION.
- Compteurs jamais négatifs : check `compteur_manuel >= 0`, `seuil_min >= 0`, `seuil_max >= 0`.
- `seuil_max >= seuil_min` (cohérent avec mémoire data-integrity-rules).
- `lifespan_mode in ('production','mixte')` ⇒ `production_rule not null`.
- Historique immuable : pas d'UPDATE/DELETE sur `pdr_instances` sauf champs métier explicites (déjà géré par RLS — vérifier et durcir via trigger si besoin).

## 4) Intégration consommation PDR (workflow tickets / interventions)

Quand une PDR est consommée dans une intervention sur une machine où `pdr_install_positions` existe :
- Dans `intervention_pdr` form (UI) : si la PDR a des positions sur cet actif, **demander la position cible** (Select obligatoire).
- À la création de `pdr_instances` : enregistrer `position_id` + `compteur_pose_at` (snapshot via `get_position_counter`).
- L'instance précédente sur cette position passe automatiquement en `statut='replaced'` (pattern existant `pdr_instances.statut`).
- **Stock inchangé** : la décrémentation reste pilotée par les mouvements existants.

Fichiers concernés (lecture seule, ajout d'un champ Select) :
- `src/pages/TicketDetail.tsx` (zone intervention_pdr)
- `src/pages/InterventionJournal.tsx`

## 5) Affichage statut position

Dans `PdrPositionsManager` et dans la fiche PDR (`src/pages/PdrDetail.tsx` → nouvel onglet « Positions installées »):
- PDR installée (lien vers fiche PDR)
- Date dernière pose, dernier changement
- Compteur actuel / max + barre de progression colorée (vert/orange/rouge)
- % consommé, compteur restant
- Lien vers dernier ticket / plan préventif (déjà disponibles via `pdr_instances.ticket_id` + jointure préventif)

## 6) Déclenchement préventif (cohérent avec mémoire `pdr-lifespan-management`)

Les positions en `niveau='rouge'` doivent apparaître dans le flux existant de génération de plans préventifs **draft** (réutilise la logique actuelle, juste élargie pour scanner aussi `pdr_install_positions` en plus de `pdr_instances`). Aucun nouveau workflow utilisateur — juste une source supplémentaire pour le job existant.

## 7) Plan d'implémentation

```text
Étape 1 — Migration SQL
  ├─ table pdr_install_positions + contraintes + RLS
  ├─ alter pdr_instances add position_id, compteur_pose_at
  ├─ vue pdr_position_status + fonction get_position_counter
  └─ triggers validation + audit + soft-delete

Étape 2 — Hooks et types
  ├─ src/hooks/usePdrPositions.ts
  └─ src/lib/pdrPositionStatus.ts (helpers couleurs/calculs front)

Étape 3 — UI gestion positions
  ├─ src/components/pdr/PdrPositionsManager.tsx
  ├─ src/components/pdr/PositionImageMarkers.tsx (SVG sur image)
  └─ src/components/pdr/PositionForm.tsx (création/édition)

Étape 4 — Intégration onglets PDR existants
  ├─ MachineDetail.tsx : switch + bouton Gérer positions
  ├─ EquipmentDetail.tsx : idem
  └─ PdrDetail.tsx : nouvel onglet « Positions installées »

Étape 5 — Saisie consommation avec position
  ├─ TicketDetail.tsx : Select position si applicable
  └─ InterventionJournal.tsx : idem

Étape 6 — Mise à jour mémoire
  └─ mem://features/pdr-lifespan-management : ajouter section positions
```

## 8) Garanties non-régression

- **Stock** : aucune nouvelle écriture dans `pdr` ni `pdr_stock_movements`. Les positions ne touchent jamais le stock.
- **Tickets / Interventions** : `position_id` est nullable et ignoré si absent → tout flux existant continue.
- **GPAO** : lecture seule de `production_declarations` via vue. Aucune modification.
- **Préventif** : la génération de drafts est étendue (additif), pas modifiée.
- **Audit** : tous les CRUD positions + changements d'instance auditer via le pattern `audit_logs` existant (auteur, motif, valeurs avant/après).

## 9) Points techniques notables

- Les markers d'image utilisent des coordonnées **relatives 0-100** pour rester valides quel que soit le DPR/zoom.
- Le calcul `production` joint `production_declarations → shifts → line_id` car la PDR est rattachée à une machine, qui est rattachée à une `production_lines`. Si la machine n'a pas de ligne, le mode `production` retombe sur compteur manuel + warning UI.
- La vue `pdr_position_status` est recalculée à chaque SELECT (pas de matérialisation) — coût acceptable au volume attendu (<10k positions). Index sur `pdr_instances(position_id)` pour les jointures.
