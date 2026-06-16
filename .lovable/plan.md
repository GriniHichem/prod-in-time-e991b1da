# Amélioration des icônes & UI/UX de la page Applications

## Objectif
Chaque module (`/apps`) doit avoir une icône distincte et cohérente — fini les répétitions — et la grille doit gagner en lisibilité et en finesse visuelle.

## Répétitions actuelles à corriger
- `IconEquipment` → utilisé pour **Équipements** ET **Organes**
- `IconMaintenance` (même tracé qu'Equipment) → **Journal** ET **Historique interventions**
- `IconChart` → **Dashboard Production** ET **Dashboard Qualité**
- `IconOrder` → **Ordres de fabrication** ET **OF Qualité**
- `IconDashboard` → **Tableau de bord** ET **Dashboard Inventaire**
- `IconShift` → **Shift Maintenance** ET **Shift contrôle**
- `IconAnalytics` → **Analyse & KPI** ET **Indicateurs qualité**
- `IconRecipe` → **Recettes/BOM** ET **Recettes & Nomenclatures**
- `ClipboardCheck` → **Contrôles**, **Campagnes inventaire**, **Validations**
- `ShieldCheck` → **Sécurité**, catégorie **Qualité**, **Audit**

## 1. Icônes uniques par module
Attribuer une icône distincte à chacun des ~35 modules en combinant :
- les `IndustrialIcons` existants (style SVG maison, stroke 1.8, cohérent)
- de nouvelles icônes `IndustrialIcons` à ajouter pour combler les manques, dans le même style (ex. `IconOrganes`, `IconJournal`, `IconHistory`, `IconKpi`, `IconControl`, `IconNc`, `IconAction`, `IconTrace`, `IconReport`, `IconInventory`, `IconSecurity`, `IconValidation`, `IconAudit`)
- des icônes `lucide-react` distinctes en dernier recours, sans réemploi croisé

Résultat : 1 icône = 1 module, et les icônes de catégorie (`CATEGORY_ICONS`) ne réutilisent pas une icône déjà prise par un module de la même section.

## 2. Améliorations UI/UX (frontend uniquement)
- **Carte module** : hiérarchie visuelle plus nette — pastille d'icône avec dégradé `accent` conservé mais halo plus doux, titre et description mieux espacés, état `hover`/`focus-visible` accessible (anneau clavier).
- **Accessibilité** : `aria-label` explicite sur chaque bouton de module, focus ring visible, contraste des descriptions.
- **Toolbar** : recherche + filtres catégories — garder, mais améliorer le rendu actif des chips et le compteur.
- **En-têtes de section** : conserver le séparateur, harmoniser l'icône de catégorie avec le nouveau set.
- **Badge "Live"** : légère animation `pulse` discrète pour les modules temps réel.
- **Responsive** : vérifier la grille de 2 (mobile) à 6 colonnes (xl).

## Détails techniques
- Fichiers modifiés :
  - `src/components/icons/IndustrialIcons.tsx` — ajout des nouvelles icônes SVG manquantes (même API `IconProps`).
  - `src/pages/Apps.tsx` — réaffectation des icônes par module + ajustements de classes Tailwind (tokens sémantiques uniquement, aucun `text-white`/couleur en dur ajoutée hors palette `accent` déjà existante).
- Aucune logique métier, permission ou route modifiée.
- Vérification visuelle via preview après implémentation.

## Hors périmètre
- Pas de changement de structure de données `MODULES`, de permissions, ni de navigation.
