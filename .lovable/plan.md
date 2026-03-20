

# Plan : PDR Durée de vie + Préventif structuré + Vue maintenancier

---

## 1. Base de données (migration SQL)

### 1.1 Colonnes ajoutées sur `pdr`
- `duree_vie_min_jours` (integer DEFAULT NULL) — durée de vie minimale en jours
- `duree_vie_max_jours` (integer DEFAULT NULL) — durée de vie maximale / dead age

### 1.2 Table `pdr_instances` (pièces installées actives/passives)
Suit le cycle de vie individuel de chaque pièce consommée.

```text
pdr_instances
├── id (uuid PK)
├── pdr_id (uuid FK → pdr)
├── machine_id (uuid FK → machines, nullable)
├── equipement_id (uuid FK → equipements, nullable)
├── date_installation (timestamptz NOT NULL DEFAULT now())
├── date_remplacement (timestamptz, nullable)
├── statut (text NOT NULL DEFAULT 'active')  -- 'active' | 'passive'
├── intervention_id (uuid, nullable) -- lien vers l'intervention d'installation
├── ticket_id (uuid, nullable)
├── installed_by (uuid, nullable)
├── notes (text DEFAULT '')
├── created_at (timestamptz DEFAULT now())
```
RLS : SELECT authenticated, INSERT/UPDATE pour admin/resp_maintenance/maintenancier/gestionnaire_magasin.

### 1.3 Colonnes ajoutées sur `preventive_plans`
- `line_id` (uuid FK → production_lines, nullable) — ligne associée
- `statut_plan` (text DEFAULT 'valide') — 'brouillon' | 'valide' | 'suspendu'
- `type_maintenance` (text DEFAULT '') — description des opérations
- `source` (text DEFAULT 'manuel') — 'manuel' | 'auto_duree_vie'
- `source_pdr_id` (uuid, nullable) — PDR ayant déclenché la génération auto

### 1.4 Table `preventive_plan_pdr` (PDR concernées par un plan)
```text
preventive_plan_pdr
├── id (uuid PK)
├── plan_id (uuid FK → preventive_plans)
├── pdr_id (uuid FK → pdr)
├── quantite (integer DEFAULT 1)
├── created_at (timestamptz DEFAULT now())
```

### 1.5 Table `preventive_plan_assignees` (maintenanciers affectés)
```text
preventive_plan_assignees
├── id (uuid PK)
├── plan_id (uuid FK → preventive_plans)
├── user_id (uuid NOT NULL)
├── created_at (timestamptz DEFAULT now())
```

### 1.6 Colonnes ajoutées sur `tickets`
- `line_id` (uuid FK → production_lines, nullable) — si pas déjà présent

Vérification : le champ `line_id` existe déjà sur `tickets` (via l'intégration GPAO). Pas besoin d'ajout.

### RLS pour toutes les nouvelles tables
- SELECT : authenticated
- ALL : admin, resp_maintenance, maintenancier

---

## 2. Logique métier

### 2.1 Durée de vie PDR
- À l'installation d'une PDR (via ticket ou préventif), créer une entrée `pdr_instances` avec `statut = 'active'`.
- Lors du remplacement, passer l'ancienne instance à `statut = 'passive'` avec `date_remplacement = now()`.
- Calcul de l'âge actuel : `jours_actifs = now() - date_installation`.

### 2.2 Génération auto de plan préventif
- Lors de la consultation d'une pièce active dont `jours_actifs >= duree_vie_max_jours`, afficher une alerte.
- Bouton "Générer plan préventif" qui crée un plan en `statut_plan = 'brouillon'`, `source = 'auto_duree_vie'`, `source_pdr_id = pdr.id`.
- Le responsable maintenance voit les brouillons et peut les valider (`statut_plan → 'valide'`).

### 2.3 Workflow de validation
- Plans en brouillon : visibles uniquement par admin/resp_maintenance.
- Validation = passage à `statut_plan = 'valide'` + renseignement de la prochaine échéance.
- Les maintenanciers ne voient que les plans validés qui leur sont affectés.

### 2.4 Filtrage maintenancier par shift
- Un maintenancier voit ses plans validés dont `prochaine_echeance` tombe dans l'intervalle de son shift, ou qui sont validés sans date précise mais lui sont assignés.
- Les tickets ouverts/pris_en_charge liés à ses machines/lignes sont aussi affichés.

---

## 3. Écrans UI

### 3.1 Modification de `PdrForm.tsx` et `PdrDetail.tsx`
- Ajouter les champs "Durée de vie min (jours)" et "Durée de vie max (jours)" dans le formulaire et l'onglet Info.
- Nouvel onglet **"Instances"** dans PdrDetail : liste des pièces installées (actives en vert, passives en gris) avec âge calculé et alertes si dead age atteint.

### 3.2 Refonte de `PreventifList.tsx`
- Ajouter colonnes : Ligne, Statut du plan (badge brouillon/validé/suspendu), Maintenanciers affectés.
- Filtres : par statut du plan, par machine, par ligne.
- Onglet/filtre "Brouillons" pour resp_maintenance.
- Clic sur un plan ouvre `PreventifDetail.tsx`.

### 3.3 Nouvelle page `PreventifForm.tsx`
Formulaire de création/édition d'un plan avec sélection en cascade :
1. Machine (select)
2. Ligne (auto-remplie depuis la machine ou sélection manuelle)
3. PDR concernées (multi-select depuis machine_pdr ou toutes les PDR)
4. Type de maintenance / opérations (textarea + checklist)
5. Maintenanciers affectés (multi-select depuis les users avec rôle maintenancier)
6. Fréquence, description, checklist existante

### 3.4 Nouvelle page `PreventifDetail.tsx`
- Info complète du plan : machine, ligne, PDR, maintenanciers, statut, type maintenance.
- Actions : Valider (brouillon → validé), Suspendre, Exécuter.
- Historique des exécutions existant.

### 3.5 Nouvelle page `MaintenancierShiftView.tsx`
Vue dédiée au maintenancier pendant son shift, organisée par ligne puis machine :

```text
┌─────────────────────────────────────┐
│ Mon Shift — 20/03/2026 Matin       │
├─────────────────────────────────────┤
│ ▼ Ligne L01 — Conditionnement      │
│   ▼ Machine M-001 — Remplisseuse   │
│     🔧 Plan: Graissage mensuel     │
│     🎫 Ticket TKT-00042 (ouvert)   │
│   ▼ Machine M-003 — Boucheuse      │
│     🔧 Plan: Changement filtre     │
│ ▼ Ligne L02 — Préparation          │
│     (aucune tâche)                  │
└─────────────────────────────────────┘
```

- Filtre automatique : plans assignés au user connecté + tickets assignés ou sur ses machines.
- Route : `/maintenance/shift`

---

## 4. Fichiers à créer/modifier

### Nouveaux fichiers
- `supabase/migrations/xxx_pdr_lifetime_preventif.sql`
- `src/pages/PreventifForm.tsx`
- `src/pages/PreventifDetail.tsx`
- `src/pages/MaintenancierShiftView.tsx`

### Fichiers modifiés
- `src/pages/PdrForm.tsx` — champs durée de vie
- `src/pages/PdrDetail.tsx` — onglet Instances + alerte dead age
- `src/pages/PreventifList.tsx` — colonnes, filtres, statut plan, navigation
- `src/pages/TicketDetail.tsx` — création d'instance PDR lors de la consommation
- `src/App.tsx` — routes `/preventif/new`, `/preventif/:id`, `/maintenance/shift`
- `src/components/gmao/AppSidebar.tsx` — lien "Mon Shift" pour maintenanciers

---

## 5. Ordre d'implémentation

1. Migration SQL (tables, colonnes, RLS)
2. PdrForm + PdrDetail (durée de vie + instances)
3. PreventifForm (création structurée de plans)
4. PreventifDetail (vue + validation + exécution)
5. PreventifList (filtres, statuts, brouillons)
6. MaintenancierShiftView (vue shift)
7. Intégration instances PDR dans TicketDetail (remplacement)
8. Routes et sidebar

