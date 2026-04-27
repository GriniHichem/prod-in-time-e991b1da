## Module Notifications avancées

Système centralisé in-app : table `notifications` + règles configurables + préférences utilisateur + cloche dans la topbar + page `/notifications` + page `/parametres/notifications`. Déclencheurs métier branchés sur les mutations existantes, anti-doublon par `deduplication_key`, traçabilité dans le module Audit.

Email/Push : structure prête mais pas d'envoi réel dans cette itération (canal `in_app` opérationnel, autres flags persistés mais ignorés).

---

### 1. Schéma DB (migration)

**Enum** `notification_severity`: info, low, medium, high, critical
**Enum** `notification_status`: unread, read, archived
**Enum** `notification_frequency`: immediate, grouped_hourly, grouped_daily

**Table `notifications`** (tous les champs demandés) + colonnes techniques :
- `deduplication_key text` (indexée), `group_key text`, `rule_id uuid` (nullable)
- `is_critical boolean default false` (notifications non masquables par préférences)
- Contrainte logique : au moins un de `recipient_user_id` ou `recipient_role` non null
- Indexes : `created_at desc`, `recipient_user_id`, `recipient_role`, `module`, `notification_type`, `severity`, `status`, `(entity_type, entity_id)`, `deduplication_key`
- RLS :
  - SELECT : `recipient_user_id = auth.uid()` OU (`recipient_role` ∈ rôles utilisateur via `has_role`) OU `has_role(admin/responsable_si)` OU `check_permission(uid,'notifications','view_all')`
  - UPDATE (mark read/archive) : seul le destinataire ou admin
  - INSERT : authenticated (les déclencheurs côté client tournent sous l'utilisateur acteur)
  - DELETE : admin uniquement

**Table `notification_rules`** : tous les champs demandés. RLS : SELECT authenticated, ALL réservé `admin`, `responsable_si`, et selon module à `resp_maintenance`/`resp_production` (fonction `can_manage_notification_rule(uid, module)`).

**Table `user_notification_preferences`** : tous les champs demandés. RLS : un user gère ses propres prefs ; admin peut lire toutes.

**Module permission `notifications`** ajouté dans `role_permissions` avec mapping :
- view → `notifications.view_own`
- create → `notifications.configure_rules`
- edit → `notifications.manage_preferences` (toutes prefs) / `mark_read` / `archive`
- delete → `notifications.view_all`

**Fonction RPC `get_notifications_for_user(_uid)`** SECURITY DEFINER : renvoie notifications dont le user est destinataire direct ou via rôle, en respectant les préférences `muted` / `minimum_severity` (sauf `is_critical=true`).

**Données par défaut** : 10 règles seed (PDR rupture, PDR critique, machine_down, ticket_created, preventive_late, of_completed, production_stop_created ≥30min, consumption_correction, user_role_changed, audit_critical_event) — toutes actives, canal `in_app`.

---

### 2. Logique applicative

**`src/lib/notifications.ts`** :
- Types `NotificationType`, `NotificationModule`, `NotificationSeverity`, `NotificationChannel`
- `triggerNotification(event)` :
  1. Charge les `notification_rules` actives pour `module` + `event_type`
  2. Évalue les `conditions` JSONB (moteur simple : opérateurs `eq`, `lte`, `gte`, `in`, `gt`, `lt` sur champs de `event.data`)
  3. Calcule destinataires : `target_roles` ∪ `target_users` − `excluded_users`
  4. Calcule `deduplication_key` (template par event_type, ex `pdr_stock_out:{pdr_id}`)
  5. Anti-doublon : skip si une notification avec même `deduplication_key` existe dans la fenêtre :
     - immediate → 5 min
     - grouped_hourly → 1 h (incrémente compteur dans `metadata.count`)
     - grouped_daily → 24 h
  6. Insert N lignes (une par destinataire user/role) avec `action_url` calculée (helper `buildEntityUrl`)
  7. Marque `is_critical=true` si severity = critical et règle marquée critique
- `markRead(id)`, `markAllRead()`, `archive(id)`, `getUnreadCount()`
- Hook `useNotifications({ filters, page })` (React Query, refetch 30s)
- Hook `useUnreadNotifications()` pour la cloche (limit 10, refetch 30s, realtime via Supabase channel sur insert)

**Helper conditions** : moteur déterministe, pas de `eval`. Schéma JSON :
```json
{ "all": [ {"field":"duration_minutes","op":"gte","value":30} ] }
```

**Realtime** : `ALTER PUBLICATION supabase_realtime ADD TABLE notifications;` pour push instantané dans la cloche.

---

### 3. Déclencheurs métier (Phase 1)

Ajout d'appels `triggerNotification(...)` après mutations réussies, en parallèle des `logAudit` existants :

| Module | Mutation | event_type | Sévérité |
|---|---|---|---|
| pdr_stock | mouvement provoquant `stock_actuel <= 0` | `pdr_stock_out` | critical |
| pdr_stock | mouvement → `stock_actuel <= stock_min` | `pdr_stock_critical` | high |
| machines | UPDATE statut → `en_panne` (machine critique) | `machine_down` | critical |
| tickets | INSERT | `ticket_created` | medium |
| tickets | UPDATE statut → résolu/fermé | `ticket_resolved`/`ticket_closed` | info |
| preventif | (cron logique côté query) plan échu | `preventive_late` | high |
| of | INSERT/UPDATE statut→termine | `of_created`/`of_completed` | info |
| arrets | INSERT avec `duration_minutes ≥ 30` | `production_stop_created` | high |
| consommations | correction | `consumption_correction` | medium |
| users/roles | ajout/suppression rôle | `user_role_changed` | critical |
| audit | logAudit avec severity=critical | `audit_critical_event` | critical |

`preventive_late` : pas de cron (hors périmètre Lovable) → vérifié à la demande dans un hook `usePreventiveLateChecker` exécuté au chargement du dashboard maintenance et de `/notifications`, avec dédup quotidienne par `plan_id`.

---

### 4. UI

**Cloche `NotificationBell`** (remplace le bouton actuel ligne 287-290 de `AppTopBar.tsx`) :
- Badge nombre non lus (rouge si > 0, animate-pulse si critical)
- Popover (Radix) ouvrant la liste des 10 dernières non lues
- Chaque item : icône module, titre, message court, badge sévérité, timestamp relatif
- Click item → mark read + navigate(`action_url`)
- Footer : « Tout marquer comme lu » + « Voir tout » → `/notifications`

**Page `/notifications`** (`src/pages/NotificationsPage.tsx`) :
- 8 KPI cards (Total, Non lues, Critiques, Aujourd'hui, PDR, Maintenance, Production, Sécurité)
- Filtres avancés (période, statut, module, type, sévérité, destinataire, rôle, entité, recherche texte) + bouton Réinitialiser (icône `RotateCcw` selon convention UI)
- Table paginée serveur (20/page) avec skeleton loader, badges colorés, actions inline (mark read, archiver, ouvrir)
- Sheet de détail (réutilise pattern `AuditDetailSheet`) : tous les champs + bouton « Ouvrir l'entité liée » via `useNavWithFrom`
- Bouton « Configurer les règles » visible si `check_permission(uid,'notifications','create')`

**Page `/parametres/notifications`** (`src/pages/parametres/NotificationRulesAdmin.tsx`) :
- Liste des règles avec toggle actif/inactif inline
- Dialog Create/Edit : nom, description, module (select), event_type (select dépendant du module), sévérité, rôles cibles (multi), users cibles/exclus (multi via `usersAdminQuery`), canaux (checkboxes), fréquence (radio), quiet hours (time inputs), conditions (éditeur JSON simple avec validation + preview lisible)
- Actions create/update/delete/toggle → `logAudit` module=`notifications` action_type=`permission_change`/`update`

**Carte « Notifications » ajoutée dans `Parametres.tsx`** (groupe « Sécurité & Accès »).

**Préférences utilisateur** : section ajoutée dans le menu utilisateur `AppTopBar` (entrée « Mes notifications » → Sheet rapide pour toggle muted par module + minimum_severity).

---

### 5. Intégration Audit

Chaque action sur règles ou notification critique appelle `logAudit` :
- `notification_rule_create/update/delete/toggle` → module=`notifications`, severity=`medium`
- Archivage notification critique → `delete` + severity=`high`

Dans `logAudit`, après insert si `severity=critical` → `triggerNotification({ event_type: 'audit_critical_event', ... })` (sans récursion, on n'audit pas l'envoi de la notification d'audit).

---

### 6. Fichiers

**Migrations** :
- `supabase/migrations/{ts}_notifications_schema.sql` (tables, enums, indexes, RLS, fonction RPC, realtime publication)
- `supabase/migrations/{ts}_notifications_default_rules.sql` (10 règles seed via INSERT)

**Code créé** :
- `src/lib/notifications.ts` (logique trigger, conditions engine, dédup, helpers URL)
- `src/hooks/useNotifications.ts`, `src/hooks/useUnreadNotifications.ts`
- `src/components/notifications/NotificationBell.tsx`
- `src/components/notifications/NotificationItem.tsx`
- `src/components/notifications/NotificationDetailSheet.tsx`
- `src/components/notifications/NotificationFilters.tsx`
- `src/components/notifications/NotificationKpiCards.tsx`
- `src/components/notifications/UserPreferencesSheet.tsx`
- `src/pages/NotificationsPage.tsx`
- `src/pages/parametres/NotificationRulesAdmin.tsx`
- `src/components/notifications/RuleEditorDialog.tsx`
- `src/components/notifications/ConditionsEditor.tsx`

**Code modifié** :
- `src/App.tsx` : routes `/notifications` et `/parametres/notifications`
- `src/components/gmao/AppTopBar.tsx` : remplacement bouton cloche + entrée menu user
- `src/pages/Parametres.tsx` : carte « Notifications »
- `src/lib/audit.ts` : hook automatique `audit_critical_event`
- Pages CRUD critiques (Phase 1) : injection `triggerNotification` aux endroits ciblés (TicketDetail, PdrDetail mouvements stock, MachineForm/Detail status_change, OfDetail, StopsPage, ConsumptionPage, UsersAdmin role change)

**Mémoires à mettre à jour après build** :
- Nouvelle fiche `mem://features/notifications-system`
- Mise à jour `mem://auth/rbac-permissions` (module `notifications` + 6 actions)
- Mise à jour `mem://tech/architecture-security` (référence triggerNotification)

---

### Hors périmètre (à demander explicitement plus tard)

- Envoi email réel (utilisera `supabase/functions/send-email` existant)
- Push notifications navigateur (Service Worker + VAPID)
- Cron pour préventifs en retard (vérification déclenchée à la demande pour le moment)
- Digest groupé envoyé à heure fixe (groupage stocké, mais consultable uniquement in-app)
