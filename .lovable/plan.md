## Objectif

Garantir que les KPI d'un ticket (temps d'arrêt, temps d'intervention, prise en charge, fin) restent cohérents et exacts dans **tous** les scénarios :
- Prise en charge simple
- Collaboration (aide / co-intervenant)
- Transfert vers un autre maintenancier
- Libération puis reprise
- Résolution finale

## Constats actuels

### KPI ticket (`tickets`)
- `temps_arret_minutes` = `heure_resolution - heure_declaration` (calc dans `handleResolve`)
- `temps_intervention_minutes` = `heure_resolution - heure_prise_en_charge` (calc dans `handleResolve`)
- `heure_prise_en_charge` est posée à la 1ère prise et **conservée** lors d'un transfert (OK pour KPI continu) — mais **remise à null** lors d'une libération, ce qui casse le calcul si reprise.

### KPI interventions
- À la prise en charge : `interventions` insérée sans `date_debut` explicite (default = `now()`) — OK
- Au transfert : intervention sortante fermée avec `date_fin = now`, nouvelle ouverte (default `date_debut = now`) — OK
- À la libération : intervention fermée `liberee` — OK ; mais à la **reprise** suivante (`handleTakeCharge`), une nouvelle intervention démarre — OK
- À la résolution : seule l'intervention `en_cours` courante est fermée (`date_fin = now`) — OK
- **Bug** : les **collaborateurs** sont insérés **au moment de la résolution** avec `date_debut = ticket.heure_prise_en_charge || now`. Conséquences :
  - On ignore la vraie date d'ajout (`ticket_collaborators.added_at`) → durée de collaboration faussée (souvent gonflée).
  - Si le collab a été retiré avant la résolution (`removed_at`), sa `date_fin` devrait être `removed_at`, pas `now`.
  - Aucune intervention créée pour un collab actif si le ticket est transféré/libéré sans résolution → perte de traçabilité KPI.

### Problèmes liés à la libération
- `heure_prise_en_charge` est mise à `null` → si un autre maintenancier reprend, le KPI total perd la fenêtre antérieure. Soit on garde `heure_prise_en_charge` initial (cohérent avec le transfert), soit on stocke un horodatage séparé pour la **première** prise en charge.

## Modifications proposées

### 1. Libération (`handleRelease`)
- **Ne plus** vider `heure_prise_en_charge`. La conserver pour que `temps_intervention_minutes` reflète bien la durée totale (transfert et reprise traités symétriquement).
- À la reprise (`handleTakeCharge`) : si `heure_prise_en_charge` existe déjà (ticket déjà pris une fois), **ne pas l'écraser** ; juste mettre à jour `assignee_id` + statut, et créer une nouvelle intervention `en_cours`.

### 2. Collaborateurs — interventions individuelles avec dates correctes
- Lors de **l'ajout** d'un collaborateur (`addCollaborator`) : créer immédiatement une intervention `en_cours` avec `date_debut = added_at`, `description = Collaboration (aide|co_intervenant)` au lieu d'attendre la résolution.
- Lors du **retrait** (`removeCollaborator`) : fermer l'intervention correspondante (`statut = terminee`, `date_fin = removed_at`).
- Lors de la **résolution** (`handleResolve`) : fermer toutes les interventions de collaborateurs encore `en_cours` avec `date_fin = now`. Supprimer le bloc d'insert "Collaboration" actuel (devenu redondant).
- Lors d'un **transfert / libération** : les interventions `en_cours` des collaborateurs restent ouvertes (ils continuent à aider) — pas de modification.

### 3. KPI ticket — robustesse de `handleResolve`
- Continuer d'utiliser `heure_declaration` et `heure_prise_en_charge` du ticket (déjà cohérents grâce au point 1).
- Si pour une raison quelconque `heure_prise_en_charge` est `null` (résolution d'un ticket jamais pris formellement), fallback sur `heure_declaration` pour `temps_intervention_minutes` (au moins une valeur non nulle).
- `heure_cloture` reste posée par `handleClose` (déjà OK).

### 4. Vue Journal des interventions
- `InterventionJournal.tsx` calcule déjà `duration_minutes = date_fin - date_debut` par intervention — bénéficie automatiquement des dates corrigées (collaborateur, transfert, reprise).

### 5. Audit
- Aucun changement structurel ; les actions (ajout/retrait collab, transfert, libération, résolution) sont déjà loggées.

## Détails techniques

Fichier impacté : `src/pages/TicketDetail.tsx`

```text
addCollaborator()        → INSERT interventions (en_cours, date_debut = added_at)
removeCollaborator()     → UPDATE intervention collab (statut=terminee, date_fin=removed_at)
handleTakeCharge()       → si heure_prise_en_charge existe déjà : ne pas l'écraser
handleRelease()          → retirer "heure_prise_en_charge: null"
handleResolve()          → fermer interventions collab en_cours ; supprimer insert "Collaboration"
                           fallback temps_intervention_minutes sur heure_declaration si besoin
```

Aucune migration DB requise — on réutilise `interventions` (statuts existants `en_cours`/`terminee`).

## Hors-scope
- Pas de recalcul rétroactif des KPI sur tickets déjà résolus.
- Pas de changement aux KPI agrégés (MTTR/MTTA dashboards) — ils s'appuient déjà sur les colonnes corrigées.
- Pas de modification de l'enum `intervention_statut`.
