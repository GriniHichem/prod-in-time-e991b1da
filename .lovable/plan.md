

## Diagnostic

Le probleme est clair : l'ecran Shift cherche un enregistrement `shifts` existant en base pour aujourd'hui dont `heure_debut <= now <= heure_fin`. Mais **il n'existe aucun mecanisme pour creer ce shift**. Le chef de ligne arrive sur l'ecran, il n'y a rien en base, donc "Aucun shift actif".

Il manque un flux **"Demarrer un shift"** qui permet au chef de ligne de :
1. Choisir l'equipe (shift team)
2. Choisir le creneau horaire (depuis `shift_mode_slots` de l'OF ou `shift_time_slots`)
3. Choisir l'OF en cours
4. Choisir la ligne de production
5. Confirmer → cela cree l'enregistrement `shifts` en base avec `chef_ligne_id = user.id`

---

## Plan d'implementation

### 1. Ajouter un formulaire "Demarrer un shift" dans ShiftScreen

Quand `activeShift === null`, au lieu d'afficher juste "Aucun shift actif", afficher un formulaire de demarrage avec :

- **Equipe** : Select parmi `shift_teams` actives
- **Creneau horaire** : Select dynamique depuis `shift_mode_slots` (base sur le mode de l'OF selectionne) ou `shift_time_slots`
- **OF** : deja selectionne dans la liste des OF en cours
- **Ligne** : pre-remplie depuis l'OF (`production_lines`)
- **Chef de ligne** : l'utilisateur connecte (affiche en lecture seule)
- Bouton "Demarrer le shift"

Le `handleStartShift` va :
- Calculer `heure_debut` et `heure_fin` a partir du creneau choisi + date du jour
- Inserer dans `shifts` avec `chef_ligne_id = user.id`, `statut = 'en_cours'`, `shift_team_id`, `of_id`, `line_id`, `date_shift = today`
- Recharger les donnees → le shift devient actif

### 2. Gerer aussi la reprise de shift existant

Si un shift existe deja pour aujourd'hui (cree par un autre chef ou plus tot), le detecter et l'afficher. Ajouter aussi la detection des shifts `en_cours` (statut) en plus de la fenetre horaire, pour gerer les cas ou le shift deborde legerement.

### 3. Determiner le shift_type dynamiquement

Au lieu de forcer `matin/apres_midi/nuit`, deduire le `shift_type` depuis l'heure de debut du creneau choisi :
- 05h-13h → matin
- 13h-21h → apres_midi  
- 21h-06h → nuit
- Sinon → journee

### 4. Securite

Seuls les utilisateurs avec role `chef_ligne`, `resp_production` ou `admin` peuvent demarrer un shift (deja gere par RLS sur la table `shifts`).

---

### Fichiers modifies

| Fichier | Changement |
|---|---|
| `src/pages/gpao/ShiftScreen.tsx` | Ajout formulaire demarrage shift, logique `handleStartShift`, detection shift existant par statut |

Aucune migration necessaire — la table `shifts` a deja toutes les colonnes requises (`chef_ligne_id`, `shift_team_id`, `of_id`, `line_id`, `date_shift`, `heure_debut`, `heure_fin`, `statut`, `shift_type`).

