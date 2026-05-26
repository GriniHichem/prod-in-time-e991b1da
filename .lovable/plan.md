## Audit système Shift — bugs trouvés et corrections proposées

Objectif : organiser, faciliter, automatiser, ne jamais bloquer.

### Bugs bloquants

**1. Ouverture manuelle Qualité par le responsable → bloquée par RLS**
La policy `qshifts_insert_self` exige `controller_id = auth.uid()`. Or `RespShiftConsole.handleOpenSession` insère avec `controller_id = operatorId` (id du contrôleur, pas du responsable). L'insert échoue silencieusement avec une erreur RLS générique.
→ Élargir la policy : autoriser aussi `admin / responsable_controle_qualite / directeur_qualite` à ouvrir pour un autre `controller_id`.

**2. Ouverture manuelle Production → échoue sur `shifts.heure_fin NOT NULL`**
La colonne `shifts.heure_fin` est `NOT NULL` sans défaut. Le RPC auto la calcule (heure_debut + 8h), mais `RespShiftConsole` insère sans `heure_fin`. Crash DB dès le premier "Ouvrir une session" sur production.
→ Ajouter un trigger BEFORE INSERT qui calcule `heure_fin := heure_debut + 8h` quand NULL. Idem `heure_debut_reelle := heure_debut` quand NULL.

**3. Maintenance — session "nuit" perdue après minuit**
`useActiveMaintenanceShift` filtre `date_shift = today`. Un shift ouvert à 22h disparaît à 00h05 alors que `is_active=true` et que le slot court jusqu'à 5h.
→ Retirer le filtre `date_shift` (comme prod/qualité) ou autoriser `date_shift in (today, yesterday)` quand `is_active=true`.

### Doublons et incohérences

**4. Doublons de sessions production**
Aucune unicité sur `shifts(of_id, line_id, date_shift, shift_type) WHERE is_active`. Le RPC `ensure_production_shift_session` gère son propre dédup, mais l'ouverture manuelle responsable ne vérifie rien : 2 sessions peuvent coexister.
→ Index unique partiel `WHERE is_active = true` + pré-check dans `RespShiftConsole` avec message explicite "Session déjà ouverte pour cette ligne".

**5. `shift_type` libre dans la console responsable**
La console laisse choisir matin/après-midi/nuit même si l'heure courante ne correspond pas (ouvrir "matin" à 15h). Crée des incohérences avec le trigger Heure-1 sur les déclarations.
→ Verrouiller sur `derive_shift_type_from_now()` par défaut, override admin uniquement.

**6. Notification trigger se déclenche sur chaque UPDATE**
`notify_shift_event` exécute pour tout UPDATE, même édition d'`observations`. Le check `OLD.is_active=true AND NEW.is_active=false` filtre la branche close, mais l'INSERT-branch est OK. Pas de bug fonctionnel, juste du bruit / coût trigger.
→ Limiter le trigger UPDATE à `OF UPDATE OF is_active` (déjà fait pour le trigger `tg_qshift_unlink_closed_production`, à appliquer ici).

### Manque d'autonomie opérateur (anti-blocage)

**7. Pas de self-open production**
Si un chef de ligne arrive et qu'aucun `of_shift_assignments` n'a été configuré, `ensure_my_production_shifts` ne fait rien et le kiosk reste vide. Le `ShiftGuard` affiche "Demandez à votre responsable" → bloqué.
→ Ajouter un bouton "Démarrer mon shift maintenant" dans `ShiftGuard` (pour `chef_ligne`) qui ouvre un dialogue minimal (ligne + OF en cours) et insère un `shifts` row. Évite la dépendance complète au responsable.

**8. Pas de self-open maintenance**
Même problème : tout passe par le responsable. La maintenance est task-driven, mais le maintenancier ne peut pas démarrer son shift seul.
→ Bouton "Clock-in maintenance" dans `ShiftGuard` (pour `maintenancier`) avec sélection des lignes couvertes.

**9. Quality identique**
→ Bouton self-open contrôleur qualité si `ensure_my_quality_shifts` n'a rien créé (pas d'assignation).

### Améliorations qualité de vie

**10. `CloseShiftButton.logAudit` utilise des modules invalides** (`"production"`, `"maintenance"` au lieu de `gpao`, `interventions`). Aligner sur `RespShiftConsole`.

**11. `ShiftLayout` "Quitter sans clôturer"** laisse la session active indéfiniment. Ajouter un soft-reminder visuel après slot+1h, et un cron léger (edge function ou trigger sur heartbeat) qui auto-clôture les sessions actives dont `heure_fin + 2h < now()`.

**12. `OfShiftPlanTab`** : pas de garde-fou contre l'affectation du même chef à 2 créneaux qui se chevauchent ni à 2 OFs simultanés. Ajouter une vérification côté UI + un index unique partiel sur `(chef_ligne_id, shift_type) WHERE is_active`.

### Plan d'exécution

1. Migration SQL :
   - Trigger `BEFORE INSERT` sur `shifts` pour défaut `heure_fin` / `heure_debut_reelle`.
   - Élargir policy `qshifts_insert_self` aux rôles responsables.
   - Restreindre `notify_shift_event` UPDATE à `OF UPDATE OF is_active`.
   - Index unique partiel sur `shifts(of_id, line_id, date_shift, shift_type) WHERE is_active`.
   - Edge function planifiée `auto-close-stale-shifts` (toutes les 30 min).

2. Frontend :
   - `RespShiftConsole` : pré-check doublon, `shift_type` calculé par défaut, gestion erreur RLS claire.
   - `ShiftGuard` : bouton self-open par kind (3 dialogues légers).
   - `useActiveMaintenanceShift` : retirer le filtre `date_shift`.
   - `CloseShiftButton` : corriger les modules d'audit.
   - `OfShiftPlanTab` : warning UI sur conflit chef/slot.

3. Tests :
   - `src/test/shift/shift-auto-close.test.ts` : logique edge function.
   - `src/test/shift/shift-self-open.test.tsx` : flux self-open.
   - `src/test/shift/maintenance-night-shift.test.ts` : session nuit visible après minuit.

4. Mémoires mises à jour : `mem://features/shift-management`, `mem://features/shift-apps-isolation`, `mem://features/shift-auto-generation`.
