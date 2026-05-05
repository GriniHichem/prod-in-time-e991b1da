## Objectif

Permettre à un **admin** de choisir un utilisateur depuis la barre de navigation et de **voir l'app comme cet utilisateur** (mêmes menus, mêmes permissions, mêmes accès) sans changer de session. C'est un **mode aperçu / bac à sable** : aucune action effectuée n'est réellement appliquée — toutes les écritures sont bloquées et les données saisies sont temporaires.

## Comportement attendu

1. Bouton **"Voir comme"** dans la topbar, visible uniquement si `hasRole('admin')`.
2. Dialog de sélection d'utilisateur (recherche par nom / email / rôle, liste depuis `profiles` + `user_roles`).
3. Après sélection : un **bandeau orange persistant** en haut de l'écran indique
   `Mode aperçu — Vous voyez comme {Nom} ({rôle}). Aucune modification n'est enregistrée.` avec bouton **"Quitter le mode aperçu"**.
4. Toute la navigation, les menus (Apps, Maintenance, Production, Qualité, Inventaire, Configuration) et les boutons d'action utilisent les rôles + permissions de l'utilisateur cible.
5. Toutes les **mutations Supabase** (insert/update/delete + `functions.invoke`) sont **interceptées et bloquées** avec un toast "Mode aperçu : action non enregistrée". Les lectures restent normales.
6. L'état d'aperçu est stocké en `sessionStorage` (perdu à la fermeture d'onglet) — jamais en base.

## Implémentation technique

### 1. Nouveau contexte `ImpersonationContext`
Fichier : `src/contexts/ImpersonationContext.tsx`
- État : `{ targetUserId, targetProfile, targetRoles } | null`
- Méthodes : `startImpersonation(userId)`, `stopImpersonation()`
- Charge `profiles` + `user_roles` du user cible quand activé.
- Persiste dans `sessionStorage` (clé `impersonation_target`).

### 2. Adapter `useAuth` et `usePermissions`
- `AuthContext` : exposer `effectiveRoles` et `effectiveProfile` calculés ainsi :
  - si impersonation active → roles/profile du cible
  - sinon → roles/profile réels
- Garder `roles` réels accessibles séparément (`realRoles`) pour la check admin.
- `hasRole()` utilise `effectiveRoles`.
- `usePermissions` consomme déjà `roles` via `useAuth` → fonctionne automatiquement.

### 3. Garde-fou écritures (read-only sandbox)
Fichier : `src/lib/impersonationGuard.ts`
- Wrapper qui patche `supabase.from(...).insert/update/delete/upsert` et `supabase.functions.invoke` quand impersonation active.
- Retourne `{ data: null, error: { message: 'Mode aperçu' } }` + déclenche `toast.warning("Mode aperçu : action non enregistrée")`.
- Activé/désactivé via le contexte.

### 4. UI Topbar
Dans `src/components/gmao/AppTopBar.tsx` :
- Ajouter un bouton `Voir comme` (icône `Eye`) entre Search et NotificationBell, visible si `realRoles.includes('admin')`.
- Ouvre `<ImpersonationDialog />` (nouveau composant).
- Si impersonation active : afficher avatar + nom du user cible avec badge orange "APERÇU" et bouton X.

### 5. Dialog de sélection
Fichier : `src/components/admin/ImpersonationDialog.tsx`
- Liste paginée + champ recherche.
- Requête : `profiles` joint avec `user_roles` (groupé), exclut l'admin courant.
- Affiche : avatar / nom / email / liste des rôles.
- Clic → `startImpersonation(userId)` + ferme + redirige `/apps`.

### 6. Bandeau global
Fichier : `src/components/admin/ImpersonationBanner.tsx`
- Monté dans `AppLayout` au-dessus de la topbar.
- Sticky, fond orange (`bg-orange-500/15` + bordure), texte explicite + bouton "Quitter le mode aperçu".

### 7. Branchement
- `App.tsx` : envelopper l'app avec `<ImpersonationProvider>` (à l'intérieur de `<AuthProvider>`).
- `AppLayout` : insérer `<ImpersonationBanner />`.
- `Apps.tsx` et `usePermissions` continuent de fonctionner sans changement (ils lisent `roles` du contexte).

## Sécurité

- **Côté serveur** rien ne change : RLS reste basée sur le vrai `auth.uid()`. L'impersonation est purement visuelle/UI.
- Le garde-fou bloque les écritures côté client pour éviter qu'un admin modifie quelque chose en pensant être en mode aperçu.
- Cette approche n'est pas une véritable impersonation auth (qui exigerait un edge function avec service role + signature) — c'est un mode aperçu UX, ce qui correspond exactement à la demande.

## Fichiers

Créés :
- `src/contexts/ImpersonationContext.tsx`
- `src/lib/impersonationGuard.ts`
- `src/components/admin/ImpersonationDialog.tsx`
- `src/components/admin/ImpersonationBanner.tsx`

Modifiés :
- `src/contexts/AuthContext.tsx` (effectiveRoles/Profile + realRoles)
- `src/components/gmao/AppTopBar.tsx` (bouton "Voir comme" + indicateur)
- `src/components/gmao/AppLayout.tsx` (bandeau)
- `src/App.tsx` (provider)
