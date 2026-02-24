# Architecture (V2)

Ce document sert de repère pour itérer sans réintroduire les régressions.

## Modules

- `core.js`: validations, layouts, historique.
- `persist-utils.js`: clés de stockage + logs de persistance.
- `group-utils.js`: géométrie groupe/sélection (helpers purs).
- `group-state.js`: résolution des états actifs (groupe, layout, forme).
- `group-actions.js`: actions métiers groupe/traits (scope, presets, labels).
- `group-interactions.js`: interactions utilisateur (drag groupe, rectangle sélection, bindings UI groupe).
- `group-render.js`: rendu visuel groupe/sélection.
- `script.js`: orchestration globale app + intégration modules + realtime + export/import.

## Règles de maintenance

- Ajouter d'abord les helpers **purs** dans un module dédié, puis brancher `script.js` avec fallback.
- Éviter d'ajouter de la logique métier UI directement dans les listeners si elle peut être isolée.
- Toute logique de scope de groupe (layout/traits/sélection) doit passer par un utilitaire partagé.
- Quand un état actif est ambigu (global vs groupe), utiliser les résolveurs de `group-state.js`.

## Check de régression rapide

1. `node --check script.js`
2. `node tests.js`
3. Vérif manuelle:
   - sélectionner groupe A puis B: état actif disposition + style de trait correct
   - appliquer disposition sur groupe A: groupe B inchangé
   - appliquer forme de trait sur groupe A: groupe B inchangé
   - refresh: groupes toujours présents

