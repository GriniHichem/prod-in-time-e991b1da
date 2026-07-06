# Corriger l'affichage du bilan de shift (console responsable)

## Problème

Dans `src/components/shift/ShiftSummaryDialog.tsx`, l'aperçu à l'écran et la version imprimée partagent **le même bloc HTML brut** (`<h1>`, `<h2>`, `<table>`, `<div class="totals">`…). Ce HTML n'est stylé que par le CSS injecté dans la fenêtre d'impression. À l'écran, dans le Dialog, ces balises n'ont aucun style (Tailwind neutralise les styles par défaut) → titres minuscules, tableau sans bordures, cartes d'indicateurs cassées. D'où le rendu « catastrophique ».

## Solution

Séparer clairement les deux rendus :
- **Écran** : un vrai rendu React stylé avec les tokens du design system (cartes, badges, listes lisibles, responsive).
- **Impression** : garder une fonction qui génère le HTML simple actuel (inchangé), uniquement pour `window.print`.

Aucune logique de données ni requête n'est modifiée — uniquement la présentation.

## Changements — `ShiftSummaryDialog.tsx`

1. **Extraire le HTML d'impression** dans une fonction pure `buildPrintableHtml(data, session, kind)` qui retourne la chaîne HTML actuelle (mêmes balises + même `<style>`). `handlePrint` l'utilise directement au lieu de lire le DOM via `getElementById`.

2. **Nouveau rendu écran** (remplace le `<div id="shift-summary-printable">`), avec les tokens sémantiques existants :
   - **En-tête méta** : opérateur, date, créneau, équipe, début/fin affichés en grille de petites paires label/valeur (`text-muted-foreground` + valeur en `font-medium`).
   - **Indicateurs** : grille responsive de cartes (`rounded-lg border bg-card p-3`), label en petit `uppercase text-muted-foreground`, valeur en `text-2xl font-bold`. Mise en évidence douce pour les valeurs critiques (ex. non-conformes > 0 en `text-destructive`).
   - **Journal** : liste de lignes `rounded-md border bg-card` (au lieu d'un `<table>` brut) : heure en `tabular-nums`, `Badge` pour le type d'événement, libellé, détail en `text-sm text-muted-foreground` ; état vide géré proprement.
   - **Observations** : bloc `whitespace-pre-wrap` dans une carte si présent.
   - Le tout scrollable dans le `DialogContent` déjà en `max-h-[85vh] overflow-y-auto`.

3. **Bouton Imprimer** conservé dans le header du dialog ; il appelle `handlePrint` (ouvre la fenêtre, écrit `buildPrintableHtml(...)`, `print()`). La version imprimée reste volontairement simple et identique à l'actuelle.

4. Conserver l'état `loading` (spinner) et la structure `BilanData` inchangés. S'applique aux trois `kind` (production / maintenance / quality) puisque le composant est partagé.

## Détails techniques

- Aucun changement de props, de types, ni d'appels Supabase.
- Retrait de la dépendance à `document.getElementById("shift-summary-printable")` (le HardCoded id n'est plus nécessaire).
- Vérification : `tsgo --noEmit`, puis contrôle visuel du dialog dans la console responsable qualité (`/qualite/shift` → bouton « Bilan ») et test du bouton Imprimer.
