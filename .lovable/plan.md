## Objectif

Faire apparaître **"Sécurité & Accès" comme un module unique** dans la page Configuration (Paramètres), au lieu d'une liste de 7 cartes éparpillées. Une seule carte qui ouvre directement le hub centralisé `/parametres/access-control`.

## Changement

Dans `src/pages/Parametres.tsx`, le groupe "Sécurité & Accès" actuel contient 7 cartes :
- Sécurité, Rôles & Accès (Hub)
- Utilisateurs
- Matrice des rôles
- Permissions documents
- Permissions PDR & Stock
- Notifications
- Validations

→ Sera remplacé par **une seule carte** :

- **Sécurité & Accès** (icône ShieldCheck) — Description : "Module unifié : utilisateurs, rôles & rôles personnalisés, matrice des permissions, droits documents, droits PDR & Stock, droits Qualité granulaires, workflows de validation, règles de notifications, audit configurable par rôle, interrupteurs globaux du système, export pour self-hosting" → vers `/parametres/access-control`

## Garanties

- Toutes les sous-fonctionnalités restent accessibles via les onglets du hub (déjà en place)
- Les routes anciennes (`/parametres/users`, `/parametres/roles`, `/parametres/document-permissions`, `/parametres/pdr-stock-permissions`, `/parametres/notifications`, `/parametres/validations`) restent fonctionnelles — utiles pour les liens directs et la navigation interne
- Les autres groupes (Référentiels, Production, Configuration générale) ne sont pas touchés
- Aucun changement de DB, aucun changement de logique

## Fichier modifié

- `src/pages/Parametres.tsx` : remplacement du tableau `items` du groupe "Sécurité & Accès" par une carte unique pointant vers `/parametres/access-control`