# Onglet Qualité dans le détail OF

## Objectif
Afficher dans `/gpao/of/:id` un nouvel onglet "Qualité" qui consolide les indicateurs attendus, les contrôles réalisés/manquants/hors tolérance, sans jamais bloquer la production.

## 1. Migration DB (additive, non-bloquante)

Nouvelle migration SQL :

- Création de l'enum `of_quality_status` :
  - `non_demarre`, `en_controle`, `conforme`, `conforme_sous_reserve`, `non_conforme`, `bloque`, `libere`, `rebute`, `a_retraiter`
- `ALTER TABLE ordres_fabrication ADD COLUMN quality_status of_quality_status NULL` (nullable, défaut NULL → équivaut à `non_demarre` côté UI)
- Aucun trigger bloquant, aucune contrainte croisée avec `statut` (statut production) → les OF existants restent compatibles.
- RLS inchangée (UPDATE déjà autorisée pour admin/resp_production/chef_ligne, on ajoutera `controleur_qualite` via une policy UPDATE additionnelle limitée à la colonne `quality_status` via une fonction RPC dédiée).

Nouvelle RPC `set_of_quality_status(p_of_id uuid, p_status of_quality_status, p_reason text)` :
- SECURITY DEFINER, vérifie `has_role` parmi admin/resp_production/chef_ligne/controleur_qualite/bureau_methode.
- Met à jour uniquement `quality_status`, écrit dans `audit_logs` (module `qualite`, action `update_quality_status`).

## 2. Composant onglet Qualité

Nouveau fichier `src/components/qualite/OfQualityTab.tsx` :

Props : `{ ofId: string, productId: string, lineId: string|null, currentStatus: string|null }`

Sections affichées :
1. **Statut qualité** : badge + sélecteur (rôles autorisés uniquement) appelant `set_of_quality_status`. Indépendant du statut production.
2. **KPIs en haut** :
   - Indicateurs applicables (count via RPC `get_quality_indicators_for_of(of_id)`)
   - Contrôles réalisés (count distinct indicator_id sur `quality_checks` filtrés `of_id`)
   - Contrôles manquants (applicables `is_required=true` − réalisés)
   - Contrôles hors tolérance (`is_conform=false`)
3. **Tableau "Indicateurs attendus"** : code, nom, fréquence, requis, dernier contrôle, état (✓/⚠/—).
4. **Tableau "Contrôles réalisés"** (limité aux 50 derniers de cet OF) : indicateur, valeur, conformité, date, auteur.
5. **Actions** :
   - Bouton "Ajouter contrôle qualité" → ouvre le même `ResponsiveDialog` que `QualiteControles.tsx` pré-rempli avec `of_id` (extraction du formulaire dans un sous-composant réutilisable `QualityCheckDialog` exporté depuis `QualiteControles.tsx`, ou duplication minimale).
   - Bouton "Voir contrôles qualité" → `navigate('/qualite/controles?of=' + ofNumero)`.
   - Bouton "Créer non-conformité" → `disabled` avec tooltip "Module non-conformité à venir".

Aucune écriture sur `ordres_fabrication.statut`, `consumptions`, `production_declarations`, `recipes`, `shifts`.

## 3. Intégration dans OfDetail.tsx

- Ajouter `TabsTrigger value="quality"` (icône `ShieldCheck` de lucide) dans la liste des onglets ligne 218-223.
- Ajouter `<TabsContent value="quality">` rendant `<OfQualityTab ... />`.
- Étendre le `select()` existant de l'OF pour inclure `quality_status`.

## 4. Permissions

- Lecture de l'onglet : tous les utilisateurs authentifiés (idem onglets existants).
- Modification du statut qualité & ajout de contrôle : admin, resp_production, chef_ligne, controleur_qualite, bureau_methode.
- Bouton "Ajouter contrôle" masqué si l'utilisateur n'a pas la permission.

## 5. Tests

Nouveau fichier `src/test/qualite/of-quality-tab.test.ts` :
- Calcul KPIs (réalisés / manquants / hors tolérance) à partir d'une liste mockée.
- Mapping statut qualité → label/badge variant.
- Vérification que le payload `set_of_quality_status` ne contient pas `statut` (production).
- Vérification que `get_quality_indicators_for_of` est bien l'unique source des indicateurs applicables.

Vérification manuelle (smoke) :
- `/gpao/of` liste OK
- Détail OF : 7 onglets visibles, onglet Qualité fonctionnel
- Ajout contrôle depuis OF → apparaît dans `/qualite/controles`
- Onglets Production / Consommations / Arrêts / Tickets / Mode / Shifts inchangés
- `/gpao/recettes`, `/maintenance/shift`, `/notifications` inchangés

## 6. Mémoire

Mettre à jour `mem://features/qualite-module` avec :
- nouvelle colonne `ordres_fabrication.quality_status` (nullable, indépendant du statut production)
- RPC `set_of_quality_status`
- onglet Qualité dans OfDetail

## Garanties de non-régression
- Schéma : seul `ALTER TABLE ADD COLUMN` nullable + nouvel enum + nouvelle RPC. Aucune modification des tables `consumptions`, `production_declarations`, `recipes`, `shifts`, `stops`.
- Code : aucune modification de `ShiftScreen.tsx`, `ConsumptionPage.tsx`, `RecipesPage.tsx`. `OfDetail.tsx` reçoit uniquement un onglet supplémentaire et un champ supplémentaire dans son select.
- UI : aucun blocage de clôture, aucun champ obligatoire ajouté ailleurs.
