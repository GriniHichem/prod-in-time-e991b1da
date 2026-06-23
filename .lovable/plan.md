# Consommer depuis le mini-stock du maintenancier (multi-tickets)

## Problème
Aujourd'hui, une pièce détenue (« holding ») est rattachée à **un seul ticket** via sa demande. À la résolution, elle est consommée en entier et le reliquat repart au magasin. Donc un maintenancier qui prend 4 pièces en une demande ne peut pas les répartir sur 3 tickets.

## Objectif
Dans la section « Pièces utilisées » d'un ticket, le maintenancier voit **tout son mini-stock** (toutes ses pièces `en_main`, peu importe le ticket d'origine), en choisit certaines, saisit une quantité consommée par pièce, et le **reliquat reste dans son mini-stock** (dispo pour d'autres tickets). Rien ne repart au magasin tant qu'il détient les pièces.

## Changement principal de logique
Le « holding » devient une vraie réserve décrémentable :
- Consommer 1 pièce sur 4 → le holding passe à 3 et reste `en_main`.
- Quand il tombe à 0 → statut `consomme`.
- Aucun retour automatique au magasin à la consommation. Le reliquat ne repart au magasin que via le circuit de retour existant (inchangé).

## 1. Base de données — nouveau RPC
Créer `consume_from_ministock(p_holding_id, p_intervention_id, p_qte_consomme, p_position_id, p_cause, p_commentaire)` (SECURITY DEFINER), basé sur l'actuel `consume_maintenance_holding` mais :
- Mêmes contrôles de permission et de détenteur (`holder_id = auth.uid()` ou resp/admin).
- `p_qte_consomme` entre 1 et `quantite` détenue.
- Insère dans `intervention_pdr` la quantité consommée (via le flag `app.pdr_flow`).
- **Décrémente** `pdr_maintenance_holdings.quantite` de la quantité consommée.
- Si le solde atteint 0 → `statut = 'consomme'`, sinon reste `en_main`.
- **Pas** d'insertion de mouvement de retour magasin (différence clé avec l'actuel).

L'ancien `consume_maintenance_holding` reste inchangé (toujours utilisé par le kiosque shift).

## 2. Frontend — `src/pages/TicketDetail.tsx`
- `loadHoldings` : charger **toutes** les pièces de l'utilisateur (`holder_id = user`, `statut = 'en_main'`) avec `pdr(reference, designation)`, **sans** filtrer par demande/ticket.
- État `selected` (pièces cochées pour ce ticket) + `consumed` (quantité par pièce, bornée à `quantite` détenue), au lieu de tout pré-cocher.
- UI « Pièces utilisées » : liste du mini-stock avec, par pièce, une case à cocher + champ quantité (0 → quantité détenue). Le bouton « Demander / prendre des pièces » reste pour réapprovisionner le mini-stock.
- Note d'aide mise à jour : « Le reliquat non consommé reste dans votre stock maintenance pour vos autres tickets. »
- À la résolution (`handleResolve`) : pour chaque pièce sélectionnée avec `qte > 0`, appeler le nouveau RPC `consume_from_ministock`. Supprimer la boucle actuelle qui repassait par demande → request_item → holding.

## 3. Hook — `src/hooks/usePdrRequests.ts`
Ajouter `consumeFromMinistock(input)` qui appelle `supabase.rpc("consume_from_ministock", ...)`, sur le modèle de `consumeMaintenanceHolding`.

## Hors périmètre
- Le kiosque shift (`MaintenanceShiftIntervention`) garde son comportement actuel.
- Aucun changement au circuit demande → préparation → prise, ni au retour magasin manuel.

## Détails techniques
- Le contrôle `request_item_id IS NOT NULL` est conservé (la pièce provient toujours d'une prise validée).
- Le ledger stock magasin n'est pas touché à la consommation : la pièce a déjà quitté le magasin à la prise ; elle est juste « brûlée » sur intervention.
