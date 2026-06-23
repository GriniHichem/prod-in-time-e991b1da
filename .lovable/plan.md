## Audit — problèmes confirmés

1. **Contournement direct depuis le ticket**
   - L’écran détail ticket permet encore d’ajouter des “Pièces utilisées”.
   - À la résolution, il écrit directement dans `intervention_pdr`, décrémente `pdr.stock_actuel`, puis crée une sortie stock.
   - Résultat : consommation possible sans demande, sans préparation magasin, sans double validation.

2. **Contournement direct depuis le préventif**
   - L’exécution préventive décrémente encore directement le stock pour les PDR cochées.
   - Cela contourne la règle décidée : les PDR préventives doivent passer par demande + préparation + prise/réception.

3. **Règles backend trop ouvertes**
   - Les rôles maintenance peuvent gérer directement `intervention_pdr`.
   - Les mouvements stock peuvent être créés directement par un utilisateur authentifié si `user_id = auth.uid()`.
   - Les holdings maintenance peuvent être manipulés directement par maintenance.
   - Les demandes/items peuvent être modifiés directement, alors que le flux doit passer par les fonctions métier.

4. **Fonction de prise pas assez stricte**
   - La confirmation de prise accepte une quantité qui peut dépasser la quantité préparée.
   - Le stock est forcé à zéro si dépassement, au lieu de bloquer l’opération.
   - Il faut empêcher toute sortie si la quantité réelle disponible ne couvre pas la prise.

## Correction proposée

### 1. Supprimer les contournements UI

- Dans l’écran ticket :
  - retirer le bloc “Pièces utilisées” qui permet de choisir une PDR librement ;
  - remplacer par un bouton unique **Demander / prendre des pièces** ;
  - afficher seulement les pièces déjà prises via le stock maintenance intermédiaire.

- À la résolution/clôture ticket :
  - supprimer toute décrémentation directe de `pdr.stock_actuel` ;
  - supprimer toute création directe de `pdr_stock_movements` ;
  - consommer uniquement les `pdr_maintenance_holdings` validés par le cycle demande → prête → prise.

- Dans le préventif :
  - supprimer la décrémentation directe sur exécution ;
  - garder le bouton **Demander des pièces** ;
  - l’exécution peut enregistrer les tâches réalisées, mais la consommation PDR doit venir uniquement des pièces reçues/prêtes/pris via le workflow.

### 2. Verrouiller le backend contre toute écriture directe

Créer une migration de sécurité qui :

- bloque l’insertion directe dans `intervention_pdr` depuis le client ;
- bloque l’insertion directe dans `pdr_stock_movements` depuis le client ;
- bloque la création/modification directe de `pdr_maintenance_holdings` ;
- limite les modifications directes des demandes/items :
  - création de demande autorisée par l’écran maintenance ;
  - changement de statut uniquement via fonctions métier ;
  - préparation uniquement par magasin ;
  - prise uniquement par maintenance.

Les fonctions backend `set_request_item_ready`, `confirm_request_item_taken`, `consume_maintenance_holding`, `cancel_pdr_request`, `refuse_request_item` resteront les seuls points d’écriture métier.

### 3. Durcir les fonctions métier

- `set_request_item_ready` :
  - refuser quantité préparée <= 0 ;
  - refuser quantité préparée > quantité demandée ;
  - refuser si stock disponible insuffisant, sauf préparation partielle explicite.

- `confirm_request_item_taken` :
  - accepter uniquement une ligne au statut `prete` ;
  - refuser quantité prise <= 0 ;
  - refuser quantité prise > quantité préparée ;
  - refuser quantité prise > stock disponible réel ;
  - ne jamais utiliser `GREATEST(0, stock - qte)` pour masquer une erreur ;
  - décrémenter stock seulement si toutes les validations passent ;
  - créer automatiquement le mouvement de sortie et le stock maintenance intermédiaire.

- `consume_maintenance_holding` :
  - refuser tout holding non issu d’une demande validée ;
  - refuser si le détenteur n’est pas l’utilisateur courant ou un responsable autorisé ;
  - créer `intervention_pdr` uniquement depuis cette fonction ;
  - retourner automatiquement le reliquat au stock magasin.

### 4. Ajouter un garde-fou base de données final

Ajouter des triggers de protection :

- si quelqu’un tente une écriture directe non autorisée dans `intervention_pdr`, l’opération est rejetée ;
- si quelqu’un tente une sortie directe PDR sans source `pdr_request`, l’opération est rejetée ;
- si quelqu’un tente de modifier `pdr.stock_actuel` hors fonction métier autorisée, l’opération est rejetée pour les sorties maintenance.

Objectif : même si un écran ancien, une requête manuelle, ou une erreur future existe, la base bloque.

### 5. Améliorer l’écran maintenance sans ralentir les opérations

- Garder le flux rapide :
  - “Demander” ;
  - “À prendre” ;
  - “Mon stock maintenance”.

- Ajouter sur l’écran ticket/shift une vue simple :
  - pièces demandées ;
  - pièces prêtes ;
  - pièces prises ;
  - reliquat prévu.

- La clôture affiche uniquement les pièces réellement en main, avec quantité consommée rapide.

### 6. Vérification finale

- Tester qu’un maintenancier ne peut plus :
  - ajouter une pièce directement dans un ticket ;
  - décrémenter le stock depuis un ticket ;
  - consommer une PDR préventive sans demande ;
  - créer un mouvement stock direct.

- Tester que le bon cycle fonctionne toujours :

```text
Maintenance demande
→ Magasin prépare/refuse
→ Maintenance confirme la prise
→ Stock principal décrémenté + stock maintenance crédité
→ Intervention consomme
→ Reliquat retourne automatiquement au stock magasin
```

## Résultat attendu

Après correction, aucune consommation PDR ne sera possible sans demande validée par le magasin et confirmée par la maintenance.