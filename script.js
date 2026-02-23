const core = window.MindMapCore;

const STORAGE_KEY = "mindmap-data-v2";
const SNAPSHOT_KEY = "mindmap-snapshots-v2";
const AUTOSAVE_INTERVAL_MS = 12000;
const SNAPSHOT_INTERVAL_MS = 60000;
const SNAPSHOT_LIMIT = 25;
const SNAP_THRESHOLD = 18;

const state = {
  graph: {
    nodes: [],
    edges: [],
    nextId: 1,
  },
  selectedNodeId: null,
  selectedEdgeId: null,
  linkMode: false,
  linkingFrom: null,
  viewport: {
    x: 80,
    y: 80,
    zoom: 1,
  },
  draggingNodeId: null,
  dragOffset: { x: 0, y: 0 },
  isPanning: false,
  panStart: null,
  spacePressed: false,
  renderQueued: false,
  inlineEditNodeId: null,
  lastAutosaveAt: null,
  lastSnapshotAt: 0,
  lastSavedHash: "",
};

const history = core.createHistory(250);

const els = {
  canvas: document.getElementById("canvas"),
  stage: document.getElementById("stage"),
  edges: document.getElementById("edges"),
  nodes: document.getElementById("nodes"),
  nodeTemplate: document.getElementById("node-template"),
  undoBtn: document.getElementById("undo-btn"),
  redoBtn: document.getElementById("redo-btn"),
  addRootBtn: document.getElementById("add-root-btn"),
  addChildBtn: document.getElementById("add-child-btn"),
  linkModeBtn: document.getElementById("link-mode-btn"),
  deleteBtn: document.getElementById("delete-btn"),
  clearBtn: document.getElementById("clear-btn"),
  titleInput: document.getElementById("node-title"),
  textColorInput: document.getElementById("node-text-color"),
  colorInput: document.getElementById("node-color"),
  borderColorInput: document.getElementById("node-border-color"),
  borderWidthInput: document.getElementById("node-border-width"),
  radiusInput: document.getElementById("node-radius"),
  edgeTypeSelect: document.getElementById("edge-type"),
  deleteEdgeBtn: document.getElementById("delete-edge-btn"),
  templateSelect: document.getElementById("template-select"),
  applyTemplateBtn: document.getElementById("apply-template-btn"),
  layoutHorizontalBtn: document.getElementById("layout-horizontal-btn"),
  layoutVerticalBtn: document.getElementById("layout-vertical-btn"),
  layoutRadialBtn: document.getElementById("layout-radial-btn"),
  saveBtn: document.getElementById("save-btn"),
  loadBtn: document.getElementById("load-btn"),
  exportJsonBtn: document.getElementById("export-json-btn"),
  importJsonInput: document.getElementById("import-json-input"),
  refreshSnapshotsBtn: document.getElementById("refresh-snapshots-btn"),
  clearSnapshotsBtn: document.getElementById("clear-snapshots-btn"),
  snapshotsList: document.getElementById("snapshots-list"),
  exportRegion: document.getElementById("export-region"),
  exportScale: document.getElementById("export-scale"),
  exportDpi: document.getElementById("export-dpi"),
  exportTransparent: document.getElementById("export-transparent"),
  exportSvgBtn: document.getElementById("export-svg-btn"),
  exportPngBtn: document.getElementById("export-png-btn"),
  quickActions: document.getElementById("node-quick-actions"),
  qaAddChildBtn: document.getElementById("qa-add-child"),
  qaLinkBtn: document.getElementById("qa-link"),
  qaRenameBtn: document.getElementById("qa-rename"),
  qaDeleteBtn: document.getElementById("qa-delete"),
  emptyState: document.getElementById("empty-state"),
  emptyCreateBtn: document.getElementById("empty-create-btn"),
  emptyTemplateBtn: document.getElementById("empty-template-btn"),
  autosaveStatus: document.getElementById("autosave-status"),
  status: document.getElementById("status"),
};

function graphHash() {
  return JSON.stringify(state.graph);
}

function setStatus(message, isError) {
  els.status.textContent = message || "";
  els.status.style.color = isError ? "#ad2626" : "#5c647f";
}

function traduireErreurValidation(message) {
  if (typeof message !== "string") return "Erreur de validation.";
  return message
    .replace("Payload must be an object.", "Le contenu doit être un objet.")
    .replace("Node at index", "Nœud à l'index")
    .replace("is invalid.", "est invalide.")
    .replace("has no id.", "n'a pas d'identifiant.")
    .replace("Duplicate node id", "Identifiant de nœud dupliqué")
    .replace("has invalid coordinates.", "a des coordonnées invalides.")
    .replace("references unknown parent", "référence un parent inconnu")
    .replace("introduces a parent cycle.", "introduit un cycle parent.")
    .replace("Edge at index", "Lien à l'index")
    .replace("has missing source/target.", "a une source/cible manquante.")
    .replace("is a self-loop.", "est une boucle sur lui-même.")
    .replace("references unknown node.", "référence un nœud inconnu.")
    .replace("Duplicate edge", "Lien dupliqué");
}

function toWorld(clientX, clientY) {
  const rect = els.canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.viewport.x) / state.viewport.zoom,
    y: (clientY - rect.top - state.viewport.y) / state.viewport.zoom,
  };
}

function requestRender() {
  if (state.renderQueued) return;
  state.renderQueued = true;
  window.requestAnimationFrame(() => {
    state.renderQueued = false;
    render();
  });
}

function getNode(id) {
  return state.graph.nodes.find((node) => node.id === id);
}

function getEdge(id) {
  return state.graph.edges.find((edge) => edge.id === id);
}

function magnetiserPositionNoeud(nodeId, x, y) {
  const node = getNode(nodeId);
  if (!node) return { x, y };

  let sx = x;
  let sy = y;

  const parent = node.parentId ? getNode(node.parentId) : null;
  if (parent) {
    const targetX = parent.x + 260;
    if (Math.abs(sx - targetX) <= SNAP_THRESHOLD) {
      sx = targetX;
    }
    if (Math.abs(sy - parent.y) <= SNAP_THRESHOLD) {
      sy = parent.y;
    }

    const fratrie = state.graph.nodes.filter((n) => n.parentId === parent.id && n.id !== node.id);
    for (const sibling of fratrie) {
      if (Math.abs(sy - sibling.y) <= SNAP_THRESHOLD) {
        sy = sibling.y;
        break;
      }
    }
  }

  for (const other of state.graph.nodes) {
    if (other.id === node.id) continue;
    if (Math.abs(sx - other.x) <= SNAP_THRESHOLD) {
      sx = other.x;
    }
    if (Math.abs(sy - other.y) <= SNAP_THRESHOLD) {
      sy = other.y;
    }
  }

  const grille = 30;
  const gx = Math.round(sx / grille) * grille;
  const gy = Math.round(sy / grille) * grille;
  if (Math.abs(sx - gx) <= 10) sx = gx;
  if (Math.abs(sy - gy) <= 10) sy = gy;

  return { x: sx, y: sy };
}

function appliquerStyleParDefaut(node) {
  if (!node) return;
  if (typeof node.textColor !== "string") node.textColor = "#1f2230";
  if (typeof node.borderColor !== "string") node.borderColor = "#5c647f";
  if (!Number.isFinite(node.borderWidth)) node.borderWidth = 2;
  if (!Number.isFinite(node.radius)) node.radius = 14;
}

function computeMapSize() {
  const bounds = core.getBounds(state.graph.nodes);
  return {
    width: Math.max(1600, Math.ceil(bounds.x + bounds.width + 900)),
    height: Math.max(1200, Math.ceil(bounds.y + bounds.height + 900)),
  };
}

function genererTemplate(type) {
  const palette = ["#e9f2ff", "#eafaf0", "#fff4e8", "#f3efff", "#eaf7ff", "#fff0f5"];
  let counter = 1;
  const nodes = [];
  const edges = [];

  function makeNode(title, parentId, depth, index) {
    const id = String(counter++);
    const color = palette[(depth + index) % palette.length];
    nodes.push({
      id,
      x: 0,
      y: 0,
      title,
      color,
      textColor: "#10223f",
      borderColor: "#6f86b2",
      borderWidth: 2,
      radius: 14,
      parentId: parentId || null,
    });
    if (parentId) {
      edges.push({ id: `tree-${parentId}-${id}`, source: parentId, target: id, type: "tree" });
    }
    return id;
  }

  function branch(parentId, depth, titles) {
    const ids = [];
    for (let i = 0; i < titles.length; i += 1) {
      ids.push(makeNode(titles[i], parentId, depth, i));
    }
    return ids;
  }

  if (type === "produit") {
    const root = makeNode("Feuille de route produit", null, 0, 0);
    const pillars = branch(root, 1, ["Vision", "Utilisateur", "Métier", "Technique"]);
    branch(pillars[0], 2, ["Objectifs 12 mois", "Positionnement", "Indicateurs stratégiques"]);
    branch(pillars[1], 2, ["Profils types", "Points de friction", "Besoins à accomplir"]);
    branch(pillars[2], 2, ["Monétisation", "Stratégie marché", "Priorités marché"]);
    branch(pillars[3], 2, ["Architecture", "Dette technique", "Risques"]);
  } else if (type === "sprint") {
    const root = makeNode("Plan de sprint", null, 0, 0);
    const blocks = branch(root, 1, ["Objectif sprint", "Backlog", "Équipe", "Rituels", "Risques"]);
    branch(blocks[0], 2, ["Métrique de succès", "Périmètre", "Hypothèses"]);
    const backlog = branch(blocks[1], 2, ["Tâche A", "Tâche B", "Tâche C", "Tâche D"]);
    branch(backlog[0], 3, ["Critères d'acceptation", "Estimation"]);
    branch(blocks[2], 2, ["Capacité", "Compétences", "Disponibilités"]);
    branch(blocks[3], 2, ["Quotidienne", "Planification", "Revue", "Rétro"]);
    branch(blocks[4], 2, ["Blocages externes", "Dépendances", "Plan de secours"]);
  } else if (type === "reunion") {
    const root = makeNode("Réunion stratégique", null, 0, 0);
    const axes = branch(root, 1, ["Contexte", "Décisions", "Actions", "Suivi"]);
    branch(axes[0], 2, ["Données clés", "Feedback terrain", "Contraintes"]);
    branch(axes[1], 2, ["Option A", "Option B", "Arbitrage"]);
    branch(axes[2], 2, ["Responsables", "Échéances", "Dépendances"]);
    branch(axes[3], 2, ["Prochaine revue", "Métriques", "Risques ouverts"]);
  } else {
    const root = makeNode("Parcours client", null, 0, 0);
    const stages = branch(root, 1, ["Découverte", "Considération", "Décision", "Intégration", "Fidélisation"]);
    branch(stages[0], 2, ["Canaux", "Messages", "Audience"]);
    branch(stages[1], 2, ["Freins", "Preuves", "Comparaison"]);
    branch(stages[2], 2, ["Offre", "Tarification", "Appel à l'action"]);
    branch(stages[3], 2, ["Activation", "Moment déclic", "Support"]);
    branch(stages[4], 2, ["Engagement", "Indice de recommandation", "Montée en gamme"]);
  }

  const graph = { nodes, edges, nextId: counter };
  return core.layoutGraph(graph, "horizontal");
}

function commit(mutator, label) {
  const before = core.cloneGraph(state.graph);
  mutator();
  const validated = core.validateAndNormalizeData(state.graph);
  if (!validated.ok) {
    state.graph = before;
    setStatus(`Action refusée : ${traduireErreurValidation(validated.errors[0])}`, true);
    requestRender();
    return false;
  }
  state.graph = validated.data;

  const changed = JSON.stringify(before) !== JSON.stringify(state.graph);
  if (!changed) return false;

  history.push(before);
  setStatus(label || "Mis à jour", false);
  requestRender();
  return true;
}

function applyGraph(nextGraph, label) {
  const validated = core.validateAndNormalizeData(nextGraph);
  if (!validated.ok) {
    setStatus(`Carte invalide : ${traduireErreurValidation(validated.errors[0])}`, true);
    return false;
  }
  state.graph = validated.data;
  state.selectedNodeId = state.graph.nodes[0] ? state.graph.nodes[0].id : null;
  state.selectedEdgeId = null;
  state.linkingFrom = null;
  setStatus(label || "Chargé", false);
  requestRender();
  return true;
}

function selectNode(id) {
  state.selectedNodeId = id;
  state.selectedEdgeId = null;
  const node = getNode(id);
  appliquerStyleParDefaut(node);
  els.titleInput.value = node ? node.title : "";
  els.textColorInput.value = node ? node.textColor : "#1f2230";
  els.colorInput.value = node ? node.color : "#ffd166";
  els.borderColorInput.value = node ? node.borderColor : "#5c647f";
  els.borderWidthInput.value = String(node ? node.borderWidth : 2);
  els.radiusInput.value = String(node ? node.radius : 14);
  requestRender();
}

function selectEdge(id) {
  state.selectedEdgeId = id;
  state.selectedNodeId = null;
  const edge = getEdge(id);
  if (edge) {
    els.edgeTypeSelect.value = edge.type;
  }
  requestRender();
}

function clearSelection() {
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  state.linkingFrom = null;
  requestRender();
}

function centerOnNode(nodeId) {
  const node = getNode(nodeId);
  if (!node) return;
  const rect = els.canvas.getBoundingClientRect();
  state.viewport.x = rect.width / 2 - (node.x + core.NODE_WIDTH / 2) * state.viewport.zoom;
  state.viewport.y = rect.height / 2 - (node.y + core.NODE_HEIGHT / 2) * state.viewport.zoom;
  requestRender();
}

function createNode({
  x = 160,
  y = 120,
  title = "Nœud",
  color = "#ffd166",
  textColor = "#1f2230",
  borderColor = "#5c647f",
  borderWidth = 2,
  radius = 14,
  parentId = null,
} = {}) {
  commit(() => {
    const id = String(state.graph.nextId++);
    state.graph.nodes.push({ id, x, y, title, color, textColor, borderColor, borderWidth, radius, parentId });
    if (parentId) {
      state.graph.edges.push({ id: `tree-${parentId}-${id}`, source: parentId, target: id, type: "tree" });
    }
    state.selectedNodeId = id;
    state.selectedEdgeId = null;
  }, "Nœud créé");
}

function createRootAtCenter() {
  const rect = els.canvas.getBoundingClientRect();
  const center = toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  createNode({ x: center.x, y: center.y, title: `Racine ${state.graph.nodes.length + 1}` });
}

function addChildToSelected() {
  if (!state.selectedNodeId) return;
  const parent = getNode(state.selectedNodeId);
  if (!parent) return;
  createNode({
    x: parent.x + 260,
    y: parent.y + 80,
    title: `${parent.title} enfant`,
    color: parent.color,
    parentId: parent.id,
  });
}

function deleteSelected() {
  if (state.selectedEdgeId) {
    deleteSelectedEdge();
    return;
  }
  if (!state.selectedNodeId) return;

  commit(() => {
    const subtree = core.collectSubtreeIds(state.graph.nodes, state.selectedNodeId);
    state.graph.nodes = state.graph.nodes.filter((node) => !subtree.has(node.id));
    state.graph.edges = state.graph.edges.filter((edge) => !subtree.has(edge.source) && !subtree.has(edge.target));
    state.selectedNodeId = null;
  }, "Nœud supprimé");
}

function deleteSelectedEdge() {
  if (!state.selectedEdgeId) return;
  commit(() => {
    state.graph.edges = state.graph.edges.filter((edge) => edge.id !== state.selectedEdgeId);
    state.selectedEdgeId = null;
  }, "Lien supprimé");
}

function toggleLinkMode() {
  state.linkMode = !state.linkMode;
  state.linkingFrom = null;
  setStatus(`Mode lien ${state.linkMode ? "activé" : "désactivé"}`, false);
  requestRender();
}

function applyNodeStylePreset(preset) {
  if (!state.selectedNodeId) return;
  const presets = {
    ocean: { color: "#dff0ff", textColor: "#0d3b75", borderColor: "#2f7bd4", borderWidth: 2, radius: 14 },
    menthe: { color: "#e5fbef", textColor: "#13462d", borderColor: "#2ca469", borderWidth: 2, radius: 16 },
    abricot: { color: "#fff2e6", textColor: "#6b3510", borderColor: "#f08d3c", borderWidth: 2, radius: 14 },
    lilas: { color: "#f3edff", textColor: "#3c2b73", borderColor: "#7e6bff", borderWidth: 2, radius: 18 },
    ardoise: { color: "#e8ecf4", textColor: "#1f293b", borderColor: "#66758f", borderWidth: 2, radius: 12 },
  };
  const style = presets[preset];
  if (!style) return;
  commit(() => {
    const node = getNode(state.selectedNodeId);
    if (!node) return;
    node.color = style.color;
    node.textColor = style.textColor;
    node.borderColor = style.borderColor;
    node.borderWidth = style.borderWidth;
    node.radius = style.radius;
  }, "Style du nœud appliqué");
}

function onNodeClick(nodeId) {
  if (state.linkMode) {
    if (!state.linkingFrom) {
      state.linkingFrom = nodeId;
      selectNode(nodeId);
      setStatus("Choisissez le nœud cible", false);
      return;
    }

    if (state.linkingFrom === nodeId) {
      state.linkingFrom = null;
      setStatus("Lien annulé", false);
      requestRender();
      return;
    }

    const sourceId = state.linkingFrom;
    state.linkingFrom = null;
    const exists = state.graph.edges.some(
      (edge) => edge.source === sourceId && edge.target === nodeId && edge.type === "free",
    );

    commit(() => {
      if (!exists) {
        state.graph.edges.push({ id: `free-${sourceId}-${nodeId}-${Date.now()}`, source: sourceId, target: nodeId, type: "free" });
      }
      state.selectedEdgeId = null;
      state.selectedNodeId = nodeId;
    }, exists ? "Lien déjà existant" : "Lien créé");
    return;
  }

  selectNode(nodeId);
}

function runLayout(mode) {
  const libelle = mode === "horizontal" ? "horizontale" : mode === "vertical" ? "verticale" : "radiale";
  commit(() => {
    state.graph = core.layoutGraph(state.graph, mode);
    if (state.selectedNodeId) {
      centerOnNode(state.selectedNodeId);
    }
  }, `Disposition ${libelle} appliquée`);
}

function appliquerTemplateSelectionne() {
  const type = els.templateSelect.value || "produit";
  const graph = genererTemplate(type);
  history.clear();
  const ok = applyGraph(graph, "Modèle appliqué");
  if (!ok) return;
  state.selectedNodeId = state.graph.nodes[0] ? state.graph.nodes[0].id : null;
  centerOnNode(state.selectedNodeId);
}

function undo() {
  const prev = history.undo(state.graph);
  if (!prev) return;
  state.graph = prev;
  state.selectedEdgeId = null;
  state.linkingFrom = null;
  setStatus("Annulation", false);
  requestRender();
}

function redo() {
  const next = history.redo(state.graph);
  if (!next) return;
  state.graph = next;
  state.selectedEdgeId = null;
  state.linkingFrom = null;
  setStatus("Rétablissement", false);
  requestRender();
}

function clearMap() {
  commit(() => {
    state.graph = { nodes: [], edges: [], nextId: 1 };
    state.selectedNodeId = null;
    state.selectedEdgeId = null;
  }, "Carte vidée");
}

function saveNow() {
  const payload = {
    ...state.graph,
    metadata: {
      updatedAt: new Date().toISOString(),
      version: 2,
    },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  state.lastAutosaveAt = Date.now();
  state.lastSavedHash = graphHash();
  els.autosaveStatus.textContent = `Sauvegarde auto : enregistrée à ${new Date(state.lastAutosaveAt).toLocaleTimeString()}`;
}

function getSnapshots() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSnapshots(snapshots) {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots.slice(-SNAPSHOT_LIMIT)));
}

function renderSnapshotList() {
  if (!els.snapshotsList) return;
  const snapshots = getSnapshots();
  if (snapshots.length === 0) {
    els.snapshotsList.innerHTML = `<p class="subtle">Aucun instantané.</p>`;
    return;
  }

  const entries = [];
  for (let idx = snapshots.length - 1; idx >= 0; idx -= 1) {
    const snapshot = snapshots[idx];
      const dt = new Date(snapshot.timestamp);
      const dateText = Number.isNaN(dt.getTime()) ? snapshot.timestamp : dt.toLocaleString();
      entries.push(`<div class="snapshot-item">
        <div class="snapshot-time">${escapeXml(dateText)}</div>
        <div class="snapshot-actions">
          <button data-action="restore-snapshot" data-index="${idx}">Restaurer</button>
          <button data-action="delete-snapshot" data-index="${idx}">Supprimer</button>
        </div>
      </div>`);
  }

  els.snapshotsList.innerHTML = entries.join("");
}

function restoreSnapshotAt(index) {
  const snapshots = getSnapshots();
  const snapshot = snapshots[index];
  if (!snapshot || !snapshot.graph) {
    setStatus("Instantané introuvable", true);
    return;
  }

  const validated = core.validateAndNormalizeData(snapshot.graph);
  if (!validated.ok) {
    setStatus(`Instantané invalide : ${traduireErreurValidation(validated.errors[0])}`, true);
    return;
  }

  history.clear();
  state.graph = validated.data;
  state.inlineEditNodeId = null;
  state.selectedNodeId = state.graph.nodes[0] ? state.graph.nodes[0].id : null;
  state.selectedEdgeId = null;
  state.lastSavedHash = graphHash();
  requestRender();
  setStatus(`Instantané restauré (${new Date(snapshot.timestamp).toLocaleString()})`, false);
}

function deleteSnapshotAt(index) {
  const snapshots = getSnapshots();
  if (index < 0 || index >= snapshots.length) return;
  snapshots.splice(index, 1);
  saveSnapshots(snapshots);
  renderSnapshotList();
  setStatus("Instantané supprimé", false);
}

function clearAllSnapshots() {
  saveSnapshots([]);
  renderSnapshotList();
  setStatus("Tous les instantanés ont été supprimés", false);
}

function addSnapshot() {
  const snapshots = getSnapshots();
  snapshots.push({
    timestamp: new Date().toISOString(),
    graph: core.cloneGraph(state.graph),
  });
  saveSnapshots(snapshots);
  renderSnapshotList();
  state.lastSnapshotAt = Date.now();
}

function loadNow() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    setStatus("Aucune carte enregistrée trouvée", true);
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    const validated = core.validateAndNormalizeData(parsed);
    if (!validated.ok) {
      setStatus(`Données enregistrées invalides : ${traduireErreurValidation(validated.errors[0])}`, true);
      return;
    }
    history.clear();
    state.graph = validated.data;
    state.inlineEditNodeId = null;
    state.lastSavedHash = graphHash();
    state.selectedNodeId = state.graph.nodes[0] ? state.graph.nodes[0].id : null;
    state.selectedEdgeId = null;
    setStatus("Chargée depuis le stockage local", false);
    requestRender();
  } catch {
    setStatus("Impossible de lire les données enregistrées", true);
  }
}

function runAutosave() {
  const hash = graphHash();
  if (hash === state.lastSavedHash) return;
  saveNow();
  const now = Date.now();
  if (now - state.lastSnapshotAt > SNAPSHOT_INTERVAL_MS) {
    addSnapshot();
  }
}

function loadLatestSnapshotFallback() {
  const raw = localStorage.getItem(SNAPSHOT_KEY);
  if (!raw) return false;
  try {
    const snapshots = JSON.parse(raw);
    if (!Array.isArray(snapshots) || snapshots.length === 0) return false;
    const latest = snapshots[snapshots.length - 1];
    if (!latest || !latest.graph) return false;
    const validated = core.validateAndNormalizeData(latest.graph);
    if (!validated.ok) return false;
    state.graph = validated.data;
    state.inlineEditNodeId = null;
    setStatus(`Instantané récupéré depuis ${latest.timestamp}`, false);
    return true;
  } catch {
    return false;
  }
}

function parseImport(data) {
  const validated = core.validateAndNormalizeData(data);
  if (!validated.ok) {
    throw new Error(validated.errors.slice(0, 4).map(traduireErreurValidation).join(" | "));
  }
  return validated.data;
}

function exportJson() {
  const payload = {
    ...state.graph,
    metadata: {
      exportedAt: new Date().toISOString(),
      version: 2,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(blob, "mindmap.json");
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const graph = parseImport(parsed);
      history.clear();
      applyGraph(graph, "JSON importé");
    } catch (error) {
      setStatus(`Échec de l'import : ${error.message}`, true);
    }
  };
  reader.readAsText(file);
}

function getExportContext() {
  const region = els.exportRegion.value;
  const scale = Number(els.exportScale.value) || 1;
  const dpi = Math.min(600, Math.max(72, Number(els.exportDpi.value) || 144));
  const transparent = Boolean(els.exportTransparent.checked);
  const scaleByDpi = dpi / 96;

  let nodeIds = null;
  let bounds = null;

  if (region === "subtree" && state.selectedNodeId) {
    nodeIds = core.collectSubtreeIds(state.graph.nodes, state.selectedNodeId);
    bounds = core.getBounds(state.graph.nodes, nodeIds);
  } else if (region === "visible") {
    const rect = els.canvas.getBoundingClientRect();
    const x = (-state.viewport.x) / state.viewport.zoom;
    const y = (-state.viewport.y) / state.viewport.zoom;
    const width = rect.width / state.viewport.zoom;
    const height = rect.height / state.viewport.zoom;
    bounds = { x, y, width, height };
  } else {
    bounds = core.getBounds(state.graph.nodes);
  }

  return {
    bounds: {
      x: Math.floor(bounds.x - 50),
      y: Math.floor(bounds.y - 50),
      width: Math.max(300, Math.ceil(bounds.width + 100)),
      height: Math.max(240, Math.ceil(bounds.height + 100)),
    },
    nodeIds,
    scale: scale * scaleByDpi,
    transparent,
  };
}

function edgeVisible(edge, nodeIds) {
  if (!nodeIds) return true;
  return nodeIds.has(edge.source) && nodeIds.has(edge.target);
}

function renderToCanvas(ctx, bounds, nodeIds, transparent) {
  if (!transparent) {
    ctx.fillStyle = "#f4f6fb";
    ctx.fillRect(0, 0, bounds.width, bounds.height);
  }

  ctx.lineCap = "round";

  for (const edge of state.graph.edges) {
    if (!edgeVisible(edge, nodeIds)) continue;
    const source = getNode(edge.source);
    const target = getNode(edge.target);
    if (!source || !target) continue;
    const x1 = source.x + core.NODE_WIDTH / 2 - bounds.x;
    const y1 = source.y + core.NODE_HEIGHT / 2 - bounds.y;
    const x2 = target.x + core.NODE_WIDTH / 2 - bounds.x;
    const y2 = target.y + core.NODE_HEIGHT / 2 - bounds.y;
    const cx = (x1 + x2) / 2;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(cx, y1, cx, y2, x2, y2);
    ctx.strokeStyle = edge.type === "free" ? "#e15d44" : "#6d86b8";
    ctx.lineWidth = edge.id === state.selectedEdgeId ? 3.5 : edge.type === "free" ? 2.4 : 2;
    ctx.setLineDash(edge.type === "free" ? [6, 5] : []);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.textBaseline = "middle";
  ctx.font = "14px Avenir Next, Segoe UI, sans-serif";

  for (const node of state.graph.nodes) {
    appliquerStyleParDefaut(node);
    if (nodeIds && !nodeIds.has(node.id)) continue;
    const x = node.x - bounds.x;
    const y = node.y - bounds.y;
    roundRect(ctx, x, y, core.NODE_WIDTH, core.NODE_HEIGHT, node.radius, node.color);
    ctx.strokeStyle = node.id === state.selectedNodeId ? "#2d6cdf" : node.borderColor;
    ctx.lineWidth = node.id === state.selectedNodeId ? Math.max(3, node.borderWidth) : node.borderWidth;
    ctx.stroke();
    ctx.fillStyle = node.textColor;
    ctx.fillText(node.title, x + 14, y + core.NODE_HEIGHT / 2);
  }
}

function exportPng() {
  const { bounds, nodeIds, scale, transparent } = getExportContext();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(bounds.width * scale));
  canvas.height = Math.max(1, Math.floor(bounds.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.scale(scale, scale);
  renderToCanvas(ctx, bounds, nodeIds, transparent);
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, "mindmap.png");
  }, "image/png");
}

function exportSvg() {
  const { bounds, nodeIds, transparent } = getExportContext();
  let svg = `<?xml version="1.0" encoding="UTF-8"?>`;
  svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}">`;
  if (!transparent) {
    svg += `<rect width="100%" height="100%" fill="#f4f6fb" />`;
  }

  for (const edge of state.graph.edges) {
    if (!edgeVisible(edge, nodeIds)) continue;
    const source = getNode(edge.source);
    const target = getNode(edge.target);
    if (!source || !target) continue;
    const x1 = source.x + core.NODE_WIDTH / 2 - bounds.x;
    const y1 = source.y + core.NODE_HEIGHT / 2 - bounds.y;
    const x2 = target.x + core.NODE_WIDTH / 2 - bounds.x;
    const y2 = target.y + core.NODE_HEIGHT / 2 - bounds.y;
    const cx = (x1 + x2) / 2;
    svg += `<path d="M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}" fill="none" stroke="${
      edge.type === "free" ? "#e15d44" : "#6d86b8"
    }" stroke-width="${edge.id === state.selectedEdgeId ? 3.5 : edge.type === "free" ? 2.4 : 2}" ${
      edge.type === "free" ? 'stroke-dasharray="6 5"' : ""
    } />`;
  }

  for (const node of state.graph.nodes) {
    appliquerStyleParDefaut(node);
    if (nodeIds && !nodeIds.has(node.id)) continue;
    const x = node.x - bounds.x;
    const y = node.y - bounds.y;
    svg += `<rect x="${x}" y="${y}" width="${core.NODE_WIDTH}" height="${core.NODE_HEIGHT}" rx="${node.radius}" ry="${node.radius}" fill="${escapeXml(
      node.color,
    )}" stroke="${node.id === state.selectedNodeId ? "#2d6cdf" : escapeXml(node.borderColor)}" stroke-width="${
      node.id === state.selectedNodeId ? Math.max(3, node.borderWidth) : node.borderWidth
    }" />`;
    svg += `<text x="${x + 14}" y="${y + core.NODE_HEIGHT / 2 + 1}" dominant-baseline="middle" font-family="Avenir Next, Segoe UI, sans-serif" font-size="14" fill="${escapeXml(node.textColor)}">${escapeXml(
      node.title,
    )}</text>`;
  }

  svg += `</svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml" });
  downloadBlob(blob, "mindmap.svg");
}

function roundRect(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function renderNodes() {
  const fragment = document.createDocumentFragment();

  for (const node of state.graph.nodes) {
    appliquerStyleParDefaut(node);
    const nodeFragment = els.nodeTemplate.content.cloneNode(true);
    const element = nodeFragment.querySelector(".node");
    const title = nodeFragment.querySelector(".node-title");
    element.dataset.id = node.id;
    element.style.left = `${node.x}px`;
    element.style.top = `${node.y}px`;
    element.style.background = node.color;
    element.style.color = node.textColor;
    element.style.borderColor = node.borderColor;
    element.style.borderWidth = `${node.borderWidth}px`;
    element.style.borderRadius = `${node.radius}px`;

    if (state.inlineEditNodeId === node.id) {
      const input = document.createElement("input");
      input.type = "text";
      input.value = node.title;
      input.className = "node-input";
      input.setAttribute("data-inline-editor", "true");
      input.setAttribute("data-node-id", node.id);
      title.replaceWith(input);
    } else {
      title.textContent = node.title;
    }

    if (node.id === state.selectedNodeId) {
      element.classList.add("selected");
    }
    fragment.appendChild(nodeFragment);
  }

  els.nodes.replaceChildren(fragment);
}

function renderEdges() {
  const mapSize = computeMapSize();
  els.edges.setAttribute("width", String(mapSize.width));
  els.edges.setAttribute("height", String(mapSize.height));
  els.edges.setAttribute("viewBox", `0 0 ${mapSize.width} ${mapSize.height}`);
  els.nodes.style.width = `${mapSize.width}px`;
  els.nodes.style.height = `${mapSize.height}px`;

  const fragment = document.createDocumentFragment();
  for (const edge of state.graph.edges) {
    const source = getNode(edge.source);
    const target = getNode(edge.target);
    if (!source || !target) continue;

    const x1 = source.x + core.NODE_WIDTH / 2;
    const y1 = source.y + core.NODE_HEIGHT / 2;
    const x2 = target.x + core.NODE_WIDTH / 2;
    const y2 = target.y + core.NODE_HEIGHT / 2;
    const cx = (x1 + x2) / 2;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", edge.type === "free" ? "#e15d44" : "#6d86b8");
    path.setAttribute("stroke-width", edge.id === state.selectedEdgeId ? "3.5" : edge.type === "free" ? "2.3" : "2");
    path.setAttribute("stroke-dasharray", edge.type === "free" ? "6 5" : "0");
    path.setAttribute("class", `edge-path ${edge.id === state.selectedEdgeId ? "selected" : ""}`.trim());
    path.dataset.edgeId = edge.id;
    fragment.appendChild(path);
  }

  els.edges.replaceChildren(fragment);
}

function renderControls() {
  const nodeSelected = Boolean(state.selectedNodeId);
  const edgeSelected = Boolean(state.selectedEdgeId);
  const hasNodes = state.graph.nodes.length > 0;
  const snapshot = history.snapshot();

  if (!nodeSelected) {
    els.titleInput.value = "";
    els.textColorInput.value = "#1f2230";
    els.colorInput.value = "#ffd166";
    els.borderColorInput.value = "#5c647f";
    els.borderWidthInput.value = "2";
    els.radiusInput.value = "14";
  }

  els.linkModeBtn.setAttribute("aria-pressed", state.linkMode ? "true" : "false");
  els.linkModeBtn.classList.toggle("is-active", state.linkMode);
  els.linkModeBtn.title = state.linkMode ? "Mode lien activé" : "Mode lien désactivé";
  els.undoBtn.disabled = !history.canUndo();
  els.redoBtn.disabled = !history.canRedo();
  els.addChildBtn.disabled = !nodeSelected;
  els.deleteEdgeBtn.disabled = !edgeSelected;
  els.edgeTypeSelect.disabled = !edgeSelected;
  els.deleteBtn.disabled = !nodeSelected && !edgeSelected;
  els.titleInput.disabled = !nodeSelected;
  els.textColorInput.disabled = !nodeSelected;
  els.colorInput.disabled = !nodeSelected;
  els.borderColorInput.disabled = !nodeSelected;
  els.borderWidthInput.disabled = !nodeSelected;
  els.radiusInput.disabled = !nodeSelected;

  if (edgeSelected) {
    const edge = getEdge(state.selectedEdgeId);
    if (edge) els.edgeTypeSelect.value = edge.type;
  }

  els.undoBtn.title = `Annuler (${snapshot.undo})`;
  els.redoBtn.title = `Rétablir (${snapshot.redo})`;
  if (els.emptyState) {
    els.emptyState.hidden = hasNodes;
  }
}

function renderQuickActions() {
  const node = state.selectedNodeId ? getNode(state.selectedNodeId) : null;
  const show = Boolean(node) && !state.selectedEdgeId && !state.inlineEditNodeId;
  els.quickActions.hidden = !show;
  if (!show) return;

  const mapSize = computeMapSize();
  const menuWidth = 290;
  let x = node.x + core.NODE_WIDTH + 14;
  let y = node.y - 6;
  if (x + menuWidth > mapSize.width - 10) {
    x = node.x - menuWidth - 14;
  }
  if (y < 10) y = 10;
  els.quickActions.style.left = `${Math.max(10, x)}px`;
  els.quickActions.style.top = `${y}px`;
}

function renderViewport() {
  els.stage.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.zoom})`;
}

function render() {
  renderEdges();
  renderNodes();
  renderControls();
  renderQuickActions();
  renderViewport();
}

function onNodePointerDown(event) {
  const nodeEl = event.target.closest(".node");
  if (!nodeEl) return;
  if (event.target.closest("[data-inline-editor='true']")) return;
  if (state.spacePressed) return;
  event.preventDefault();

  const nodeId = nodeEl.dataset.id;
  const node = getNode(nodeId);
  if (!node) return;

  selectNode(nodeId);

  const world = toWorld(event.clientX, event.clientY);
  state.draggingNodeId = nodeId;
  state.dragOffset.x = world.x - node.x;
  state.dragOffset.y = world.y - node.y;

  nodeEl.setPointerCapture(event.pointerId);
}

function onNodePointerMove(event) {
  if (!state.draggingNodeId) return;
  const nodeId = state.draggingNodeId;
  const node = getNode(nodeId);
  if (!node) return;

  const world = toWorld(event.clientX, event.clientY);
  const rawX = Math.max(20, world.x - state.dragOffset.x);
  const rawY = Math.max(20, world.y - state.dragOffset.y);
  const snapped = magnetiserPositionNoeud(nodeId, rawX, rawY);
  node.x = snapped.x;
  node.y = snapped.y;
  requestRender();
}

function onNodePointerUp() {
  if (!state.draggingNodeId) return;
  const movedId = state.draggingNodeId;
  state.draggingNodeId = null;
  commit(() => {
    const node = getNode(movedId);
    if (node) {
      node.x = Math.round(node.x);
      node.y = Math.round(node.y);
    }
  }, "Nœud déplacé");
}

function startInlineEdit(nodeId) {
  const node = getNode(nodeId);
  if (!node) return;
  state.inlineEditNodeId = nodeId;
  state.selectedNodeId = nodeId;
  state.selectedEdgeId = null;
  requestRender();

  window.requestAnimationFrame(() => {
    const allInputs = els.nodes.querySelectorAll("[data-inline-editor='true']");
    const input = Array.from(allInputs).find((el) => el.dataset.nodeId === nodeId);
    if (!input) return;
    input.focus();
    input.select();
  });
}

function commitInlineEdit(nodeId, nextTitle) {
  const normalized = (nextTitle || "").trim() || "Nœud";
  const changed = commit(() => {
    const node = getNode(nodeId);
    if (node) node.title = normalized;
  }, "Titre du nœud mis à jour");
  state.inlineEditNodeId = null;
  if (!changed) {
    requestRender();
  }
}

function cancelInlineEdit() {
  if (!state.inlineEditNodeId) return;
  state.inlineEditNodeId = null;
  requestRender();
}

function onCanvasPointerDown(event) {
  const hitNode = event.target.closest(".node");
  const hitEdge = event.target.closest(".edge-path");
  const hitQuickActions = event.target.closest(".node-quick-actions");
  if ((hitNode || hitEdge || hitQuickActions) && !state.spacePressed) return;
  if (!state.spacePressed) {
    clearSelection();
  }

  state.isPanning = true;
  state.panStart = {
    x: event.clientX,
    y: event.clientY,
    viewportX: state.viewport.x,
    viewportY: state.viewport.y,
  };
  els.canvas.classList.add("panning");
}

function onCanvasPointerMove(event) {
  if (!state.isPanning || !state.panStart) return;
  state.viewport.x = state.panStart.viewportX + (event.clientX - state.panStart.x);
  state.viewport.y = state.panStart.viewportY + (event.clientY - state.panStart.y);
  requestRender();
}

function onCanvasPointerUp() {
  state.isPanning = false;
  state.panStart = null;
  els.canvas.classList.remove("panning");
}

function onCanvasWheel(event) {
  event.preventDefault();
  const direction = event.deltaY < 0 ? 1 : -1;
  const factor = direction > 0 ? 1.08 : 1 / 1.08;
  const newZoom = Math.min(2.8, Math.max(0.25, state.viewport.zoom * factor));

  const rect = els.canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  const worldX = (mouseX - state.viewport.x) / state.viewport.zoom;
  const worldY = (mouseY - state.viewport.y) / state.viewport.zoom;

  state.viewport.zoom = newZoom;
  state.viewport.x = mouseX - worldX * newZoom;
  state.viewport.y = mouseY - worldY * newZoom;
  requestRender();
}

function onKeyDown(event) {
  const activeTag = document.activeElement ? document.activeElement.tagName : "";
  const inInput = ["INPUT", "TEXTAREA", "SELECT"].includes(activeTag);

  if (event.code === "Space" && !inInput) {
    state.spacePressed = true;
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      redo();
    } else {
      undo();
    }
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redo();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveNow();
    setStatus("Enregistrement manuel effectué", false);
    return;
  }

  if (inInput) return;

  if (event.key === "Escape" && state.inlineEditNodeId) {
    cancelInlineEdit();
    return;
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteSelected();
    return;
  }

  if (event.key.toLowerCase() === "n") {
    event.preventDefault();
    createRootAtCenter();
    return;
  }

  if (event.key === "Tab") {
    event.preventDefault();
    addChildToSelected();
    return;
  }

  if (event.key.toLowerCase() === "l") {
    event.preventDefault();
    toggleLinkMode();
  }
}

function onKeyUp(event) {
  if (event.code === "Space") {
    state.spacePressed = false;
  }
}

function boot() {
  const raw = localStorage.getItem(STORAGE_KEY);
  let loaded = false;

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const validated = core.validateAndNormalizeData(parsed);
      if (validated.ok) {
        state.graph = validated.data;
        loaded = true;
      }
    } catch {
      loaded = false;
    }
  }

  if (!loaded) {
    loaded = loadLatestSnapshotFallback();
  }

  if (!loaded) {
    state.graph = {
      nodes: [{ id: "1", x: 180, y: 140, title: "Projet", color: "#ffd166", parentId: null }],
      edges: [],
      nextId: 2,
    };
  }

  state.lastSavedHash = graphHash();
  state.lastSnapshotAt = Date.now();
  state.selectedNodeId = state.graph.nodes[0] ? state.graph.nodes[0].id : null;
  renderSnapshotList();
  requestRender();
}

els.nodes.addEventListener("click", (event) => {
  const nodeEl = event.target.closest(".node");
  if (!nodeEl) return;
  event.stopPropagation();
  onNodeClick(nodeEl.dataset.id);
});

els.nodes.addEventListener("dblclick", (event) => {
  const nodeEl = event.target.closest(".node");
  if (!nodeEl) return;
  event.preventDefault();
  event.stopPropagation();
  startInlineEdit(nodeEl.dataset.id);
});

els.nodes.addEventListener("keydown", (event) => {
  const input = event.target.closest("[data-inline-editor='true']");
  if (!input) return;

  if (event.key === "Enter") {
    event.preventDefault();
    commitInlineEdit(input.dataset.nodeId, input.value);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    cancelInlineEdit();
  }
});

els.nodes.addEventListener("blur", (event) => {
  const input = event.target.closest("[data-inline-editor='true']");
  if (!input) return;
  commitInlineEdit(input.dataset.nodeId, input.value);
}, true);

els.nodes.addEventListener("pointerdown", onNodePointerDown);
els.nodes.addEventListener("pointermove", onNodePointerMove);
els.nodes.addEventListener("pointerup", onNodePointerUp);
els.nodes.addEventListener("pointercancel", onNodePointerUp);

els.edges.addEventListener("click", (event) => {
  const path = event.target.closest(".edge-path");
  if (!path) return;
  event.stopPropagation();
  selectEdge(path.dataset.edgeId);
});

els.canvas.addEventListener("pointerdown", onCanvasPointerDown);
els.canvas.addEventListener("pointermove", onCanvasPointerMove);
window.addEventListener("pointerup", onCanvasPointerUp);
els.canvas.addEventListener("wheel", onCanvasWheel, { passive: false });

window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);

els.undoBtn.addEventListener("click", undo);
els.redoBtn.addEventListener("click", redo);

els.addRootBtn.addEventListener("click", () => {
  createRootAtCenter();
});

els.addChildBtn.addEventListener("click", () => {
  addChildToSelected();
});

els.linkModeBtn.addEventListener("click", toggleLinkMode);
els.deleteBtn.addEventListener("click", deleteSelected);
els.clearBtn.addEventListener("click", clearMap);
els.deleteEdgeBtn.addEventListener("click", deleteSelectedEdge);

els.titleInput.addEventListener("input", (event) => {
  if (!state.selectedNodeId) return;
  const value = event.target.value.trim();
  commit(() => {
    const node = getNode(state.selectedNodeId);
    if (node) node.title = value || "Nœud";
  }, "Titre du nœud mis à jour");
});

els.colorInput.addEventListener("input", (event) => {
  if (!state.selectedNodeId) return;
  const value = event.target.value;
  commit(() => {
    const node = getNode(state.selectedNodeId);
    if (node) node.color = value;
  }, "Couleur du nœud mise à jour");
});

els.textColorInput.addEventListener("input", (event) => {
  if (!state.selectedNodeId) return;
  const value = event.target.value;
  commit(() => {
    const node = getNode(state.selectedNodeId);
    if (node) node.textColor = value;
  }, "Couleur du texte mise à jour");
});

els.borderColorInput.addEventListener("input", (event) => {
  if (!state.selectedNodeId) return;
  const value = event.target.value;
  commit(() => {
    const node = getNode(state.selectedNodeId);
    if (node) node.borderColor = value;
  }, "Couleur du contour mise à jour");
});

els.borderWidthInput.addEventListener("input", (event) => {
  if (!state.selectedNodeId) return;
  const value = Number(event.target.value);
  commit(() => {
    const node = getNode(state.selectedNodeId);
    if (node) node.borderWidth = Math.max(0, Math.min(8, Number.isFinite(value) ? value : 2));
  }, "Épaisseur du contour mise à jour");
});

els.radiusInput.addEventListener("input", (event) => {
  if (!state.selectedNodeId) return;
  const value = Number(event.target.value);
  commit(() => {
    const node = getNode(state.selectedNodeId);
    if (node) node.radius = Math.max(0, Math.min(28, Number.isFinite(value) ? value : 14));
  }, "Rayon du nœud mis à jour");
});

els.edgeTypeSelect.addEventListener("change", (event) => {
  if (!state.selectedEdgeId) return;
  const nextType = event.target.value === "tree" ? "tree" : "free";
  commit(() => {
    const edge = getEdge(state.selectedEdgeId);
    if (edge) edge.type = nextType;
  }, "Type de lien mis à jour");
});

els.layoutHorizontalBtn.addEventListener("click", () => runLayout("horizontal"));
els.layoutVerticalBtn.addEventListener("click", () => runLayout("vertical"));
els.layoutRadialBtn.addEventListener("click", () => runLayout("radial"));
els.applyTemplateBtn.addEventListener("click", appliquerTemplateSelectionne);

els.saveBtn.addEventListener("click", () => {
  saveNow();
  setStatus("Enregistré", false);
});

els.loadBtn.addEventListener("click", loadNow);
els.exportJsonBtn.addEventListener("click", exportJson);

els.importJsonInput.addEventListener("change", (event) => {
  const file = event.target.files && event.target.files[0];
  if (file) importJson(file);
  event.target.value = "";
});

if (els.snapshotsList) {
  els.snapshotsList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const index = Number(button.dataset.index);
    if (!Number.isInteger(index)) return;
    if (button.dataset.action === "restore-snapshot") {
      restoreSnapshotAt(index);
    } else if (button.dataset.action === "delete-snapshot") {
      deleteSnapshotAt(index);
    }
  });
}

if (els.refreshSnapshotsBtn) {
  els.refreshSnapshotsBtn.addEventListener("click", renderSnapshotList);
}
if (els.clearSnapshotsBtn) {
  els.clearSnapshotsBtn.addEventListener("click", clearAllSnapshots);
}

els.exportSvgBtn.addEventListener("click", exportSvg);
els.exportPngBtn.addEventListener("click", exportPng);

els.qaAddChildBtn.addEventListener("click", () => {
  addChildToSelected();
});

els.qaLinkBtn.addEventListener("click", () => {
  if (!state.linkMode) {
    toggleLinkMode();
  }
  state.linkingFrom = state.selectedNodeId;
  setStatus("Nœud source choisi, cliquez une cible", false);
});

els.qaRenameBtn.addEventListener("click", () => {
  if (state.selectedNodeId) {
    startInlineEdit(state.selectedNodeId);
  }
});

els.qaDeleteBtn.addEventListener("click", () => {
  deleteSelected();
});

els.quickActions.addEventListener("click", (event) => {
  const presetButton = event.target.closest("[data-style-preset]");
  if (!presetButton) return;
  applyNodeStylePreset(presetButton.dataset.stylePreset);
});

if (els.emptyCreateBtn) {
  els.emptyCreateBtn.addEventListener("click", createRootAtCenter);
}
if (els.emptyTemplateBtn) {
  els.emptyTemplateBtn.addEventListener("click", appliquerTemplateSelectionne);
}

window.setInterval(runAutosave, AUTOSAVE_INTERVAL_MS);

boot();
