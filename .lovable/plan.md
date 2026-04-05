

## Plan: Enrichir le module Maintenance Préventive + liens transverses

### 1. Filtre par ligne dans PreventifList

**Fichier:** `src/pages/PreventifList.tsx`

- Ajouter un state `filterLine` et charger les `production_lines` actives au mount
- Ajouter un `<Select>` "Ligne" dans la barre de filtres
- Quand une ligne est sélectionnée :
  - Filtrer les plans qui ont `line_id === filterLine`
  - Aussi charger les `machine_line_assignments` pour cette ligne et filtrer les plans dont la `machine_id` est assignée à cette ligne (même si `line_id` n'est pas renseigné sur le plan)
  - Réduire le filtre Machine aux seules machines de cette ligne
- Quand une ligne est sélectionnée, afficher sous la table un résumé contextuel : nombre de machines et équipements rattachés à cette ligne (via `machine_line_assignments` + `equipements`)

### 2. Filtre par fréquence

- Ajouter un filtre `filterFrequence` (quotidien, hebdomadaire, mensuel, etc.) pour affiner davantage la recherche

### 3. Recherche textuelle

- Ajouter un champ de recherche pour filtrer par titre du plan ou code/désignation de la machine

### 4. KPIs contextuels en haut de page

- Afficher des mini-KPIs contextuels qui se mettent à jour selon les filtres actifs :
  - Plans validés / En retard / Brouillons / Suspendus (compteurs)
  - Taux d'exécution sur la période (si on ajoute un filtre date optionnel)

### 5. Liens transverses avec les autres modules

**a) Depuis MachineDetail** (`src/pages/MachineDetail.tsx`)
- Dans l'onglet "Preventif", ajouter un bouton "Voir tous les plans de cette ligne" qui navigue vers `/preventif?line=<lineId>` (le filtre ligne sera pré-rempli)

**b) Depuis LineSynoptic** (`src/pages/LineSynoptic.tsx`)
- Ajouter un bouton/lien "Plans préventifs" dans le header qui navigue vers `/preventif?line=<lineId>`

**c) Depuis LinesList** (`src/pages/LinesList.tsx`)
- Ajouter une colonne ou un bouton d'action "Préventif" qui navigue vers `/preventif?line=<lineId>`

**d) PreventifList : lire les query params**
- Au mount, lire `?line=<id>` et `?machine=<id>` depuis l'URL pour pré-remplir les filtres correspondants

### Fichiers modifiés

| Fichier | Changement |
|---|---|
| `src/pages/PreventifList.tsx` | Filtres ligne/fréquence/recherche, KPIs, lecture query params |
| `src/pages/MachineDetail.tsx` | Bouton "Plans préventifs de la ligne" |
| `src/pages/LineSynoptic.tsx` | Lien vers préventif filtré par ligne |
| `src/pages/LinesList.tsx` | Action "Préventif" par ligne |

### UX
- Les filtres sont cumulatifs (ligne + machine + statut + fréquence + recherche)
- Sélectionner une ligne restreint automatiquement le dropdown machine aux machines de cette ligne
- Les KPIs se mettent à jour dynamiquement selon les filtres actifs
- Navigation fluide entre modules avec pré-remplissage des filtres via query params

