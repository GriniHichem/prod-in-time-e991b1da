# Personnalisation du tableau Pièces de Rechange

## Objectif
Dans la liste **Pièces de Rechange** (`/pdr`) :
1. Afficher **Famille** et **Sous-famille** comme colonnes par défaut.
2. Ajouter un **sélecteur de colonnes** simple pour afficher/masquer d'autres champs déjà présents sur la pièce. Le choix est mémorisé sur l'appareil (localStorage).

## 1. Famille / Sous-famille
La hiérarchie est portée par `pdr_families.parent_id` : la pièce pointe vers `family_id` (le niveau le plus fin).
- Si la famille a un parent → **Famille** = parent, **Sous-famille** = famille de la pièce.
- Si la famille n'a pas de parent → **Famille** = famille de la pièce, **Sous-famille** = «—».

Le chargement récupère déjà toutes les familles ; on construit une petite map `id → {name, parent_id}` pour résoudre les deux niveaux sans requête supplémentaire. La colonne unique « Famille » actuelle est remplacée par deux colonnes **Famille** et **Sous-famille** (visibles par défaut).

## 2. Sélecteur de colonnes
Un bouton **« Colonnes »** (icône réglages) à côté de Export CSV ouvre un menu (Popover + cases à cocher) listant toutes les colonnes optionnelles. Cocher/décocher affiche/masque la colonne instantanément. Un bouton « Réinitialiser » remet l'affichage par défaut.

Colonnes gérées :
- **Toujours visibles** (non désactivables) : miniature, Référence, Désignation, Stock, Niveau.
- **Visibles par défaut, désactivables** : Famille, Sous-famille, Statut, PMP (DA), Appro.
- **Masquées par défaut, activables** : Stock min, Stock max, Stock sécurité, Point de commande, Fournisseur, Emplacement, Code ERP, Code-barres, Durée de vie (min/max).

Le tableau (en-têtes + cellules) est rendu dynamiquement à partir de la configuration des colonnes pour rester maintenable. L'export CSV exporte les colonnes actuellement visibles (en plus des champs clés).

## Détails techniques
- Fichier modifié : `src/pages/PdrList.tsx`.
- Définition d'un tableau `COLUMN_DEFS` : `{ key, label, defaultVisible, alwaysOn?, render(p, ctx), className? }`.
- État `visibleCols` (Set des clés) initialisé depuis `localStorage["pdr_list_columns"]` ou les valeurs par défaut ; persistance via `useEffect`.
- Header et lignes générés via `.map` sur les colonnes actives ; `colSpan` de l'état vide calculé dynamiquement.
- Résolution famille/sous-famille via une map mémoïsée des familles ; aucune migration ni changement backend.
- Aucune dépendance nouvelle (Popover, Checkbox, Button déjà disponibles dans shadcn).
