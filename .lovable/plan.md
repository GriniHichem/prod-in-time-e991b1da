## Objectif

Dans la Console Responsable Qualité, le responsable ne peut aujourd'hui ouvrir une session que **pour un contrôleur** (rôle `controleur_qualite`). On ajoute un mode « intervention personnelle » : le responsable peut **jouer lui-même le rôle de contrôleur** (cas d'absence, intervention sensible) — uniquement avec un **motif obligatoire**, tracé et visible.

## Comportement cible (`RespShiftConsole.tsx`, `kind === "quality"` uniquement)

Dans la boîte de dialogue « Ouvrir une session de shift » :

1. Ajout d'un interrupteur **« Intervenir moi-même (le responsable devient contrôleur) »**.
2. Quand il est activé :
   - Le sélecteur « Opérateur » est masqué/désactivé ; le contrôleur devient le responsable connecté (`controller_id = user.id`).
   - Un champ **« Motif de l'intervention personnelle » (obligatoire)** apparaît (Textarea) avec une aide : « ex. absence du contrôleur, intervention sensible ». L'ouverture est bloquée tant que le motif est vide.
   - Les lignes contrôlées restent sélectionnables comme aujourd'hui.
3. Quand il est désactivé : comportement inchangé (ouverture pour un contrôleur).

## Enregistrement

- `controller_id` = `user.id`, `opened_by` = `user.id`.
- Le motif est stocké dans `observations` sous un préfixe repérable : `[Intervention responsable] <motif>`.
- Un marqueur booléen `is_self_intervention` + `intervention_reason` sont ajoutés à `quality_shifts` (migration) pour un affichage fiable et un filtrage futur.
- Audit : `logAudit` avec action `quality_shift_self_intervention`, description incluant le motif, metadata `{ reason }`.

## Affichage

- Dans la liste des sessions du jour, une session en intervention personnelle affiche un **badge spécifique** (ex. « Intervention responsable ») à côté du badge LIVE, avec le motif en info.
- Le nom d'opérateur affiché est celui du responsable.

## Détails techniques

### Migration (`quality_shifts`)
```sql
ALTER TABLE public.quality_shifts
  ADD COLUMN IF NOT EXISTS is_self_intervention boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS intervention_reason text;
```
(pas de nouvelle table → RLS/GRANT existants conservés)

### `RespShiftConsole.tsx`
- Nouveaux états : `selfMode: boolean`, `interventionReason: string` ; réinitialisés dans `resetForm()`.
- `handleOpenSession()` branche `quality` :
  - si `selfMode` : ignorer la validation « opérateur requis », exiger `interventionReason.trim()`, insérer avec `controller_id: user.id`, `is_self_intervention: true`, `intervention_reason: reason`, `observations: "[Intervention responsable] " + reason`.
  - sinon : logique actuelle inchangée.
- UI dialog : ajout du `Switch` + `Textarea` conditionnels (composants shadcn déjà présents), masquage du select opérateur en mode self.
- Liste des sessions : lire `s.is_self_intervention` pour afficher le badge et le motif.
- La requête `loadSessions` (quality) sélectionne déjà `*` → les nouvelles colonnes sont incluses automatiquement.

### Portée
Modification limitée au `kind === "quality"`. Production et maintenance restent inchangés.
