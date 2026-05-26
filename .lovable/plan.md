# Manuel interactif intégré — Plan

## Objectif

Transformer `MANUAL.md` (1418 lignes, déjà structuré en 12 chapitres) en un **manuel interactif accessible partout dans l'app**, sans dupliquer le contenu (source unique = `MANUAL.md`).

## Principes

- **Source unique** : `MANUAL.md` reste la vérité. Le manuel UI le lit et le parse, pas de copier-coller.
- **Non bloquant** : ouverture en panneau latéral (Sheet) qui ne masque pas l'app.
- **Contextuel** : chaque route propose un raccourci vers la bonne section du manuel.
- **Rapide** : parsing au build, recherche full-text côté client (le doc fait ~80 Ko, pas besoin de serveur).

## Étape 1 — Pipeline contenu

- Garder `MANUAL.md` comme source. Ajouter `scripts/build-manual.ts` (exécuté via Vite plugin custom ou à la main) qui :
  - Lit `MANUAL.md`, le découpe par `##` (chapitres) et `###` (sections).
  - Génère `src/manual/manual.generated.ts` exportant `MANUAL_SECTIONS: { id, chapter, title, slug, anchor, html, text }[]` + `MANUAL_TOC`.
  - Rend le Markdown via `marked` (déjà léger) + `dompurify` pour sécuriser.
- Mapping **route → section** dans `src/manual/manualRouteMap.ts` (ex: `/machines` → `3.2`, `/gpao/of` → `4.2`, `/parametres/smtp` → `6 bis.2`, etc., dérivé de l'annexe 12.1 du manuel).

## Étape 2 — UI / UX

- **Composant `<ManualSheet />`** : panneau latéral droit (shadcn `Sheet`, largeur 480 px desktop / plein écran mobile), ouverture animée, fermable Échap.
- **Structure interne** :
  - Header : titre courant, breadcrumb chapitre › section, bouton "Voir tout le manuel".
  - `<ManualSearch />` : input avec recherche live (debounce 150 ms) sur titres + contenu.
  - `<ManualToc />` : arbre repliable des 12 chapitres (accordion shadcn).
  - `<ManualArticle />` : rendu HTML stylé (prose Tailwind), table des matières interne ancrée.
- **Charte** : réutilise tokens existants (Matte Ceramic, IBM Plex Sans). Couleurs sémantiques :
  - `primary` pour liens et titres, `accent` pour astuces (`> 💡`), `destructive` pour avertissements (`> ⚠️`).
- **Accès** :
  - Bouton "Aide" (icône `BookOpen`) dans `AppTopBar`, raccourci clavier `?`.
  - Mini bouton flottant contextuel "Aide sur cette page" si la route a un mapping.

## Étape 3 — État & navigation

- Context `ManualProvider` (`src/contexts/ManualContext.tsx`) :
  - `open`, `openManual(sectionId?)`, `close`, `currentSectionId`.
  - Synchronise avec `?manual=<sectionId>` dans l'URL pour permettre les liens directs et le retour.
  - Persiste la dernière section consultée dans `localStorage`.
- Navigation interne via ancres `#section-3-2`, scroll smooth, surlignage temporaire de la section cible.

## Étape 4 — Recherche & performance

- Index recherche : tableau plat `{id, title, text}` chargé en lazy (`React.lazy` sur `ManualSheet`).
- Algorithme : match insensible accents (`String.prototype.normalize('NFD')`), score = titre>texte, top 20 résultats avec extrait surligné.
- Si > 200 ms ressenti plus tard, on pourra basculer sur `minisearch` (mais non requis pour 80 Ko).
- Lazy load du `ManualSheet` (split du bundle principal). Le `manual.generated.ts` reste dans ce chunk séparé.
- Pas d'images/vidéos pour l'instant (le manuel est texte) → lazy loading non nécessaire en v1.

## Étape 5 — Tests & qualité

- `src/test/manual/manual-parser.test.ts` : parsing de quelques chapitres, slugs stables, ancres correctes.
- `src/test/manual/manual-search.test.ts` : recherche accent-insensible, scoring.
- `src/test/manual/manual-route-map.test.ts` : chaque entrée du mapping pointe vers une section existante.
- Vérif manuelle : ouverture depuis 5 pages clés (Machines, OF, Tickets, SMTP, Shifts).

## Étape 6 — Mémoire & docs

- Ajouter mémoire `mem://features/interactive-manual` (source = MANUAL.md, route map, raccourci `?`).
- Mettre à jour l'index mémoire.

## Détails techniques

### Fichiers créés
- `scripts/build-manual.ts` — parseur MD → TS
- `src/manual/manual.generated.ts` — données (générées, en repo pour simplicité)
- `src/manual/manualRouteMap.ts`
- `src/contexts/ManualContext.tsx`
- `src/components/manual/ManualSheet.tsx`
- `src/components/manual/ManualSearch.tsx`
- `src/components/manual/ManualToc.tsx`
- `src/components/manual/ManualArticle.tsx`
- `src/components/manual/HelpButton.tsx` (bouton topbar + flottant)
- Tests sous `src/test/manual/`

### Fichiers modifiés
- `src/App.tsx` — wrap avec `ManualProvider`, raccourci `?`
- `src/components/gmao/AppTopBar.tsx` — bouton aide
- `package.json` — script `build:manual`, deps `marked` + `dompurify` (légères)

### Hors scope v1
- Mise en surbrillance d'éléments UI depuis le manuel (étape 4 du brief original) — nécessite des `data-manual-target` partout, à faire en v2.
- Analytics de consultation — à brancher plus tard sur la table `audit_logs` existante si besoin.
- Édition du manuel depuis l'app — `MANUAL.md` reste édité en repo.

## Livrable

Bouton "Aide" partout, panneau latéral avec recherche live et table des matières, sections accessibles en 1 clic depuis n'importe quelle page mappée, sans recharger.
