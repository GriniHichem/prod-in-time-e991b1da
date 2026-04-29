## Objectif

Empêcher l'envoi de saisies invalides depuis mobile/tablette en bloquant les boutons d'action et en affichant des erreurs inline **avant** l'appel Supabase, pour les trois cas critiques :
- **Heure non autorisée** (créneau hors fenêtre de saisie)
- **OF manquant** (déclaration sans Ordre de Fabrication actif)
- **Ticket sans machine** (création de ticket maintenance)

## Constats actuels

Toutes les validations existantes sont **réactives** (toast après clic) et le bouton de soumission reste cliquable. Sur mobile (clic tactile, viewport étroit), cela cause des doubles envois et confusion.

Fichiers concernés :
- `src/pages/gpao/ShiftScreen.tsx` — `handleDeclareProduction` (heure), `handleStartShift` (OF/ligne), `handleCreateTicket` (machine)
- `src/pages/TicketsList.tsx` — `handleCreate` (machine)
- `src/pages/TicketDetail.tsx` — `handleResolve`, `handleTransfer`, `handleRelease`, `handleTakeCharge` (déjà traités précédemment, vérifier la cohérence mobile)

## Modifications

### 1. Schémas Zod centralisés (`src/lib/formValidation.ts` — nouveau)
Créer des schémas réutilisables :
```ts
ticketCreateSchema     → machine_id (uuid requis), description (1..1000 chars trim), priorite enum
productionDeclareSchema → of_id, slot_index (>=0), quantite_produite (>=0), quantite_rebut (>=0)
shiftStartSchema       → team_id, slot_id, of_id, line_id (tous requis)
```
Plus un helper `getFieldError(result, field)` pour l'affichage inline.

### 2. ShiftScreen — Production hourly form
- État local `formErrors` (Record<string,string>).
- À chaque changement de champ : revalider le schéma → `formErrors`.
- **Bouton « Déclarer »** : `disabled` si `selectedHourSlot === null` ou `!canEditSlot(slot)` ou erreurs Zod ou OF manquant.
- Sous chaque champ (créneau, quantité) : `<p className="text-xs text-destructive">…</p>` inline.
- **Banner rouge** persistant en haut du formulaire si :
  - Aucun OF actif → "Sélectionnez un OF pour déclarer la production"
  - Aucun créneau éditable disponible → "Aucune fenêtre horaire ouverte (règle Hour-1)"
- Sur mobile : banner sticky sous le header pour rester visible en scroll.

### 3. ShiftScreen — Start shift form
- Bouton « Démarrer » `disabled` tant que team_id, slot_id, OF, ligne_id ne sont pas tous remplis.
- Erreurs inline sous chaque Select.
- Si OF sans ligne assignée : message rouge **immédiat** sous le sélecteur d'OF (au lieu d'attendre le clic).

### 4. ShiftScreen — Create ticket dialog
- Bouton « Créer ticket » `disabled` si `!ticketMachineId || ticketDescription.trim().length === 0`.
- Compteur de caractères live (max 1000) sur la description.
- Helper text rouge sous le sélecteur Machine si vide.

### 5. TicketsList — Create ticket dialog
- Mêmes règles que §4 + validation Zod (uuid pour machine, description 1..1000).
- Bouton « Créer » désactivé tant que le formulaire est invalide.
- Sur mobile : `ResponsiveDialog` (déjà utilisé) — s'assurer que les messages d'erreur restent visibles au-dessus du clavier virtuel (padding-bottom dynamique).

### 6. UX mobile/tablette
- Touch targets : tous les `Button` de soumission gardent `h-12` (48px conforme thème industriel).
- États visuels : `disabled` → opacité réduite + curseur not-allowed (déjà géré par `Button` shadcn).
- Pas de submit on Enter dans les `Input` mobiles tant que invalide.

### 7. Audit / Tests
- Aucune migration DB.
- Ajouter `src/test/forms/form-validation.test.ts` : couvre les trois schémas Zod (cas valides/invalides).

## Détails techniques

```text
src/lib/formValidation.ts         (NEW)
  ├─ ticketCreateSchema (zod)
  ├─ productionDeclareSchema (zod)
  ├─ shiftStartSchema (zod)
  └─ getFieldError() helper

src/pages/gpao/ShiftScreen.tsx
  ├─ useMemo(declareErrors) → blocks "Déclarer" button
  ├─ useMemo(startShiftErrors) → blocks "Démarrer" button
  ├─ useMemo(ticketErrors) → blocks "Créer ticket" button
  └─ inline <FieldError /> components

src/pages/TicketsList.tsx
  └─ useMemo(createErrors) → blocks "Créer" button + inline errors

src/test/forms/form-validation.test.ts (NEW)
```

## Hors-scope
- Pas de validation backend supplémentaire (RLS et triggers existants suffisent).
- Pas de refonte des dialogs ni des layouts mobiles existants.
- Pas de modification des règles métier (Hour-1, OF status, etc.) — juste leur exposition côté UI.
