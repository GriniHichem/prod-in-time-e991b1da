# Adapter les KPI pour la collaboration multi-maintenanciers

## Constat

| KPI | Source actuelle | Comportement |
|---|---|---|
| Nombre de pannes / MTBF / Disponibilité | `tickets` (1 ligne = 1 panne) | ✅ Déjà correct — n'utilise pas `interventions`, donc ajouter des collaborateurs ne crée **pas** de doublon |
| MTTR | `tickets.temps_intervention_minutes` | ✅ Une seule valeur par ticket |
| Charge / participation par technicien | `interventions` (1 ligne par intervenant) | ⚠️ Manque un marqueur `role` pour distinguer lead / aide / co-intervenant |
| Journal des interventions | `interventions` éclatées | ⚠️ Affiche tous les intervenants mais sans badge de rôle |

→ Le risque de "multiplier les pannes" **n'existe pas** dans le code actuel des KPI globaux. Le travail consiste à **enrichir le modèle d'intervention** pour rendre la lecture par technicien lisible et préserver cette garantie de façon explicite + documentée.

## Plan

### 1. Migration — colonne `role` sur `interventions`

```sql
CREATE TYPE public.intervention_role AS ENUM ('lead', 'aide', 'co_intervenant');

ALTER TABLE public.interventions
  ADD COLUMN role public.intervention_role NOT NULL DEFAULT 'lead';

CREATE INDEX idx_interventions_ticket_role ON public.interventions(ticket_id, role);
```

Backfill : pour chaque ticket, l'intervention dont `technicien_id = tickets.assignee_id` reste `lead` ; les autres deviennent `aide` (les rôles fins se mettent à jour dès le prochain ajout de collaborateur).

### 2. Code — `TicketDetail.tsx`

- `handleTakeCharge` → insertion intervention avec `role: 'lead'`
- `addCollaborator` → insertion intervention avec `role: role_label` (mapping direct `aide` / `co_intervenant`)
- `handleTransfer` → ferme le lead, ouvre nouvelle intervention `role: 'lead'` pour le repreneur
- `handleResolve` → fallback de création des interventions collaborateurs reçoit aussi `role` correct

### 3. KPI globaux — verrou explicite

Dans `AnalyticsPage.tsx`, ajouter un commentaire-garde au-dessus du calcul `totalFailures` pour interdire toute future migration vers un comptage par intervention :

```ts
// IMPORTANT: 1 ticket = 1 panne. Ne jamais compter les interventions ici,
// sinon les collaborateurs gonfleraient artificiellement MTBF/dispo.
const totalFailures = fTickets.filter((t) => t.statut !== "annule").length || 1;
```

(Aucun changement de calcul — uniquement une protection.)

### 4. KPI par technicien — nouveau bloc

Dans `AnalyticsPage.tsx`, ajouter une section repliable **"Charge par technicien"** alimentée par `interventions` :

- regroupement par `technicien_id`
- colonnes : nom, # interventions, durée totale (somme `date_fin - date_debut`), répartition par `role` (badges)
- export CSV via la pipeline `exportToCsv` existante

Les chiffres sont multi-comptés par design (un ticket avec 3 intervenants = 3 lignes ici), ce qui est exactement ce qu'on veut pour la charge individuelle.

### 5. Journal — affichage du rôle

Dans `InterventionJournal.tsx`, exposer le `role` :
- `JournalEntry` reçoit un champ optionnel `role`
- chaque ligne curative affiche un petit badge `Lead` / `Aide` / `Co-intervenant`

### 6. Tests

Nouveau `src/test/gmao/intervention-roles.test.ts` :
- 1 ticket avec 1 lead + 2 collaborateurs → `totalFailures = 1`, mais `interventions = 3`
- agrégation par technicien : durée par rôle correcte
- mapping `role_label` (`aide`/`co_intervenant`) → `role` intervention identique
- transfert : ancien lead clos avec `role=lead`, nouvelle intervention créée avec `role=lead`

### 7. Mémoire

Mettre à jour `mem://features/gmao-maintenance` :
- "1 ticket = 1 panne" pour KPI MTBF/disponibilité (immuable)
- Les interventions multi-rôles servent uniquement à la charge individuelle / journal / temps passé

## Fichiers touchés

- `supabase/migrations/<new>.sql` — enum + colonne + index + backfill
- `src/pages/TicketDetail.tsx` — passage du `role` dans les 4 inserts d'intervention
- `src/pages/AnalyticsPage.tsx` — commentaire-garde + nouveau bloc "Charge par technicien"
- `src/pages/InterventionJournal.tsx` — propagation et affichage du badge `role`
- `src/test/gmao/intervention-roles.test.ts` — nouveau
- `mem://features/gmao-maintenance` — note

## Garde-fous

- `tickets.statut`, `tickets.assignment_status`, enum `intervention_statut` : inchangés
- Les filtres existants (TicketsList, MaintenancierShiftView, Dashboard, Synoptic) ne sont pas touchés
- `temps_arret_minutes` et `temps_intervention_minutes` restent au niveau ticket (1 valeur unique)
