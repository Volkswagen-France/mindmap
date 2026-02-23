# Mind Mapping Web App

Webapp locale de mind mapping, sans build ni dependances externes.

## Fonctionnalites robustes

1. Undo/Redo avec historique borne (boutons + raccourcis clavier)
2. Autosave periodique + snapshots versionnes en localStorage
3. Panneau de snapshots (liste datee, restauration, suppression unitaire ou totale)
4. Validation stricte du JSON (IDs, references, cycles, structures)
5. Gestion des liens: selection, suppression, changement de type
6. Recherche de noeuds + navigation resultat suivant/precedent + centrage
7. UX clavier: creation, suppression, save/load, recherche, mode lien
8. Auto-layout: horizontal, vertical, radial
9. Exports avances: region, echelle, DPI, fond transparent, PNG/SVG
10. Rendu robuste: zoom/pan, render via requestAnimationFrame, interactions plus fluides
11. Edition inline du titre par double-clic sur un noeud
12. Tests Node pour validation/layout/history

## Lancer en local

```bash
cd /Users/sylvain.lenoir/Desktop/Map
python3 -m http.server 8080
```

Ouvrir [http://localhost:8080](http://localhost:8080).

## Lancer les tests

```bash
cd /Users/sylvain.lenoir/Desktop/Map
node tests.js
```

## Raccourcis clavier

- `N`: creer un noeud racine
- `Tab`: creer un enfant du noeud selectionne
- `L`: activer/desactiver le mode lien
- `Delete` / `Backspace`: supprimer la selection
- `Ctrl/Cmd + Z`: undo
- `Ctrl/Cmd + Shift + Z` ou `Ctrl/Cmd + Y`: redo
- `Ctrl/Cmd + S`: sauvegarde immediate
- `Ctrl/Cmd + F`: focus recherche
- `Double-clic` sur un noeud: renommer inline (`Enter` valide, `Escape` annule)

## Fichiers

- `/Users/sylvain.lenoir/Desktop/Map/index.html`
- `/Users/sylvain.lenoir/Desktop/Map/styles.css`
- `/Users/sylvain.lenoir/Desktop/Map/core.js`
- `/Users/sylvain.lenoir/Desktop/Map/script.js`
- `/Users/sylvain.lenoir/Desktop/Map/tests.js`
