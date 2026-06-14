# Auto-ouverture des sessions de shift par rotation d'équipe

## Objectif
À la connexion, ouvrir automatiquement la session de l'employé **selon son rôle**, en s'appuyant sur le moteur de rotation par équipe (`shift_schedules` / `shift_templates` / `shift_team_members`).

Décisions validées :
- **Portée** : selon le rôle uniquement — `maintenancier` → maintenance, `controleur_qualite` → qualité.
- **Production** : pas d'auto-ouverture (un OF actif et une ligne restent obligatoires → ouverture manuelle conservée).
- **Lignes** : reprises depuis le planning On-Shift (`shift_schedules.line_ids`).

## Constat
Aujourd'hui `open_my_work_session()` n'ouvre **que** la maintenance, sans reprendre les lignes du planning, et ignore la qualité. C'est le seul endroit à faire évoluer côté logique d'ouverture automatique.

## Modifications base de données (migration)

### 1. Fonction utilitaire `get_scope_shift_context(_user_id, _scope, _at)`
Variante scopée de `get_active_shift_context` qui filtre `shift_schedules.scope_kind IN (_scope, 'all')` et retourne en plus `line_ids` :
`(team_id, template_id, template_code, heure_debut, heure_fin, line_ids, is_on_shift, autorisation_libre)`.
- `STABLE SECURITY DEFINER`, fuseau `Africa/Algiers`, même logique de fenêtre jour/jour-1 et `weekdays` que l'existant.
- Sélectionne en priorité le créneau On-Shift, sinon le prochain.

### 2. Réécriture de `open_my_work_session()`
- Récupère `auth.uid()`.
- **Maintenance** : si l'utilisateur a le rôle `maintenancier`, appelle `get_scope_shift_context(uid,'maintenance')`. Si `is_on_shift OR autorisation_libre` et pas de session active existante, insère dans `maintenance_shifts` avec `line_ids` issus du planning + `shift_team_id`, `shift_type` (mappé depuis `template_code`), `heure_debut/heure_fin`, `opened_by`, observation `[Ouverture auto rotation équipe]`, et journalise dans `audit_logs`.
- **Qualité** : si rôle `controleur_qualite`, idem via `get_scope_shift_context(uid,'quality')` → insère dans `quality_shifts`, puis crée les liens `quality_shift_lines` à partir des `line_ids` du planning ; journalise.
- **Production** : aucune action (ouverture manuelle conservée).
- Anti-doublon : ne rouvre pas si une session active existe déjà pour l'utilisateur dans la table concernée.
- **Type de retour** : passe de `uuid` à `jsonb` (`{ "maintenance": <uuid|null>, "quality": <uuid|null> }`) pour refléter l'ouverture multi-scope. Utilise `has_role()` pour les contrôles de rôle.

## Modifications front-end
- `src/hooks/useAutoOpenWorkSession.ts` : inchangé sur le principe (appelle la RPC une fois par session) ; déclenche `onOpened()` si le `jsonb` retourné contient au moins une session ouverte.
- `src/integrations/supabase/types.ts` : régénéré automatiquement après la migration (nouvelle signature de la RPC).
- Aucune modification UI : `RespShiftConsole` et `SelfOpenShiftDialog` restent les voies manuelles, et la production reste pilotée par l'OF.

## Détails techniques
- Mapping `template_code` → `shift_type` : `matin→matin`, `soir|midi→apres_midi`, `nuit→nuit`, défaut `matin`.
- `maintenance_shifts.line_ids` est `NOT NULL DEFAULT '{}'` → on passe le tableau du planning (vide accepté).
- `quality_shifts` n'a pas de colonne lignes : les lignes vont dans `quality_shift_lines`.
- Toutes les ouvertures restent conditionnées par `is_on_shift OR autorisation_libre`, cohérent avec le garde On-Shift (`is_user_on_shift` / `useOnShiftGuard`).

## Vérification
- Tests SQL manuels : simuler un membre `maintenancier` On-Shift → une `maintenance_shifts` créée avec les bonnes lignes ; un `controleur_qualite` On-Shift → `quality_shifts` + `quality_shift_lines` ; hors créneau sans autorisation libre → rien.
- `npx vitest run` pour s'assurer de l'absence de régression.
