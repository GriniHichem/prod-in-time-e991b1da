# Organisation de la section Gestion de stock PDR

## Objectif
Créer une catégorie dédiée **« Stock PDR »** dans la page Applications (et un groupe correspondant dans la barre latérale), y regrouper les modules liés au magasin/pièces, et ajouter une nouvelle page **Journal Stock** listant tous les mouvements de stock.

## Modules de la section « Stock PDR »
| Module | Destination | Statut |
|---|---|---|
| Dashboard PDR | `/magasin/shift` (tableau de bord supervision magasin existant) | déplacé |
| Shift Magasin | `/magasin/shift/live` (espace magasinier / kiosque) | déplacé |
| Journal Stock | `/magasin/journal` (nouvelle page) | **nouveau** |
| Pièces de rechange | `/pdr` | déplacé depuis Maintenance |
| Demandes pièces | `/pdr/demandes` | déplacé depuis Maintenance |

> Note : aujourd'hui « Shift Magasin » et le dashboard partagent `/magasin/shift` (les magasiniers sont redirigés vers le kiosque, les responsables voient le dashboard). On distingue désormais clairement : **Dashboard PDR** → vue supervision, **Shift Magasin** → kiosque magasinier `/magasin/shift/live`.

## Changements

### 1. Nouvelle page « Journal Stock »
- Fichier `src/pages/magasin/MagasinJournal.tsx`.
- Réutilise le hook `useMagasinActivity` (table `pdr_stock_movements`, déjà enrichi : pièce, agent, ticket lié, motif, stock avant/après, prix).
- Tableau des mouvements avec :
  - Filtres : type (entrée / sortie / correction / inventaire), période (aujourd'hui / 7j / 30j / tout), recherche (référence, désignation, agent).
  - Bouton reset (RotateCcw) conforme à la convention UI projet.
  - Export CSV via `ExportCsvButton`.
- Route ajoutée dans `src/App.tsx` : `/magasin/journal` (dans `AppLayout`, route protégée standard).

### 2. Page Applications (`src/pages/Apps.tsx`)
- Ajouter `"Stock PDR"` au type `AppModule["category"]`, à la liste `CATEGORIES` et à `CATEGORY_ICONS` (icône `IconSpare`).
- Repositionner les modules `pdr`, `pdr_demandes`, et magasin dans la catégorie `"Stock PDR"`.
- Ajouter les cartes **Dashboard PDR** (`/magasin/shift`) et **Journal Stock** (`/magasin/journal`).
- Accents de couleur cohérents (gamme purple/violet déjà utilisée pour le magasin).

### 3. Barre latérale (`src/components/gmao/AppSidebar.tsx`)
- Extraire les items `pdr`, `pdr_demandes`, `shift_magasin` du groupe Maintenance.
- Créer un tableau `stockItems` et un nouveau groupe **« Stock PDR »** (icône `IconSpare`) avec : Dashboard PDR, Shift Magasin, Journal Stock, Pièces (PDR), Demandes pièces.
- Gérer visibilité/état actif comme les autres groupes (`visibleStock`, `isStockActive`, `showStock`).

### 4. Permissions
- Nouveau module de permission `journal_stock`.
- L'ajouter dans `src/pages/parametres/RolesMatrix.tsx` (libellé « Journal Stock », groupe magasin `LOG_MODS`) et l'attribuer en lecture aux rôles `gestionnaire_magasin` et `responsable_magasin`.
- La nouvelle carte / item sidebar utilise `permissionModule: "journal_stock"`.

## Hors périmètre
- Aucune modification de la logique de stock, des mouvements, ou du circuit de demandes.
- Aucune migration base de données (la table `pdr_stock_movements` et le hook existent déjà).
- Le kiosque plein écran (`MagasinKiosk`) reste inchangé.
