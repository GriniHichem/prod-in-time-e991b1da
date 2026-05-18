# Audit du système de scan QR / code-barres

## Bugs identifiés

### B1 — RPC `resolve_scanned_code` : prefix fallback déclenché à tort (HIGH)
Dans la migration, après les 4 blocs `RETURN QUERY` (pdr, machine, equipement, organe) de l'étape "exact match", le code fait :
```
GET DIAGNOSTICS found_any = ROW_COUNT;
IF found_any THEN RETURN; END IF;
```
`GET DIAGNOSTICS ROW_COUNT` ne reflète que **le dernier `RETURN QUERY`** (organes). Conséquence : si un scan correspond exactement à une PDR (ou machine, ou équipement) mais qu'aucun organe ne matche, `found_any = false` → la phase "prefix" s'exécute et renvoie en plus des correspondances approchantes parasites. L'auto-sélection (`isAutoSelectable` requiert 1 seul résultat) tombe alors en désambiguïsation inutile.

**Fix** : utiliser une variable cumulative.
```sql
DECLARE total_found integer := 0;
...
-- après chaque RETURN QUERY exact :
GET DIAGNOSTICS found_any = ROW_COUNT;
total_found := total_found + found_any;
...
IF total_found > 0 THEN RETURN; END IF;
```

### B2 — Prefix SQL ignore la normalisation (MED)
L'étape exact compare aussi `qn` (sans accents/séparateurs) mais l'étape prefix utilise uniquement `q` (lowercased brut). Un scan "ABC-123" ne matchera pas en préfixe une référence stockée "abc123". **Fix** : ajouter `regexp_replace(lower(unaccent(coalesce(col,''))), '[\s\-_/\\]+', '', 'g') LIKE qn || '%'` aux `WHERE` du bloc prefix.

### B3 — `ExternalIdsCard` enregistre la mauvaise valeur lors de l'enrôlement QR (MED)
Le bouton "Scanner" à côté des champs `qr_code` / `code_barres` sert à **enrôler** la valeur lue sur la fiche (Machine/PDR/Organe/Équipement). Or si le QR scanné correspond déjà à une entité existante, `ScannerDialog` appelle `onResolved` avec `r.code` (= référence/désignation de l'entité retrouvée), pas la valeur brute du QR. Le champ se remplit alors avec la mauvaise chaîne et duplique l'ID d'une autre fiche.

**Fix** : dans `ExternalIdsCard`, ne pas passer `onResolved` pour les boutons d'enrôlement, garder uniquement `onRawValue`, et basculer `ScannerDialog` pour appeler `onRawValue` au lieu d'auto-résoudre quand `onResolved` n'est pas fourni. Côté `ScannerDialog`, traiter le cas `onResolved` absent → écrire la valeur brute du scan dans le champ via `onRawValue(raw)` sans passer par le RPC.

### B4 — `useScanner` relance la caméra à chaque changement de `deviceId` interne (MED)
L'effet a `[enabled, deviceId]` en deps et appelle `setDeviceId(chosen)` **à l'intérieur** quand `chosen !== deviceId`. Cela ré-exécute tout l'effet : nouvelle `getUserMedia()` (re-prompt permission sur certains navigateurs), nouvelle énumération, nouveau `decodeFromVideoDevice`. On voit parfois la caméra clignoter ou un délai de 1–2s avant lecture stable.

**Fix** : à l'initialisation, calculer `chosen` localement et le passer directement à ZXing **sans** appeler `setDeviceId` pour le défaut. N'utiliser `setDeviceId` que pour les changements explicites de l'utilisateur via le `<Select>` (ce qui doit alors relancer l'effet — comportement souhaité).

### B5 — Auto-sélection silencieuse sur URL avec UUID invalide / entité supprimée (LOW)
Si le QR contient `/pdr/<uuid>` mais que l'entité a été supprimée, le RPC ne retourne rien pour l'URL et retombe sur exact/prefix avec `q` = pathname (ex: `/pdr/abc…`), ce qui ne matche rien. Résultat : "Aucune entité trouvée". Le toast manque de contexte (URL invalide vs code inconnu).

**Fix mineur** : dans `ScannerDialog`, quand `rows.length === 0` et que la valeur brute ressemble à une URL de l'app, afficher un message dédié ("Entité supprimée ou introuvable").

### B6 — `match_quality='url'` mais `matched_field='url'` (cosmétique LOW)
L'UI affiche "via url" alors que l'utilisateur attend "via QR". Renommer `matched_field` en `'qr_code'` pour la branche URL (cohérent avec l'origine du payload).

### B7 — `pushHistory` peut grossir avec entrées invalides (LOW)
Pas de validation au `JSON.parse` ; un payload sessionStorage corrompu (autre onglet/app) plante silencieusement. Ajouter un filtre `typeof r?.entity_id === 'string'`.

## Plan d'implémentation

1. **Migration SQL** : recréer `public.resolve_scanned_code` avec compteur cumulatif (B1), normalisation prefix (B2), `matched_field='qr_code'` pour la branche URL (B6).
2. **`src/components/scanner/ScannerDialog.tsx`** : 
   - Ajouter mode "enrôlement" : si `onResolved` non fourni OU prop `mode="enroll"`, ne pas appeler le RPC, juste émettre `onRawValue(raw)` et fermer.
   - Améliorer le message d'erreur URL invalide (B5).
   - Durcir `readHistory` (B7).
3. **`src/components/scanner/ScanButton.tsx`** : exposer `enrollMode?: boolean` propagé au dialog.
4. **`src/components/scanner/ExternalIdsCard.tsx`** : passer `enrollMode` + retirer `onResolved` sur les boutons QR/code-barres (B3).
5. **`src/hooks/useScanner.ts`** : refacto pour éviter le re-render via `setDeviceId` au démarrage (B4) ; conserver le changement manuel via select.
6. **Tests** : étendre `src/test/scanner/resolve.test.ts` avec un cas multi-RETURN QUERY (pdr exact + 0 organe) qui ne doit pas déclencher prefix, et un test du mode enrôlement.

## Détails techniques

- Aucune table modifiée, juste la fonction RPC (DROP + CREATE OR REPLACE).
- Aucun changement de signature côté client (`MatchQuality` reste identique).
- Le mode enrôlement court-circuite `resolveScannedCode` → pas d'aller-retour réseau, plus rapide.
- Compatibilité ascendante : tous les appelants existants (`ListScanButton`, `InventoryCountScreen`) passent `onResolved` → comportement inchangé. Seul `ExternalIdsCard` bascule en enrôlement.
