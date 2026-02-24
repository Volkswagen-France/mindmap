# Mind Mapping Web App

Webapp locale de mind mapping, sans build ni dependances externes.

## GitHub Pages + persistance

- Oui, l'app fonctionne sur GitHub Pages (site statique).
- En local pur (IndexedDB/localStorage), si l'utilisateur vide ses donnees navigateur, les projets locaux sont perdus.
- Avec Supabase active, les projets sont synchronises dans le cloud et recuperables meme apres nettoyage du cache.

## Fonctionnalites robustes

1. Undo/Redo avec historique borne (boutons + raccourcis clavier)
2. Autosave periodique (IndexedDB local + localStorage de secours)
3. Validation stricte du JSON (IDs, references, cycles, structures)
4. Gestion des liens: selection, suppression, styles
5. UX clavier: creation, suppression, save/load, mode lien
6. Auto-layout: horizontal, vertical, radial
7. Exports avances: region, echelle, DPI, fond transparent, PNG/SVG
8. Rendu robuste: zoom/pan, render via requestAnimationFrame, interactions fluides
9. Edition inline du titre par double-clic sur un noeud
10. Menu contextuel sur noeud (actions + style + presets)
11. Multi-projets (creer/renommer/supprimer/changer)
12. Sync cloud optionnelle via Supabase (workspace partage)
13. Tests Node pour validation/layout/history

## Configuration Supabase (optionnel)

1. Cree une table `mindmap_projects` dans Supabase:

```sql
create table if not exists public.mindmap_projects (
  workspace_id text not null,
  project_id text not null,
  name text not null,
  graph jsonb not null,
  preferred_layout text not null default 'horizontal',
  default_edge_shape text not null default 'arrondi',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, project_id)
);
```

2. Active les policies RLS selon ton niveau de securite equipe.
3. Dans `index.html`, ajoute avant `script.js`:

```html
<script>
  window.APP_CONFIG = {
    supabaseUrl: "https://TON-PROJET.supabase.co",
    supabaseAnonKey: "TON_ANON_KEY",
    workspaceId: "equipe-france"
  };
</script>
```

Sans `APP_CONFIG`, l'app reste en mode local uniquement.

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

Pour la structure modulaire et les regles de maintenance, voir `ARCHITECTURE.md`.

## Raccourcis clavier

- `N`: creer un noeud racine
- `Tab`: creer un enfant du noeud selectionne
- `L`: activer/desactiver le mode lien
- `Delete` / `Backspace`: supprimer la selection
- `Ctrl/Cmd + Z`: undo
- `Ctrl/Cmd + Shift + Z` ou `Ctrl/Cmd + Y`: redo
- `Ctrl/Cmd + S`: sauvegarde immediate
- `Double-clic` sur un noeud: renommer inline (`Enter` valide, `Escape` annule)

## Fichiers

- `/Users/sylvain.lenoir/Desktop/Map/index.html`
- `/Users/sylvain.lenoir/Desktop/Map/styles.css`
- `/Users/sylvain.lenoir/Desktop/Map/core.js`
- `/Users/sylvain.lenoir/Desktop/Map/persist-utils.js`
- `/Users/sylvain.lenoir/Desktop/Map/group-utils.js`
- `/Users/sylvain.lenoir/Desktop/Map/group-state.js`
- `/Users/sylvain.lenoir/Desktop/Map/group-actions.js`
- `/Users/sylvain.lenoir/Desktop/Map/group-interactions.js`
- `/Users/sylvain.lenoir/Desktop/Map/group-render.js`
- `/Users/sylvain.lenoir/Desktop/Map/script.js`
- `/Users/sylvain.lenoir/Desktop/Map/tests.js`
