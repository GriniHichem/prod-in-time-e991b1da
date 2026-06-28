# Gestion des pièces du mini-stock maintenance

Permettre à un maintenancier de **passer une pièce** de son mini-stock (`pdr_maintenance_holdings`) à un autre maintenancier/responsable, ou de **la retourner au magasin** — toujours selon le même principe de **confirmation en deux étapes** déjà utilisé pour les demandes (demander → préparer → prendre).

## Règles validées
- Destinataire d'un transfert : n'importe quel maintenancier ou responsable maintenance (choisi dans une liste).
- Pendant l'attente de confirmation, la pièce est **bloquée/réservée** chez l'expéditeur (non consommable).
- Le retour au magasin est confirmé par le **magasinier / responsable magasin**.

## Principe de fonctionnement

```text
  TRANSFERT entre maintenanciers
  ──────────────────────────────
  A: "Passer x2 à B"  ──►  [en_attente]  ──►  B confirme la réception
       (qté retirée du stock de A)              (qté ajoutée au stock de B)
                              │
                              └─► B refuse / A annule ──► qté restituée à A

  RETOUR au magasin
  ─────────────────
  A: "Retour x2"      ──►  [en_attente]  ──►  Magasinier confirme réception
       (qté retirée du stock de A)              (stock magasin ré-incrémenté + mouvement audité)
                              │
                              └─► magasin refuse / A annule ──► qté restituée à A
```

Le blocage est obtenu en **retirant immédiatement** la quantité du holding de l'expéditeur dès l'envoi (elle « part en transit » dans la ligne de transfert), donc elle n'est plus consommable. En cas d'annulation/refus, la quantité est restituée.

## Backend (migration)

Nouvelle table `pdr_holding_transfers` :
- `pdr_id`, `quantite`, `from_holder` (expéditeur)
- `destination` (`maintainer` | `magasin`), `to_holder` (nullable, rempli si destination maintainer)
- `statut` (`en_attente` | `confirme` | `refuse` | `annule`), `motif`
- `confirmed_by`, `confirmed_at`, `request_item_id` (origine, pour traçabilité), timestamps + trigger updated_at
- GRANT authenticated/service_role, RLS : lecture par expéditeur, destinataire et rôles magasin ; écriture via RPC uniquement.

Trois fonctions `SECURITY DEFINER` (mêmes garde-fous que l'existant, utilisant `set_config('app.pdr_flow','on')` pour les mouvements de stock) :
- `initiate_holding_transfer(holding_id, qte, destination, to_holder, motif)` — vérifie que l'appelant est le détenteur, statut `en_main`, `qte ≤ quantite` ; décrémente le holding (consomme la ligne si tout part) ; crée le transfert `en_attente`.
- `confirm_holding_transfer(transfer_id)` —
  - destination `maintainer` : appelant = `to_holder` (ou admin) ; crée/incrémente un holding `en_main` pour le destinataire.
  - destination `magasin` : appelant magasinier/resp_magasin/admin ; ré-incrémente `pdr.stock_actuel` + insère un `pdr_stock_movements` type `entree` (motif « Retour stock maintenance »).
- `cancel_holding_transfer(transfer_id, raison)` — expéditeur, destinataire (refus) ou admin ; restitue la quantité au holding de l'expéditeur.

Realtime : ajouter `pdr_holding_transfers` à la publication (REPLICA IDENTITY FULL).

## Frontend

Hook `usePdrHoldingTransfers` (transferts entrants à confirmer + mes transferts sortants), avec abonnement realtime.

`src/pages/shift/MaintenancePieces.tsx` (onglet **Mon stock**) :
- Sur chaque pièce détenue : bouton **« Passer à… »** (dialogue : destinataire dans une liste de maintenanciers/responsables + quantité + motif) et **« Retour magasin »** (quantité + motif).
- Nouveau sous-bloc / onglet **« À confirmer »** listant les transferts entrants vers moi → boutons **Confirmer la réception** / **Refuser**.
- Mes envois en attente affichés avec possibilité d'**Annuler**.
- Réutilisation du composant de confirmation existant (`ConfirmTakeDialog` comme modèle) pour garder l'UX cohérente et rapide (un récap + un bouton).

Côté magasin (`MagasinKiosk` / `PdrQueuePanel`) :
- Section **« Retours à confirmer »** : liste des transferts `destination=magasin` en attente → bouton **Confirmer la réception** (ré-entrée en stock) ou **Refuser**.

## Détails techniques
- Aucune écriture directe sur `pdr_maintenance_holdings` / `pdr_stock_movements` depuis le client : tout passe par les RPC (cohérent avec le durcissement `guard_pdr_stock_movements`).
- Liste des destinataires : requête `profiles` filtrée sur les rôles `maintenancier`/`resp_maintenance` (hors soi-même).
- Pas de blocage des opérations : si un destinataire est absent, l'expéditeur peut annuler à tout moment et récupérer sa pièce.
