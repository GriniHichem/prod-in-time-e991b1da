
# Recherche Avancée — Moteur de recherche global

## Constat actuel
Chaque liste a sa propre recherche locale (filtre côté client sur `code` + `designation`). Aucune recherche globale, aucune indexation plein-texte (FTS), aucune recherche dans : commentaires, notes d'intervention, journaux audit, notifications, rapports analytiques, mouvements PDR, OF, validations, etc. Les utilisateurs ne peuvent pas trouver "ce ticket que j'ai vu la semaine dernière" sans naviguer module par module.

## Objectif
Une seule barre de recherche, accessible partout (raccourci `⌘K` / `Ctrl+K`), capable de :
- chercher par mot-clé dans **tous les modules** (machines, équipements, organes, lignes, PDR, tickets, interventions, OF, produits, articles, recettes, consommations, arrêts, préventif, utilisateurs, validations, notifications, audit, documents),
- chercher dans le **contenu libre** (notes, descriptions, motifs, commentaires fournisseurs, raisons d'audit),
- chercher **dans les rapports** (KPI exportés, journaux d'intervention, libellés audit),
- proposer des **résultats groupés par module** avec aperçu, score de pertinence, badges (statut, criticité), et navigation directe vers la fiche.

## Architecture cible

```text
┌──────────────────────────────────────────────────┐
│  TopBar  [ 🔍 Rechercher partout…  ⌘K ]          │
└──────────────┬───────────────────────────────────┘
               │ (ouvre)
        ┌──────▼──────────────────────────┐
        │ CommandPalette (Dialog)         │
        │  • résultats live (debounce)    │
        │  • groupés par module           │
        │  • "Voir tous les résultats →"  │
        └──────┬──────────────────────────┘
               │
        ┌──────▼──────────────────────────┐
        │  /recherche?q=…&modules=…&…     │
        │   page complète + facettes      │
        └─────────────────────────────────┘
```

Backend = vue PostgreSQL `search_index` matérialisée logiquement (UNION ALL) + colonnes `tsvector` + RPC `global_search(q, modules[], filters)` qui :
1. Tokenise la requête (FTS français + trigram fallback pour fautes de frappe),
2. Filtre par module / date / statut / criticité,
3. Respecte les RLS (fonction `SECURITY INVOKER` → l'utilisateur ne voit que ce qu'il peut voir),
4. Renvoie : `module, entity_id, code, label, snippet (extrait surligné), score, severity, url, updated_at`.

## Phases

### Phase 1 — Infra recherche (DB)
- Activer extensions `pg_trgm` (déjà active) et `unaccent`.
- Ajouter colonnes `search_vector tsvector` + index GIN sur tables principales : `machines, equipements, organes, lignes, pdr, tickets, interventions, ordres_fabrication, products, articles, recipes, consumptions, arrets, preventif_plans, notifications, audit_logs, validation_requests, entity_documents, pdr_stock_movements, pdr_family_suppliers`.
- Triggers `tsvector_update` (config `french` + unaccent) sur INSERT/UPDATE rebuilding depuis `code, designation, description, notes, motif, ...`.
- Backfill une fois pour les lignes existantes.
- RPC `public.global_search(q text, modules text[] default null, date_from date default null, date_to date default null, severities text[] default null, limit_per_module int default 10)` :
  - utilise `plainto_tsquery` + fallback `similarity()` ≥ 0.25 si <3 résultats,
  - `ts_headline()` pour le snippet surligné,
  - `SECURITY INVOKER` → RLS appliquée naturellement,
  - tri : `ts_rank * recency_boost`.
- RPC `public.search_suggest(q text)` pour autocomplete (top 8 codes/désignations/numéros).

### Phase 2 — Hook + couche client
- `src/lib/search.ts` : `globalSearch()`, `searchSuggest()`, parsing requêtes avancées (`module:tickets statut:ouvert criticité:A "fuite huile"`).
- `src/hooks/useGlobalSearch.ts` : `useQuery` avec debounce 250 ms, cache 30 s, abort sur changement.
- Catalogue `src/lib/searchCatalog.ts` : mapping module → icône, route, formateur de snippet, badges affichés.

### Phase 3 — UI Command Palette (omnisearch)
- `src/components/search/GlobalSearchPalette.tsx` basé sur `cmdk` (déjà inclus via shadcn `Command`).
- Raccourci global `⌘K` / `Ctrl+K` + `/` (monté dans `App.tsx`).
- Bouton 🔍 dans la `TopBar` (header), visible mobile + desktop.
- Affichage : groupes par module, snippet surligné, badge statut, date relative, sous-texte "Entrer pour ouvrir / ⇧ Entrer pour ouvrir dans un onglet".
- Historique des recherches récentes (`localStorage`, 8 dernières).

### Phase 4 — Page /recherche (résultats complets + facettes)
- `src/pages/SearchPage.tsx` :
  - Barre principale avec opérateurs supportés affichés en astuce,
  - Sidebar de **facettes** : Modules, Période (Aujourd'hui/7j/30j/Custom), Statuts, Criticité, Auteur, Tags,
  - Résultats : tableau riche groupé (onglets par module + onglet "Tous"),
  - Pagination par module (`limit_per_module` + "Voir plus dans Tickets →"),
  - Export CSV des résultats (`/mnt/documents/recherche_export_*.csv`),
  - URL synchronisée (`?q=&modules=&from=&to=&sev=`) partageable.

### Phase 5 — Recherche dans les rapports
- Module "Rapports" indexé : libellés audit (`action_label, description, entity_label`), KPI snapshots, journaux d'intervention.
- Vue `report_search_view` qui agrège : audit_logs (filtré par `has_audit_access`), interventions clôturées (avec extraits notes), OF terminés.
- Résultat affiché avec badge "Rapport" + lien direct vers `/audit?id=…` ou `/maintenance/journal?intervention=…`.

### Phase 6 — Qualité & sécurité
- Tests Vitest : tokenisation, opérateurs (`module:`, `statut:`, `"phrase exacte"`, `-exclusion`), parsing dates, fallback trigram.
- Audit log automatique (`logAudit('search.executed', {q, modules, count})`) — sans stocker la requête en clair pour l'admin si elle contient des données sensibles (anonymisation > 100 chars).
- Respect strict RLS via `SECURITY INVOKER`.
- Limitation : 50 résultats / module / requête, requêtes < 200 chars, debounce serveur via `pg_sleep`-free.

## Détails techniques

**Opérateurs supportés**
- `mot1 mot2` → AND
- `"phrase exacte"` → match phrase
- `-mot` → exclusion
- `module:tickets` / `module:pdr,machines`
- `statut:ouvert` `crit:A` `priorité:haute`
- `from:2026-01-01 to:2026-04-30`
- `auteur:jdupont` `numero:TKT-00123`

**Pertinence**
```
score = ts_rank_cd(search_vector, query)
      * (1 + 0.3 * is_exact_code_match)
      * recency_decay(updated_at)   -- 1.0 < 7j, 0.7 < 30j, 0.4 sinon
      + 0.2 * trigram_similarity    -- fallback fautes de frappe
```

**Snippet** : `ts_headline('french', source_text, query, 'StartSel=<mark>,StopSel=</mark>,MaxWords=20,MinWords=8')`.

## Fichiers prévus

**Migrations SQL**
- `add_search_vectors_<entities>.sql` (colonnes + index GIN + triggers, par lot pour rester < 60 s)
- `create_global_search_rpc.sql`
- `create_report_search_view.sql`

**Code**
- `src/lib/search.ts`, `src/lib/searchCatalog.ts`, `src/lib/searchQueryParser.ts`
- `src/hooks/useGlobalSearch.ts`, `src/hooks/useSearchSuggest.ts`
- `src/components/search/GlobalSearchPalette.tsx`
- `src/components/search/SearchResultItem.tsx`
- `src/components/search/SearchFacets.tsx`
- `src/components/search/SearchTrigger.tsx` (bouton TopBar)
- `src/pages/SearchPage.tsx`
- Modifs : `src/App.tsx` (route + raccourci global), `src/components/gmao/AppSidebar.tsx` (entrée "Recherche"), header layout.

**Tests**
- `src/test/search/query-parser.test.ts`
- `src/test/search/catalog.test.ts`
- `src/test/search/rank-scoring.test.ts`

## Mémoire à enregistrer après implémentation
- Convention : toute nouvelle table indexable doit ajouter `search_vector` + trigger + entrée dans `searchCatalog.ts`.
- Raccourci global `⌘K` réservé à la palette de recherche.

## Hors-scope (proposable plus tard)
- Recherche sémantique (embeddings via Lovable AI),
- Recherche dans le contenu OCR des PDF (Storage),
- "Recherches sauvegardées" + alertes par email quand un nouveau résultat matche.
