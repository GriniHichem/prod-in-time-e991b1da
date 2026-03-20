
# Plan : PDR Durée de vie + Préventif structuré + Vue maintenancier

**Statut : ✅ IMPLÉMENTÉ**

## Résumé des changements

### Base de données
- ✅ Colonnes `duree_vie_min_jours` et `duree_vie_max_jours` sur `pdr`
- ✅ Table `pdr_instances` (cycle de vie actif/passif)
- ✅ Colonnes `line_id`, `statut_plan`, `type_maintenance`, `source`, `source_pdr_id` sur `preventive_plans`
- ✅ Table `preventive_plan_pdr` (PDR liées aux plans)
- ✅ Table `preventive_plan_assignees` (maintenanciers affectés)
- ✅ RLS sur toutes les nouvelles tables

### UI
- ✅ `PdrForm.tsx` — champs durée de vie min/max
- ✅ `PdrDetail.tsx` — onglet Instances avec alertes dead age + bouton génération plan
- ✅ `PreventifList.tsx` — filtres par statut/machine, badges brouillon/validé/suspendu
- ✅ `PreventifForm.tsx` — formulaire cascade machine → ligne → PDR → opérations → maintenanciers
- ✅ `PreventifDetail.tsx` — vue détaillée avec validation workflow
- ✅ `MaintenancierShiftView.tsx` — vue shift par ligne/machine
- ✅ `AppSidebar.tsx` — lien "Mon Shift"
- ✅ `App.tsx` — routes `/preventif/new`, `/preventif/:id`, `/preventif/:id/edit`, `/maintenance/shift`
