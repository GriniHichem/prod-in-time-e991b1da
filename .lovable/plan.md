
## Objectif

Ajouter une nouvelle entité **Organe** (sous-ensemble fonctionnel d'une machine ou d'un équipement) et une liaison PDR flexible vers Machine / Équipement / Organe, sans casser les données existantes (machines, équipements, `machine_pdr`, `pdr_instances` restent intacts).

Hiérarchie cible : **Ligne → Machine / Équipement → Organe → PDR**

---

## 1. Migrations base de données

### a) Nouvelle table `organes`
- `id`, `code` (unique), `designation`, `description`
- `type` enum `organe_type` : `mecanique`, `electrique`, `pneumatique`, `hydraulique`, `electronique`, `automatisme`, `instrumentation`, `autre`
- `statut` enum `organe_statut` : `en_service`, `en_panne`, `en_maintenance`, `hors_service`
- `criticite` enum existant (`A`/`B`/`C`)
- `machine_id` uuid nullable, `equipement_id` uuid nullable
- `sort_order` int, `is_active` bool, timestamps
- **Contrainte XOR** : `CHECK ((machine_id IS NOT NULL) <> (equipement_id IS NOT NULL))` (parent obligatoire, un seul)
- RLS : SELECT pour authenticated, ALL pour `admin` + `resp_maintenance` + `bureau_methode` (si rôle existant, sinon admin/resp_maintenance)

### b) Nouvelle table `pdr_entity_links` (liaison flexible PDR ↔ actif)
- `id`, `pdr_id`, `entity_type` text (`machine` | `equipement` | `organe`), `entity_id` uuid
- `quantite_recommandee` int default 1, `commentaire` text
- timestamps + index `(pdr_id, entity_type, entity_id)` unique
- RLS identique à `machine_pdr`
- **Backfill** : copier toutes les lignes de `machine_pdr` en `entity_type='machine'` (pas de suppression de `machine_pdr` pour compatibilité ascendante)

### c) Permissions
- Insérer des lignes `role_permissions` pour le module `organes` (admin = full, resp_maintenance = full, maintenancier = view, autres = view)
- Garder `machine_pdr` en lecture pour compat, mais toutes les nouvelles écritures passent par `pdr_entity_links`

### d) Tickets & plans préventifs (additif, pas de drop)
- `tickets` : ajouter `equipement_id uuid nullable`, `organe_id uuid nullable` (`machine_id` reste nullable existant)
- `preventive_plans` : ajouter `equipement_id uuid nullable`, `organe_id uuid nullable`
- Pas de contrainte XOR stricte (un ticket organe garde aussi `machine_id` parent pour requêtes), validation côté UI

---

## 2. Code application

### a) Nouvelles pages
- `src/pages/OrganesList.tsx` — liste filtrable (parent type/parent, type, statut, criticité) + bouton reset filtres (convention existante)
- `src/pages/OrganeForm.tsx` — création/édition avec sélecteur **parent** (radio : Machine | Équipement) puis Select de l'entité
- `src/pages/OrganeDetail.tsx` — onglets : Infos, PDR liées, Tickets, Préventif, Documents, Images (réutilise `EntityDocumentManager`/`EntityImageUploader` avec `entityType="organe"`)
- Routes ajoutées dans `src/App.tsx` : `/organes`, `/organes/new`, `/organes/:id`, `/organes/:id/edit`
- Item de menu dans `AppSidebar` (groupe GMAO)

### b) Hook réutilisable
- `src/hooks/usePdrLinks.ts` : helpers `linkPdr(pdrId, entityType, entityId, qty)`, `unlinkPdr(linkId)`, `getLinksByEntity(entityType, entityId)`, `getLinksByPdr(pdrId)` — basés sur `pdr_entity_links`

### c) Adaptations pages existantes

**`MachineDetail.tsx`** :
- Ajouter onglet **Organes** (liste des organes où `machine_id = id`, lien vers fiche organe)
- Onglet **PDR** : agréger PDR directes (via `pdr_entity_links` machine + ancien `machine_pdr`) **+ PDR des organes enfants**, en colonnes "Source" (Direct / Organe X)

**`EquipmentDetail.tsx`** :
- Ajouter onglets : Organes, PDR, Tickets, Préventif (alignés sur Machine)
- Onglet PDR : PDR directes (entity_type=equipement) + PDR des organes enfants

**`PdrDetail.tsx`** — onglet "Machines" devient **"Actifs liés"** :
- 3 sections : Machines / Équipements / Organes (depuis `pdr_entity_links` + fallback `machine_pdr`)
- UI d'ajout : sélecteur type d'actif puis combobox de l'entité
- Validation : si `pdr.statut_pdr === 'strategique'` et 0 lien → blocage avec message

**`EquipmentForm.tsx`** :
- Validation côté UI : `machine_id` OU `line_id` obligatoire (interdire orphelin) — message clair

**`TicketsList.tsx` / formulaire ticket** :
- Sélecteur cible : Machine | Équipement | Organe (radio + select). Si Organe choisi, auto-remplir machine/équipement parent (lecture seule)
- `TicketDetail.tsx` : afficher la cible avec breadcrumb Ligne → Machine/Équipement → Organe

**`PreventifForm.tsx` / `PreventifDetail.tsx`** :
- Mêmes adaptations cible (Machine | Équipement | Organe)
- Cascade de PDR : si organe, suggérer PDR liées à l'organe ; sinon PDR machine/équipement

**`LineSynoptic.tsx`** :
- Afficher machines (ordonnées) + équipements autonomes de la ligne (`equipements.line_id = line.id` sans `machine_id`)
- Dans bloc machine : sous-blocs cliquables pour les organes
- Indicateurs : statut, criticité, dispo PDR, tickets ouverts (déjà présents pour machine, étendre à organe)

### d) RBAC UI
- `RolesMatrix.tsx` : ajouter le module `organes` dans `MODULE_GROUPS` (groupe GMAO) avec libellé "Organes"
- `usePermissions` fonctionne déjà génériquement, aucun changement

### e) Conventions à respecter (memory)
- Bouton reset filtres standard sur `OrganesList`
- Aucun `SelectItem` avec `value=""` (utiliser sentinel `__all__` comme dans le projet)
- Prix en **DA** partout
- Documents/Images via le système standardisé (`entity_type='organe'`)

---

## 3. Migration des données (rétro-compat)

- **Ne rien supprimer** : `machine_pdr`, `pdr.machines` (relations existantes) restent fonctionnels
- Backfill `pdr_entity_links` à partir de `machine_pdr` (entity_type='machine', entity_id=machine_id, quantite_recommandee)
- `pdr_instances` : ajouter `organe_id uuid nullable` pour permettre instances installées sur organe (optionnel, additif)
- Lectures dans le code : préférer `pdr_entity_links` ; pour l'historique, fallback sur `machine_pdr`

---

## 4. Sécurité

- Toutes les nouvelles tables avec RLS activé
- Policies via `has_role()` (security definer existant) — pas de risque de récursion
- Document permissions : ajouter `entity_type='organe'` dans `document_permissions` (insertion par défaut copiée depuis `machine`)

---

## Fichiers impactés (résumé)

**Migrations** : 1 migration SQL (tables `organes`, `pdr_entity_links`, colonnes additives `tickets`/`preventive_plans`/`pdr_instances`, RLS, backfill, role_permissions, document_permissions).

**Nouveaux fichiers** : `OrganesList.tsx`, `OrganeForm.tsx`, `OrganeDetail.tsx`, `usePdrLinks.ts`.

**Modifiés** : `App.tsx`, `AppSidebar.tsx`, `MachineDetail.tsx`, `EquipmentDetail.tsx`, `EquipmentForm.tsx`, `PdrDetail.tsx`, `PdrForm.tsx`, `TicketsList.tsx`, `TicketDetail.tsx`, `PreventifForm.tsx`, `PreventifDetail.tsx`, `LineSynoptic.tsx`, `RolesMatrix.tsx`, `MANUAL.md` (chapitre Organes + diagramme hiérarchie).

---

## Non inclus (à confirmer si souhaité)

- Création automatique d'organes "par défaut" lors d'une migration de structure existante (aucune donnée actuelle ne suggère un mapping fiable)
- Import CSV des organes (peut être ajouté plus tard via le composant `CsvImporter` existant)
- Calcul automatique du statut Machine en fonction des statuts d'organes (ex : machine "en panne" si un organe critique est en panne) — à clarifier comme évolution future
