## Objectif

Remplacer le placeholder `/qualite/of` par une vraie page de pilotage qualité des OF. Toute la logique backend existe déjà (`quality_status`, RPC `get_quality_indicators_for_of`, `quality_checks`, `set_of_quality_status`) et le composant `OfQualityTab` est déjà fonctionnel dans le détail OF — il s'agit donc juste de construire la vue liste.

## Changements

**1 fichier réécrit : `src/pages/qualite/QualiteOf.tsx`**

Liste de tous les OF avec focus qualité, alignée sur le style des autres pages Qualité (Matte Ceramic, IBM Plex Sans, 48px targets).

### Contenu de la page

- **Header** : titre « OF Qualité » + sous-titre, bouton export CSV.
- **KPI cards** (4) : Total OF actifs · Conformes · Non conformes/Bloqués · Contrôles manquants (somme sur tous les OF affichés).
- **Filtres** :
  - Recherche (numéro OF / produit / ligne)
  - Statut qualité (Tous / Non démarré / En contrôle / Conforme / Conforme sous réserve / Non conforme / Bloqué / Libéré / Rebuté / À retraiter)
  - Statut production (Tous / Planifié / En cours / Terminé / Annulé)
  - Ligne (toutes lignes actives)
  - Bouton `RotateCcw` Réinitialiser (visible si filtres actifs — convention projet)
- **Tableau** colonnes : N° OF · Produit · Ligne · Statut production · Statut qualité (badge coloré via `QUALITY_STATUS_OPTIONS`) · Contrôles (faits/requis) · Hors tolérance · Dernier contrôle · Action « Ouvrir ».
- **Action Ouvrir** : navigation vers `/gpao/of/:id?tab=quality` (le détail OF embarque déjà `OfQualityTab`).

### Source de données

Un seul `useEffect` qui charge en parallèle :
- `ordres_fabrication` : `id, numero, statut, quality_status, product_id, line_id, products(code, designation), lignes(code, name)`
- Pour chaque OF visible (batch) : RPC `get_quality_indicators_for_of` + `quality_checks` (par lot via `.in('of_id', ids)`) pour calculer `computeQualityKpis` réutilisé depuis `OfQualityTab`.

Pour éviter N appels RPC, on charge `quality_checks` en une requête (`.in('of_id', ids)`) puis on ne calcule que `performed`/`outOfTolerance` côté liste. Le détail complet reste dans `OfQualityTab` quand l'utilisateur ouvre l'OF — pas de duplication de logique lourde.

### Permissions

Lecture pour tout porteur de la permission `qualite` (déjà gérée par `ShiftGuard`/RBAC du module). Aucune mutation depuis la liste (les changements de statut se font dans le détail).

### Hors scope

- Pas de nouvelle migration (backend déjà prêt).
- Pas de modif de `OfQualityTab` ni du détail OF.
- Pas de modif du sidebar ni de la route (déjà déclarés).
- Pas de modification du `MANUAL.md`.

## Détails techniques

- Réutiliser `QUALITY_STATUS_OPTIONS`, `qualityStatusLabel`, `computeQualityKpis` exportés de `OfQualityTab.tsx`.
- Réutiliser `ExportCsvButton` pour l'export.
- Convention Radix : valeurs Select `__none__` pour « Tous » (déjà appliquée ailleurs).
- Couleurs strictement via tokens sémantiques (pas de couleur hardcodée).
- Statut prod via `StatusBadge` existant si compatible, sinon Badge inline (à vérifier au moment de coder).
- Pas de couplage à `ordres_fabrication.statut` non-actif : on affiche tout par défaut, le filtre permet de masquer Annulé/Terminé.

## Critère d'acceptation

- `/qualite/of` affiche la liste réelle des OF avec leur état qualité, filtres opérationnels, KPI cohérents.
- Clic sur « Ouvrir » mène au détail OF côté GPAO sur l'onglet Qualité.
- Aucun bug TypeScript, aucun changement de comportement ailleurs.
