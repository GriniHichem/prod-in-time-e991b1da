# Tableau shift de contrôle — vue tableau + correction épingle

## 1. Réparer l'épingle (cause racine)

L'épingle ne fonctionne pas parce que la table `quality_shift_pins` **n'existe pas** dans la base de données. Le code (`useQualityShiftPins.ts`) tente d'insérer/supprimer dans cette table, mais l'appel échoue silencieusement (erreur ignorée).

**Action :** créer la table via migration avec :
- colonnes : `quality_shift_id`, `of_id`, `indicator_id`, `pinned_by`, `created_at`
- contrainte d'unicité `(quality_shift_id, of_id, indicator_id)`
- `GRANT` pour `authenticated` + `service_role`
- RLS activée : lecture/écriture pour les utilisateurs authentifiés (partagé entre contrôleurs de l'équipe, conformément au comportement voulu du hook)

## 2. Ajouter un mode d'affichage « Tableau »

Dans `src/components/qualite/OfControlsPanel.tsx`, ajouter un sélecteur de vue (Cartes / Tableau) à côté des filtres existants.

**Vue Tableau** (nouvelle) :
- Un tableau (`ScrollTable` + `Table`) listant les contrôles avec colonnes : Épingle, Code, Nom, Norme/Unité, Statut/échéance, Saisie (champ compact selon le type numérique/booléen/select/texte), Conformité live, Commentaire, Action Enregistrer.
- Ligne compacte, saisie inline, même logique `handleSave`, `previewFor`, `dueInfo`, épinglage et tri prioritaire réutilisés tels quels.
- Les lignes non conformes / hors tolérance surlignées (rouge/vert), lignes épinglées mises en avant.

**Vue Cartes** : comportement actuel conservé.

Le choix de vue est un simple état local (`viewMode: "cards" | "table"`), défaut = cartes.

## Détails techniques

- Migration SQL unique pour `public.quality_shift_pins` (structure CREATE → GRANT → ENABLE RLS → POLICY).
- Aucun changement de logique métier : la vue tableau réutilise les mêmes fonctions et le même état (`drafts`, `lastByIndicator`, `sorted`, `savingId`).
- Réutilisation des composants `Table`/`ScrollTable` déjà présents.
- Aucune modification des autres systèmes shift (uniquement le tableau shift de contrôle qualité).
