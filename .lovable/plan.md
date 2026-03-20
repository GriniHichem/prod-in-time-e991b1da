

# Plan: Refonte complète du module PDR

Ce plan couvre la mise a niveau du module Pièces de Rechange avec familles, statuts, gestion avancée des stocks, mouvements, fournisseurs, historique de consommation et vues d'analyse.

---

## 1. Base de données (migrations SQL)

### Table `pdr_families`
Familles et sous-familles de PDR avec héritage de propriétés.

```text
pdr_families
├── id (uuid PK)
├── name (text NOT NULL)
├── description (text)
├── parent_id (uuid FK → pdr_families)
├── approvisionnement (enum: local, importation, mixte) DEFAULT 'local'
├── statut_default (enum: strategique, commune) DEFAULT 'commune'
├── is_active (boolean DEFAULT true)
├── created_at, updated_at
```

### Colonnes ajoutées sur `pdr`
- `family_id` (uuid FK → pdr_families)
- `statut_pdr` (enum: strategique, commune) DEFAULT 'commune'
- `approvisionnement` (enum: local, importation, mixte) DEFAULT 'local'
- `stock_max` (integer DEFAULT 0)
- `stock_securite` (integer DEFAULT 0)
- `point_commande` (integer DEFAULT 0)
- `delai_approvisionnement` (integer DEFAULT 0, en jours)
- `pmp` (numeric DEFAULT 0, prix moyen pondéré en DA)
- `devise` (text DEFAULT 'DA')

### Table `pdr_suppliers` (fournisseurs liés)
```text
pdr_suppliers
├── id (uuid PK)
├── pdr_id (uuid FK → pdr)
├── nom (text NOT NULL)
├── reference_fournisseur (text)
├── prix (numeric)
├── delai_jours (integer)
├── is_principal (boolean DEFAULT false)
├── contact (text)
├── notes (text)
├── created_at
```

### Table `pdr_stock_movements` (traçabilité mouvements)
```text
pdr_stock_movements
├── id (uuid PK)
├── pdr_id (uuid FK → pdr)
├── type (enum: entree, sortie, correction, inventaire)
├── quantite (integer NOT NULL)
├── stock_avant (integer)
├── stock_apres (integer)
├── prix_unitaire (numeric)
├── reference_source (text) -- ex: ticket ID, plan préventif ID
├── source_type (text) -- ticket, preventif, intervention, manuel
├── source_id (uuid)
├── motif (text)
├── user_id (uuid)
├── created_at
```

### Table `pdr_machines` (lien PDR ↔ machines ciblées pour stratégiques)
Table `machine_pdr` existe deja. On la reutilise. On ajoute `equipement_id` optionnel pour aussi lier aux equipements.

### RLS
- Toutes les nouvelles tables : SELECT pour authenticated, ALL pour admin/resp_maintenance/gestionnaire_magasin
- `pdr_stock_movements` : INSERT pour authenticated (traçabilité), SELECT pour authenticated, pas de UPDATE/DELETE

---

## 2. Écrans UI

### 2.1 Administration des familles PDR
Nouvelle page `src/pages/parametres/PdrFamiliesAdmin.tsx` (meme pattern que `FamillesAdmin.tsx`) :
- CRUD familles/sous-familles
- Champs : nom, description, parent, approvisionnement par defaut, statut par defaut
- Route : `/parametres/familles-pdr`
- Ajout dans `Parametres.tsx` et `App.tsx`

### 2.2 Liste PDR enrichie (`PdrList.tsx`)
- Ajout colonnes : Famille, Statut (badge strategique/commune), Approvisionnement
- Filtres avancés : par famille, statut, approvisionnement, stock critique/rupture
- Badges visuels : stock critique (rouge), stock securite (orange), rupture (rouge clignotant)
- Indicateurs en haut : total refs, stock critique, pièces dormantes, valeur totale stock
- Le bouton "Ajouter" ouvre un formulaire/page de création

### 2.3 Formulaire création PDR (`PdrForm.tsx`)
Nouvelle page pour créer/modifier une PDR avec tous les nouveaux champs.

### 2.4 Detail PDR enrichi (`PdrDetail.tsx`)
Tabs existants (Info, Photos, Documents) + nouveaux :
- **Stock** : stock actuel/min/max/securite/point de commande, delai appro, alertes visuelles
- **Fournisseurs** : liste des fournisseurs liés, CRUD inline
- **Machines** : machines/equipements liés (pour strategiques, obligatoire)
- **Mouvements** : historique des mouvements de stock avec filtres
- **Consommation** : historique agrege depuis intervention_pdr + tickets + plans preventifs
- **Analyse** : mini-dashboard (cout total, frequence conso, PMP evolution)

Héritage intelligent : quand on selectionne une famille, les champs approvisionnement et statut sont pre-remplis mais modifiables.

### 2.5 Vues d'analyse PDR
Ajout d'un onglet ou section dans `AnalyticsPage.tsx` :
- Pièces les plus consommées (bar chart)
- Pièces les plus coûteuses (bar chart)
- Coût PDR par machine (bar chart)
- Pièces dormantes (table)
- Criticité stock (jauge / indicateurs)

---

## 3. Logique métier

### PMP (Prix Moyen Pondéré)
Lors de chaque entrée en stock avec prix :
```
nouveau_pmp = (stock_avant × ancien_pmp + quantite × prix_entree) / (stock_avant + quantite)
```
Calculé coté client lors de l'enregistrement du mouvement.

### Alertes stock
- `stock_actuel <= stock_min` → critique (rouge)
- `stock_actuel <= stock_securite` → alerte (orange)  
- `stock_actuel <= point_commande` → à commander (bleu)
- `stock_actuel == 0` → rupture

### Validation stratégique
- Si `statut_pdr = 'strategique'`, au moins une machine doit être liée
- Empêché en front + message d'erreur

### Mouvements de stock
Chaque modification de `stock_actuel` (depuis tickets, préventif, ou manuellement) crée automatiquement une ligne dans `pdr_stock_movements`.

---

## 4. Fichiers à créer/modifier

### Nouveaux fichiers
- `supabase/migrations/xxx_pdr_enhancement.sql` (schema complet)
- `src/pages/parametres/PdrFamiliesAdmin.tsx`
- `src/pages/PdrForm.tsx`

### Fichiers modifiés
- `src/pages/PdrList.tsx` (filtres, colonnes, KPI)
- `src/pages/PdrDetail.tsx` (tabs enrichis, fournisseurs, mouvements, machines, analyse)
- `src/pages/Parametres.tsx` (ajout lien familles PDR)
- `src/App.tsx` (routes)
- `src/pages/AnalyticsPage.tsx` (section PDR)
- `src/pages/TicketDetail.tsx` (enregistrer mouvement stock lors consommation PDR)

---

## 5. Ordre d'implémentation

1. Migration SQL (tables, enums, colonnes, RLS)
2. Page admin familles PDR
3. Formulaire création PDR
4. Liste PDR enrichie avec filtres
5. Detail PDR avec tous les nouveaux onglets
6. Intégration mouvements dans tickets/preventif
7. Vues d'analyse PDR

