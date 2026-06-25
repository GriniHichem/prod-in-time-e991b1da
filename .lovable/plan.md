## Objectif

Permettre au maintenancier, **sans quitter le plan préventif en cours**, de :
1. Demander une pièce non prévue (panneau intégré dans la carte « Intervention en cours »).
2. Voir automatiquement (temps réel) quand le magasin l'a préparée.
3. Confirmer la prise en un geste.
4. Confirmer la quantité consommée à la clôture.

Tout en gardant le **cycle sécurisé** déjà figé : Demande → Préparation magasin → Prise → Consommation. Aucune consommation directe du stock n'est introduite (la règle anti-contournement reste intacte).

## Ce qui change

### 1. Demande inline dans la carte « Intervention en cours »
Ajout d'un bloc dépliable **« + Demander une pièce non prévue »** directement dans la carte verte (`PreventifDetail.tsx`), réutilisant le composant existant `PdrRequestComposer` (recherche, famille/sous-famille, dispo en direct).
- Pré-rempli avec `type="preventive"`, `preventivePlanId`, `machineId`.
- À l'envoi (`onSubmitted`), la liste se recharge et le bloc se referme — le maintenancier reste sur le plan.
- Le bouton « Demander / prendre des pièces » qui redirigeait vers une autre page devient secondaire (conservé en repli, mais le flux principal est inline).

### 2. Temps réel (rapidité)
Le détail du plan ne s'actualise qu'au montage aujourd'hui. Ajout d'abonnements temps réel (hook `useShiftRealtime`, déjà utilisé ailleurs) sur `pdr_requests`, `pdr_request_items` et `pdr_maintenance_holdings` filtrés sur ce plan :
- Dès que le magasin prépare → la pièce passe de « En préparation » à « Prête » + bouton **Confirmer la prise** apparaît sans recharger.
- Dès qu'une prise est confirmée → elle bascule dans « Pièces prises ».

### 3. Confirmation de prise déjà en place — consolidée
Le `ConfirmTakeDialog` (récap famille/qté demandée/dispo/reliquat) reste le point de confirmation, déjà branché. On s'assure qu'il s'ouvre aussi pour les pièces non prévues fraîchement préparées.

### 4. Clôture inchangée mais clarifiée
Le dialogue « Terminer » continue de ne lister que les pièces réellement prises (holdings) pour saisir la quantité consommée ; le reliquat retourne au magasin. Le bloc d'aide « pièce manquante » est remplacé par le même panneau inline de demande rapide.

## Améliorations proposées pour la rapidité / facilité

1. **Compteurs d'action en tête de carte** : badges cliquables « X à prendre » / « X en préparation » qui scrollent/filtrent la liste — repérage immédiat.
2. **Bouton « Tout prendre »** : si plusieurs pièces sont « Prêtes », un seul clic ouvre une confirmation groupée (qté préparée par défaut) au lieu d'une par une.
3. **Réutilisation des pièces déjà demandées** : suggestion en un clic des pièces de la nomenclature planifiée (`preventive_plan_pdr`) non encore demandées → « Demander les pièces prévues » en bloc.
4. **Pré-remplissage durée** : calcul auto de la durée à la clôture à partir de `heure_debut` (modifiable), pour éviter la saisie manuelle.
5. **Indicateur dispo dans la demande** : déjà présent (badge Disponible/Non dispo) ; ajout d'un tri « disponibles d'abord » pour accélérer le choix.
6. **Notification magasin prioritaire** : marquer la priorité par défaut selon l'urgence du plan (ex. plan en retard → priorité haute).

## Détails techniques

Fichiers touchés (frontend uniquement) :
- `src/pages/PreventifDetail.tsx` :
  - État `showRequest` pour le panneau inline + intégration `PdrRequestComposer` avec `onSubmitted={() => { loadPlanRequests(); loadHoldings(); setShowRequest(false); }}`.
  - Ajout des abonnements `useShiftRealtime` (3 tables) déclenchant `loadPlanRequests` / `loadHoldings`.
  - Optionnel : helper « Demander les pièces prévues » à partir de `planPdr` via `createPdrRequest`.
  - Pré-remplissage durée depuis `heure_debut`.
- Aucune migration : les RPC `confirm_request_item_taken`, `consume_maintenance_holding_preventive` et `createPdrRequest` existent déjà.
- Aucun changement de logique métier backend : on s'appuie sur le circuit sécurisé existant.

## Hors périmètre
- Pas de consommation directe du stock magasin (interdit, RPC neutralisée — on n'y touche pas).
- Pas de modification des droits du maintenancier (toujours pas de modification du plan).