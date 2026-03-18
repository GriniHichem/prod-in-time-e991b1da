

# Plan : Configuration avancée Produits/Articles + Adaptation complète de l'application

## Vue d'ensemble

Enrichir le schema produits/articles, ajouter familles produits, conditionnement multi-niveaux, liaison lignes-produits, import CSV, puis **adapter tous les dashboards, analytics et KPI** pour exploiter ces nouvelles données.

---

## 1. Migrations SQL

### Migration A : Familles produits + colonnes enrichies + conditionnement + liaison lignes

```sql
-- Familles produits (hiérarchiques)
CREATE TABLE IF NOT EXISTS public.product_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  parent_id uuid REFERENCES public.product_families(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enrichir products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.product_families(id),
  ADD COLUMN IF NOT EXISTS code_erp text DEFAULT '',
  ADD COLUMN IF NOT EXISTS poids_unitaire numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unite_base text DEFAULT 'kg';

-- Enrichir articles
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.product_families(id),
  ADD COLUMN IF NOT EXISTS code_erp text DEFAULT '';

-- Niveaux de conditionnement
CREATE TABLE IF NOT EXISTS public.packaging_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('product','article')),
  entity_id uuid NOT NULL,
  level_order integer NOT NULL DEFAULT 0,
  unite_name text NOT NULL,
  coefficient numeric NOT NULL DEFAULT 1,
  poids numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Liaison lignes ↔ produits
CREATE TABLE IF NOT EXISTS public.line_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id uuid NOT NULL REFERENCES public.production_lines(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(line_id, product_id)
);

-- RLS pour toutes les nouvelles tables (viewable by authenticated, manageable by admin/resp_production)
-- + updated_at trigger sur product_families
```

---

## 2. Fichiers a creer

| Fichier | Role |
|---|---|
| `src/pages/gpao/ProductDetail.tsx` | Fiche produit : infos enrichies (famille, code ERP, poids, unite), onglet conditionnement (PackagingConfig), onglet lignes autorisees, images |
| `src/pages/gpao/ArticleDetail.tsx` | Fiche article : infos enrichies, onglet conditionnement, images |
| `src/components/gpao/CsvImporter.tsx` | Composant generique : upload CSV, parsing PapaParse, mapping colonnes, validation, preview, upsert par code |
| `src/components/gpao/PackagingConfig.tsx` | Gestion des niveaux de conditionnement avec calcul auto des poids cumules |
| `src/pages/parametres/ProductFamiliesAdmin.tsx` | CRUD familles produits (arbre parent/enfant) |

---

## 3. Fichiers a modifier

### 3.1 Pages produits/articles (CRUD complet)

- **`ProductsList.tsx`** : Ajouter dialog creation/edition avec champs enrichis (famille, code ERP, poids, unite_base), bouton Import CSV, colonnes famille/code ERP dans le tableau, navigation vers `/gpao/produits/:id`
- **`ArticlesList.tsx`** : Meme enrichissement, dialog creation/edition, Import CSV, navigation vers `/gpao/articles/:id`

### 3.2 Liaison lignes-produits

- **`LignesAdmin.tsx`** : Ajouter section/dialog pour associer des produits autorises a chaque ligne (multi-select depuis `products`)

### 3.3 Filtrage OF par ligne

- **`OfList.tsx`** : Quand `newLineId` change, charger `line_products` pour cette ligne. Si des produits sont lies, filtrer le select produit. Sinon, afficher tous les produits (retrocompatibilite).

### 3.4 Routes

- **`App.tsx`** : Ajouter `/gpao/produits/:id`, `/gpao/articles/:id`, `/parametres/familles-produits`

### 3.5 Parametres

- **`Parametres.tsx`** : Ajouter carte "Familles produits" dans la grille

---

## 4. Adaptation des Dashboards, Analytics et KPI

C'est la partie critique demandee. Voici toutes les adaptations :

### 4.1 Dashboard GPAO (`GpaoDashboard.tsx`)

- **Nouveau KPI** : "Familles produits actives" (count distinct families des OFs en cours)
- **Enrichir le KPI "Produits"** : afficher le nombre par famille
- **Production par famille** : nouveau graphique bar chart groupant la production par `product_families.name`
- **Rendement par produit** : nouveau graphique dans les OF recents montrant le rendement par produit individuel
- **Alertes stock** : enrichir avec code ERP dans le detail

### 4.2 Page Analytics (`AnalyticsPage.tsx`)

- **Onglet Production** : 
  - Nouveau graphique "Rendement par famille produit" (bar chart)
  - Nouveau graphique "Production par produit (Top 10)" avec poids unitaire comme reference
  - Enrichir "Rendement par ligne" avec info produits autorises
- **Onglet Consommation** :
  - Afficher code ERP des articles dans les ecarts
  - Nouveau graphique "Consommation par famille article"
- **Onglet Tendances** :
  - Nouveau TrendChart "Production par famille" (evolution temporelle)
  - Nouveau TrendChart "Rendement par produit" sur la periode
- **Nouveaux KPI** :
  - "Produits actifs" avec variation
  - "Nb familles" 
  - "Poids moyen par OF" (utilisant poids_unitaire)

### 4.3 Dashboard GMAO (`Dashboard.tsx`)

- Pas de changement majeur (maintenance-focused), mais enrichir les tickets avec info produit de l'OF lie quand `of_id` est present

### 4.4 Donnees chargees

Dans `AnalyticsPage.tsx` et `GpaoDashboard.tsx`, ajouter au `Promise.all` :
- `supabase.from("product_families").select("*")`
- `supabase.from("line_products").select("*, products(code, designation)")`
- Enrichir la query `products` avec `product_families(name)`
- Enrichir la query `articles` avec `product_families(name)`

---

## 5. Import CSV -- Logique detaillee

Le composant `CsvImporter` accepte :
```typescript
interface CsvImporterProps {
  tableName: string;
  fields: { key: string; label: string; required?: boolean }[];
  uniqueKey: string; // ex: "code"
  onComplete: () => void;
}
```

Flux : Upload → Parse (PapaParse) → Mapping colonnes (drag/select) → Validation (champs requis, types) → Preview 10 lignes → Upsert via Supabase `.upsert()` avec `onConflict: uniqueKey`

---

## 6. Conditionnement -- Calcul automatique

Le composant `PackagingConfig` affiche les niveaux ordonnes et calcule automatiquement :

```
Niveau 0 : Unite de base (ex: 0.5 kg)
Niveau 1 : Boite = 0.5 kg (coefficient 1)
Niveau 2 : Carton = 24 boites = 12 kg
Niveau 3 : Palette = 110 cartons = 1320 kg
```

Formule : `poids_niveau_N = coefficient_N * poids_niveau_(N-1)`

Ces donnees de conditionnement seront aussi exploitees dans les analytics pour convertir les quantites produites en unites logistiques (palettes, cartons) dans les KPI.

---

## 7. Resume des taches

1. Executer la migration SQL (product_families, colonnes enrichies, packaging_levels, line_products + RLS)
2. Creer `ProductFamiliesAdmin` + carte dans Parametres
3. Enrichir `ProductsList` et `ArticlesList` avec CRUD complet + champs enrichis
4. Creer `ProductDetail` et `ArticleDetail` avec onglets
5. Creer `PackagingConfig` pour les niveaux de conditionnement
6. Creer `CsvImporter` generique + integrer dans les listes produits/articles
7. Ajouter gestion ligne ↔ produits dans `LignesAdmin`
8. Modifier `OfList` pour filtrer produits par ligne
9. **Adapter `GpaoDashboard`** : nouveaux KPI famille, graphiques par famille/produit
10. **Adapter `AnalyticsPage`** : nouveaux graphiques par famille, par produit, enrichir consommation, tendances
11. **Adapter `Dashboard` GMAO** : enrichir tickets avec info produit OF
12. Ajouter toutes les nouvelles routes dans `App.tsx`

