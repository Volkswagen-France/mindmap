const core = window.MindMapCore;

const STORAGE_KEY = "mindmap-data-v2";
const ACTIVE_PROJECT_KEY = "mindmap-active-project-id";
const PROJECTS_DB_NAME = "mindmap-projects-db";
const PROJECTS_DB_VERSION = 1;
const PROJECTS_STORE = "projects";
const CLOUD_SYNC_INTERVAL_MS = 20000;
const AUTOSAVE_INTERVAL_MS = 12000;
const COLLAB_IDENTITY_KEY = "mindmap-collab-identity";
const PASSWORD_UNLOCK_SESSION_KEY = "mindmap-password-unlocked";
const SNAP_THRESHOLD = 18;
const ROUTE_NODE_PADDING = 16;
const ROUTE_STUB = 24;
const ROUTE_CHANNEL = 28;
const ROUTE_ALIGN_STEP = 14;
const EDGE_OVERLAP_PENALTY = 10;
const EDGE_CROSS_PENALTY = 140;
const EDGE_TURN_PENALTY = 18;
const EDGE_SHORT_SEGMENT_PENALTY = 12;
const NODE_DRAG_START_PX = 7;

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
  linkDraft: null,
  linkDraftCursor: null,
  viewport: {
    x: 80,
    y: 80,
    zoom: 1,
  },
  draggingNodeId: null,
  dragActivated: false,
  dragStartClient: null,
  dragOffset: { x: 0, y: 0 },
  resizingPostitId: null,
  resizePostitStartClient: null,
  resizePostitStartSize: null,
  isPanning: false,
  panStart: null,
  spacePressed: false,
  renderQueued: false,
  inlineEditNodeId: null,
  inlineEditIsPostit: false,
  lastAutosaveAt: null,
  lastSavedHash: "",
  preferredLayout: "horizontal",
  defaultEdgeShape: "arrondi",
  defaultEdgeStyle: "dashed",
  defaultEdgeColor: "#e15d44",
  activeTraitPreset: "signal",
  edgeRouteCache: new Map(),
  currentProjectId: null,
  currentProjectName: "",
  projects: [],
  projectDbPromise: null,
  cloudSyncEnabled: false,
  cloudSyncWorkspace: "equipe-principale",
  realtime: {
    enabled: false,
    client: null,
    channel: null,
    connected: false,
    applyingRemote: false,
    suppressBroadcast: false,
    clientId: "",
    clientName: "",
    peers: new Map(),
    clock: 1,
    seq: 0,
    seenActions: new Map(),
    nodeVersions: new Map(),
    edgeVersions: new Map(),
    nodeTombstones: new Map(),
    edgeTombstones: new Map(),
    lastRemoteAt: 0,
    lastSnapshotAt: 0,
  },
  appLocked: false,
};

const history = core.createHistory(250);

const els = {
  passwordGate: document.getElementById("password-gate"),
  passwordGateInput: document.getElementById("password-gate-input"),
  passwordGateSubmit: document.getElementById("password-gate-submit"),
  passwordGateError: document.getElementById("password-gate-error"),
  canvas: document.getElementById("canvas"),
  stage: document.getElementById("stage"),
  edges: document.getElementById("edges"),
  nodes: document.getElementById("nodes"),
  nodeTemplate: document.getElementById("node-template"),
  undoBtn: document.getElementById("undo-btn"),
  redoBtn: document.getElementById("redo-btn"),
  addRootBtn: document.getElementById("add-root-btn"),
  addChildBtn: document.getElementById("add-child-btn"),
  addPostitBtn: document.getElementById("add-postit-btn"),
  deleteBtn: document.getElementById("delete-btn"),
  clearBtn: document.getElementById("clear-btn"),
  titleInput: document.getElementById("node-title"),
  nodeTitleCenterBtn: document.getElementById("node-title-center-btn"),
  nodeTitleBoldBtn: document.getElementById("node-title-bold-btn"),
  nodeTitleItalicBtn: document.getElementById("node-title-italic-btn"),
  nodeTitleLinkInput: document.getElementById("node-title-link"),
  textColorInput: document.getElementById("node-text-color"),
  colorInput: document.getElementById("node-color"),
  borderColorInput: document.getElementById("node-border-color"),
  borderWidthInput: document.getElementById("node-border-width"),
  radiusInput: document.getElementById("node-radius"),
  edgeQuickActions: document.getElementById("edge-quick-actions"),
  edgeTitleInput: document.getElementById("edge-title"),
  edgeTitleCenterBtn: document.getElementById("edge-title-center-btn"),
  edgeTitleBoldBtn: document.getElementById("edge-title-bold-btn"),
  edgeTitleItalicBtn: document.getElementById("edge-title-italic-btn"),
  edgeTitleLinkInput: document.getElementById("edge-title-link"),
  edgeColorInput: document.getElementById("edge-color"),
  edgeStyleSelect: document.getElementById("edge-style"),
  edgeQuickActionsEl: document.getElementById("edge-quick-actions"),
  edgeShapeGeoBtn: document.getElementById("edge-shape-geo-btn"),
  edgeShapeRoundBtn: document.getElementById("edge-shape-round-btn"),
  edgeShapeCurveBtn: document.getElementById("edge-shape-curve-btn"),
  deleteEdgeBtn: document.getElementById("delete-edge-btn"),
  layoutHorizontalBtn: document.getElementById("layout-horizontal-btn"),
  layoutVerticalBtn: document.getElementById("layout-vertical-btn"),
  layoutRadialBtn: document.getElementById("layout-radial-btn"),
  openImportBtn: document.getElementById("open-import-btn"),
  importJsonInput: document.getElementById("import-json-input"),
  exportRegion: document.getElementById("export-region"),
  exportScale: document.getElementById("export-scale"),
  exportDpi: document.getElementById("export-dpi"),
  exportTransparent: document.getElementById("export-transparent"),
  exportFormat: document.getElementById("export-format"),
  openExportModalBtn: document.getElementById("open-export-modal-btn"),
  exportModal: document.getElementById("export-modal"),
  closeExportModalBtn: document.getElementById("close-export-modal-btn"),
  runExportJsonBtn: document.getElementById("run-export-json-btn"),
  runExportBtn: document.getElementById("run-export-btn"),
  quickActions: document.getElementById("node-quick-actions"),
  qaAddChildBtn: document.getElementById("qa-add-child"),
  qaDeleteBtn: document.getElementById("qa-delete"),
  emptyState: document.getElementById("empty-state"),
  emptyCreateBtn: document.getElementById("empty-create-btn"),
  projectSelect: document.getElementById("project-select"),
  projectNewBtn: document.getElementById("project-new-btn"),
  projectRenameBtn: document.getElementById("project-rename-btn"),
  projectDeleteBtn: document.getElementById("project-delete-btn"),
  presenceBar: document.getElementById("presence-bar"),
};

function appPassword() {
  const cfg = window.APP_CONFIG || {};
  return String(cfg.appPassword || "").trim();
}

function passwordSessionFingerprint(password) {
  return `${window.location.host}::${password}`;
}

function isPasswordUnlocked(password) {
  if (!password) return true;
  try {
    return sessionStorage.getItem(PASSWORD_UNLOCK_SESSION_KEY) === passwordSessionFingerprint(password);
  } catch {
    return false;
  }
}

function rememberPasswordUnlocked(password) {
  if (!password) return;
  try {
    sessionStorage.setItem(PASSWORD_UNLOCK_SESSION_KEY, passwordSessionFingerprint(password));
  } catch {
  }
}

function showPasswordGate() {
  state.appLocked = true;
  document.body.classList.add("app-locked");
  if (els.passwordGate) els.passwordGate.hidden = false;
  if (els.passwordGateInput) {
    els.passwordGateInput.value = "";
    window.setTimeout(() => {
      els.passwordGateInput.focus();
      els.passwordGateInput.select();
    }, 0);
  }
  if (els.passwordGateError) els.passwordGateError.textContent = "";
}

function hidePasswordGate() {
  state.appLocked = false;
  document.body.classList.remove("app-locked");
  if (els.passwordGate) els.passwordGate.hidden = true;
  if (els.passwordGateError) els.passwordGateError.textContent = "";
}

function ensurePasswordGate(onUnlocked) {
  const required = appPassword();
  if (!required || isPasswordUnlocked(required)) {
    hidePasswordGate();
    onUnlocked();
    return;
  }
  showPasswordGate();
  const tryUnlock = () => {
    const provided = (els.passwordGateInput && els.passwordGateInput.value) ? els.passwordGateInput.value : "";
    if (provided === required) {
      rememberPasswordUnlocked(required);
      hidePasswordGate();
      onUnlocked();
      return;
    }
    if (els.passwordGateError) {
      els.passwordGateError.textContent = "Mot de passe incorrect.";
    }
    if (els.passwordGateInput) {
      els.passwordGateInput.focus();
      els.passwordGateInput.select();
    }
  };
  if (els.passwordGateSubmit) {
    els.passwordGateSubmit.onclick = tryUnlock;
  }
  if (els.passwordGateInput) {
    els.passwordGateInput.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        tryUnlock();
      }
    };
  }
}

function graphHash() {
  return JSON.stringify(state.graph);
}

function cloudConfig() {
  const cfg = window.APP_CONFIG || {};
  const url = String(cfg.supabaseUrl || "").trim().replace(/\/+$/, "");
  const anonKey = String(cfg.supabaseAnonKey || "").trim();
  const workspace = String(cfg.workspaceId || "equipe-principale").trim() || "equipe-principale";
  const enabled = Boolean(url && anonKey);
  return { enabled, url, anonKey, workspace };
}

function cloudHeaders() {
  const cfg = cloudConfig();
  return {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${cfg.anonKey}`,
    "Content-Type": "application/json",
  };
}

function randomCollaboratorName() {
  const seeds = ["Atlas", "Nova", "Pixel", "Aube", "Iris", "Lynx", "Nexus", "Orion"];
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${seeds[Math.floor(Math.random() * seeds.length)]} ${suffix}`;
}

function ensureCollaboratorIdentity() {
  try {
    const raw = localStorage.getItem(COLLAB_IDENTITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.id === "string" && typeof parsed.name === "string") {
        return { id: parsed.id, name: parsed.name };
      }
    }
  } catch {
  }
  const identity = {
    id: (window.crypto && typeof window.crypto.randomUUID === "function")
      ? window.crypto.randomUUID()
      : `u-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name: randomCollaboratorName(),
  };
  try {
    localStorage.setItem(COLLAB_IDENTITY_KEY, JSON.stringify(identity));
  } catch {
  }
  return identity;
}

function updatePresenceBar() {
  if (!els.presenceBar) return;
  if (!state.realtime.enabled || !state.realtime.connected) {
    els.presenceBar.textContent = "Solo";
    els.presenceBar.title = "Mode local";
    return;
  }
  const others = Array.from(state.realtime.peers.values());
  const count = 1 + others.length;
  els.presenceBar.textContent = count === 1 ? "Solo" : `${count} en ligne`;
  const names = [state.realtime.clientName, ...others.map((peer) => peer.name)].filter(Boolean);
  els.presenceBar.title = names.length ? `Connectés: ${names.join(", ")}` : "Présence temps réel";
}

function refreshPresenceFromChannel() {
  const channel = state.realtime.channel;
  if (!channel || typeof channel.presenceState !== "function") return;
  const presence = channel.presenceState();
  const peers = new Map();
  for (const entries of Object.values(presence || {})) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const peerId = String(entry.clientId || "");
      if (!peerId || peerId === state.realtime.clientId) continue;
      peers.set(peerId, {
        id: peerId,
        name: String(entry.name || "Membre"),
        selectedNodeId: typeof entry.selectedNodeId === "string" ? entry.selectedNodeId : null,
      });
    }
  }
  state.realtime.peers = peers;
  updatePresenceBar();
  requestRender();
}

function getLockOwner(nodeId) {
  if (!nodeId) return null;
  for (const peer of state.realtime.peers.values()) {
    if (peer.selectedNodeId === nodeId) return peer;
  }
  return null;
}

function isNodeLockedByOther(nodeId) {
  return Boolean(getLockOwner(nodeId));
}

function peerInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).slice(0, 2);
  if (!parts.length) return "??";
  return parts.map((part) => part.slice(0, 1).toUpperCase()).join("");
}

function versionCmp(a, b) {
  const va = a && Number.isFinite(a.v) ? a.v : 0;
  const vb = b && Number.isFinite(b.v) ? b.v : 0;
  if (va !== vb) return va - vb;
  const ba = a && typeof a.by === "string" ? a.by : "";
  const bb = b && typeof b.by === "string" ? b.by : "";
  if (ba === bb) return 0;
  return ba > bb ? 1 : -1;
}

function maxVersion(a, b) {
  return versionCmp(a, b) >= 0 ? a : b;
}

function nextRealtimeVersion() {
  state.realtime.clock = Math.max(1, state.realtime.clock + 1);
  return { v: state.realtime.clock, by: state.realtime.clientId };
}

function resetRealtimeVersionState(graph) {
  state.realtime.nodeVersions = new Map();
  state.realtime.edgeVersions = new Map();
  state.realtime.nodeTombstones = new Map();
  state.realtime.edgeTombstones = new Map();
  state.realtime.clock = 1;
  const base = { v: 1, by: state.realtime.clientId || "local" };
  for (const node of (graph && graph.nodes) || []) {
    state.realtime.nodeVersions.set(node.id, base);
  }
  for (const edge of (graph && graph.edges) || []) {
    state.realtime.edgeVersions.set(edge.id, base);
  }
}

function graphDiff(before, after) {
  const nodeBefore = new Map(before.nodes.map((node) => [node.id, node]));
  const nodeAfter = new Map(after.nodes.map((node) => [node.id, node]));
  const edgeBefore = new Map(before.edges.map((edge) => [edge.id, edge]));
  const edgeAfter = new Map(after.edges.map((edge) => [edge.id, edge]));

  const nodeUpserts = [];
  const nodeDeletes = [];
  const edgeUpserts = [];
  const edgeDeletes = [];

  for (const [id, node] of nodeAfter.entries()) {
    const prev = nodeBefore.get(id);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(node)) {
      nodeUpserts.push(core.cloneGraph(node));
    }
  }
  for (const id of nodeBefore.keys()) {
    if (!nodeAfter.has(id)) nodeDeletes.push(id);
  }
  for (const [id, edge] of edgeAfter.entries()) {
    const prev = edgeBefore.get(id);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(edge)) {
      edgeUpserts.push(core.cloneGraph(edge));
    }
  }
  for (const id of edgeBefore.keys()) {
    if (!edgeAfter.has(id)) edgeDeletes.push(id);
  }

  return { nodeUpserts, nodeDeletes, edgeUpserts, edgeDeletes };
}

function createRealtimePatch(before, after) {
  const diff = graphDiff(before, after);
  const nodeUpserts = diff.nodeUpserts.map((node) => {
    const version = nextRealtimeVersion();
    state.realtime.nodeVersions.set(node.id, version);
    state.realtime.nodeTombstones.delete(node.id);
    return { node, version };
  });
  const nodeDeletes = diff.nodeDeletes.map((id) => {
    const version = nextRealtimeVersion();
    state.realtime.nodeTombstones.set(id, version);
    state.realtime.nodeVersions.delete(id);
    return { id, version };
  });
  const edgeUpserts = diff.edgeUpserts.map((edge) => {
    const version = nextRealtimeVersion();
    state.realtime.edgeVersions.set(edge.id, version);
    state.realtime.edgeTombstones.delete(edge.id);
    return { edge, version };
  });
  const edgeDeletes = diff.edgeDeletes.map((id) => {
    const version = nextRealtimeVersion();
    state.realtime.edgeTombstones.set(id, version);
    state.realtime.edgeVersions.delete(id);
    return { id, version };
  });
  return {
    nodes: { upserts: nodeUpserts, deletes: nodeDeletes },
    edges: { upserts: edgeUpserts, deletes: edgeDeletes },
    nextId: after.nextId,
    preferredLayout: state.preferredLayout || "horizontal",
    defaultEdgeShape: normalizeEdgeShape(state.defaultEdgeShape),
    maxClock: state.realtime.clock,
  };
}

function pruneSeenActions() {
  const now = Date.now();
  for (const [id, ts] of state.realtime.seenActions.entries()) {
    if (now - ts > 10 * 60 * 1000) {
      state.realtime.seenActions.delete(id);
    }
  }
}

function hasSeenAction(actionId) {
  if (!actionId) return false;
  return state.realtime.seenActions.has(actionId);
}

function markSeenAction(actionId) {
  if (!actionId) return;
  state.realtime.seenActions.set(actionId, Date.now());
  if (state.realtime.seenActions.size > 500) pruneSeenActions();
}

function trackRealtimePresence() {
  if (!state.realtime.connected || !state.realtime.channel) return;
  const payload = {
    clientId: state.realtime.clientId,
    name: state.realtime.clientName,
    selectedNodeId: state.selectedNodeId || null,
    projectId: state.currentProjectId || "",
    ts: Date.now(),
  };
  state.realtime.channel.track(payload).catch(() => {});
}

function broadcastRealtimePatch(patch, reason = "update") {
  if (!state.realtime.enabled || !state.realtime.connected || !state.realtime.channel) return;
  if (state.realtime.applyingRemote || state.realtime.suppressBroadcast) return;
  if (!patch) return;
  const actionId = `${state.realtime.clientId}:${++state.realtime.seq}`;
  markSeenAction(actionId);
  const payload = {
    actionId,
    sourceId: state.realtime.clientId,
    projectId: state.currentProjectId || "",
    reason,
    at: Date.now(),
    patch,
  };
  state.realtime.channel.send({
    type: "broadcast",
    event: "graph-patch",
    payload,
  }).catch(() => {});
}

function applyRemoteSnapshot(payload) {
  if (!payload || payload.projectId !== state.currentProjectId) return;
  if (payload.sourceId === state.realtime.clientId) return;
  if (!payload.graph) return;
  const snapshotAt = Number(payload.at) || Date.now();
  if (snapshotAt <= state.realtime.lastSnapshotAt) return;
  const validated = core.validateAndNormalizeData(payload.graph);
  if (!validated.ok) return;
  state.realtime.lastSnapshotAt = snapshotAt;
  state.realtime.applyingRemote = true;
  history.clear();
  state.graph = validated.data;
  state.preferredLayout = payload.preferredLayout || state.preferredLayout || "horizontal";
  state.defaultEdgeShape = normalizeEdgeShape(payload.defaultEdgeShape || deriveDefaultEdgeShapeFromGraph());
  if (Number.isFinite(payload.maxClock)) {
    state.realtime.clock = Math.max(state.realtime.clock, Number(payload.maxClock));
  }
  resetRealtimeVersionState(state.graph);
  state.selectedEdgeId = null;
  if (state.selectedNodeId && !getNode(state.selectedNodeId)) state.selectedNodeId = null;
  saveNow();
  requestRender();
  setStatus("Synchronisation en direct reçue", false);
  state.realtime.applyingRemote = false;
}

function applyRemotePatch(payload) {
  if (!payload || payload.projectId !== state.currentProjectId) return;
  if (payload.sourceId === state.realtime.clientId) return;
  if (hasSeenAction(payload.actionId)) return;
  markSeenAction(payload.actionId);

  const patch = payload.patch;
  if (!patch || typeof patch !== "object") return;
  if (Number.isFinite(patch.maxClock)) {
    state.realtime.clock = Math.max(state.realtime.clock, Number(patch.maxClock));
  }

  const next = core.cloneGraph(state.graph);
  const nodeMap = new Map(next.nodes.map((node) => [node.id, node]));
  const edgeMap = new Map(next.edges.map((edge) => [edge.id, edge]));

  for (const item of (patch.nodes && patch.nodes.deletes) || []) {
    const id = String(item && item.id ? item.id : "");
    if (!id) continue;
    const remoteVersion = item.version || { v: 0, by: "" };
    const localVersion = maxVersion(state.realtime.nodeVersions.get(id), state.realtime.nodeTombstones.get(id));
    if (versionCmp(remoteVersion, localVersion) <= 0) continue;
    nodeMap.delete(id);
    state.realtime.nodeVersions.delete(id);
    state.realtime.nodeTombstones.set(id, remoteVersion);
  }

  for (const item of (patch.nodes && patch.nodes.upserts) || []) {
    const node = item && item.node;
    if (!node || !node.id) continue;
    const id = String(node.id);
    const remoteVersion = item.version || { v: 0, by: "" };
    const localVersion = maxVersion(state.realtime.nodeVersions.get(id), state.realtime.nodeTombstones.get(id));
    if (versionCmp(remoteVersion, localVersion) <= 0) continue;
    nodeMap.set(id, core.cloneGraph(node));
    state.realtime.nodeVersions.set(id, remoteVersion);
    state.realtime.nodeTombstones.delete(id);
  }

  for (const item of (patch.edges && patch.edges.deletes) || []) {
    const id = String(item && item.id ? item.id : "");
    if (!id) continue;
    const remoteVersion = item.version || { v: 0, by: "" };
    const localVersion = maxVersion(state.realtime.edgeVersions.get(id), state.realtime.edgeTombstones.get(id));
    if (versionCmp(remoteVersion, localVersion) <= 0) continue;
    edgeMap.delete(id);
    state.realtime.edgeVersions.delete(id);
    state.realtime.edgeTombstones.set(id, remoteVersion);
  }

  for (const item of (patch.edges && patch.edges.upserts) || []) {
    const edge = item && item.edge;
    if (!edge || !edge.id) continue;
    const id = String(edge.id);
    const remoteVersion = item.version || { v: 0, by: "" };
    const localVersion = maxVersion(state.realtime.edgeVersions.get(id), state.realtime.edgeTombstones.get(id));
    if (versionCmp(remoteVersion, localVersion) <= 0) continue;
    edgeMap.set(id, core.cloneGraph(edge));
    state.realtime.edgeVersions.set(id, remoteVersion);
    state.realtime.edgeTombstones.delete(id);
  }

  const filteredEdges = Array.from(edgeMap.values()).filter(
    (edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target),
  );
  const candidate = {
    nodes: Array.from(nodeMap.values()),
    edges: filteredEdges,
    nextId: Math.max(Number(state.graph.nextId) || 1, Number(patch.nextId) || 1),
  };
  const validated = core.validateAndNormalizeData(candidate);
  if (!validated.ok) return;

  state.realtime.applyingRemote = true;
  state.graph = validated.data;
  state.realtime.lastRemoteAt = Math.max(state.realtime.lastRemoteAt, Number(payload.at) || Date.now());
  state.preferredLayout = patch.preferredLayout || state.preferredLayout || "horizontal";
  state.defaultEdgeShape = normalizeEdgeShape(patch.defaultEdgeShape || state.defaultEdgeShape);
  if (state.selectedNodeId && !getNode(state.selectedNodeId)) state.selectedNodeId = null;
  if (state.selectedEdgeId && !getEdge(state.selectedEdgeId)) state.selectedEdgeId = null;
  saveNow();
  requestRender();
  state.realtime.applyingRemote = false;
}

function sendSnapshotResponse(targetClientId) {
  if (!state.realtime.connected || !state.realtime.channel || !targetClientId) return;
  const payload = {
    sourceId: state.realtime.clientId,
    targetClientId,
    projectId: state.currentProjectId || "",
    at: Date.now(),
    graph: core.cloneGraph(state.graph),
    preferredLayout: state.preferredLayout || "horizontal",
    defaultEdgeShape: normalizeEdgeShape(state.defaultEdgeShape),
    maxClock: state.realtime.clock,
  };
  state.realtime.channel.send({
    type: "broadcast",
    event: "snapshot-sync",
    payload,
  }).catch(() => {});
}

function ensureRealtimeClient() {
  if (state.realtime.client) return state.realtime.client;
  const cfg = cloudConfig();
  if (!cfg.enabled) return null;
  if (!window.supabase || typeof window.supabase.createClient !== "function") return null;
  try {
    state.realtime.client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return state.realtime.client;
  } catch {
    return null;
  }
}

async function leaveRealtimeChannel() {
  const client = state.realtime.client;
  const channel = state.realtime.channel;
  state.realtime.channel = null;
  state.realtime.connected = false;
  state.realtime.peers = new Map();
  updatePresenceBar();
  if (client && channel) {
    try {
      await client.removeChannel(channel);
    } catch {
    }
  }
}

async function joinRealtimeChannelForProject(projectId) {
  await leaveRealtimeChannel();
  if (!state.realtime.enabled || !projectId) return;
  state.realtime.seq = 0;
  state.realtime.seenActions = new Map();
  state.realtime.lastRemoteAt = 0;
  state.realtime.lastSnapshotAt = 0;
  resetRealtimeVersionState(state.graph);
  const client = ensureRealtimeClient();
  if (!client) return;
  const base = state.cloudSyncWorkspace.replace(/[^a-zA-Z0-9_-]/g, "-");
  const name = `mindmap-${base}-${projectId}`.slice(0, 180);
  const channel = client.channel(name, {
    config: {
      broadcast: { self: false, ack: false },
      presence: { key: state.realtime.clientId },
    },
  });

  channel
    .on("presence", { event: "sync" }, () => {
      refreshPresenceFromChannel();
    })
    .on("presence", { event: "join" }, () => {
      refreshPresenceFromChannel();
    })
    .on("presence", { event: "leave" }, () => {
      refreshPresenceFromChannel();
    })
    .on("broadcast", { event: "graph-patch" }, ({ payload }) => {
      applyRemotePatch(payload || null);
    })
    .on("broadcast", { event: "snapshot-request" }, ({ payload }) => {
      if (!payload || payload.projectId !== state.currentProjectId) return;
      if (payload.sourceId === state.realtime.clientId) return;
      sendSnapshotResponse(payload.sourceId);
    })
    .on("broadcast", { event: "snapshot-sync" }, ({ payload }) => {
      if (!payload || payload.projectId !== state.currentProjectId) return;
      if (payload.targetClientId !== state.realtime.clientId) return;
      applyRemoteSnapshot(payload || null);
    });

  state.realtime.channel = channel;
  await new Promise((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        state.realtime.connected = true;
        updatePresenceBar();
        trackRealtimePresence();
        channel.send({
          type: "broadcast",
          event: "snapshot-request",
          payload: {
            sourceId: state.realtime.clientId,
            projectId: state.currentProjectId || "",
            at: Date.now(),
          },
        }).catch(() => {});
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        state.realtime.connected = false;
        updatePresenceBar();
      }
    });
    window.setTimeout(resolve, 2200);
  });
}

function cloudRowFromRecord(record) {
  return {
    workspace_id: state.cloudSyncWorkspace,
    project_id: record.id,
    name: record.name,
    graph: core.cloneGraph(record.graph),
    preferred_layout: record.preferredLayout || "horizontal",
    default_edge_shape: normalizeEdgeShape(record.defaultEdgeShape || "geometrique"),
    created_at: record.createdAt || new Date().toISOString(),
    updated_at: record.updatedAt || new Date().toISOString(),
  };
}

function recordFromCloudRow(row) {
  return toProjectRecord({
    id: row.project_id,
    name: row.name || "Sans nom",
    graph: row.graph || createDefaultGraph(),
    preferredLayout: row.preferred_layout || "horizontal",
    defaultEdgeShape: normalizeEdgeShape(row.default_edge_shape || "geometrique"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function fetchCloudProjects() {
  const cfg = cloudConfig();
  if (!cfg.enabled) return [];
  const url = `${cfg.url}/rest/v1/mindmap_projects?workspace_id=eq.${encodeURIComponent(
    state.cloudSyncWorkspace,
  )}&select=workspace_id,project_id,name,graph,preferred_layout,default_edge_shape,created_at,updated_at&order=updated_at.desc`;
  const response = await fetch(url, { headers: cloudHeaders() });
  if (!response.ok) throw new Error(`Cloud list ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function upsertCloudProject(record) {
  const cfg = cloudConfig();
  if (!cfg.enabled) return;
  const url = `${cfg.url}/rest/v1/mindmap_projects?on_conflict=workspace_id,project_id`;
  const body = [cloudRowFromRecord(record)];
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...cloudHeaders(),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Cloud upsert ${response.status}`);
}

async function deleteCloudProject(projectId) {
  const cfg = cloudConfig();
  if (!cfg.enabled) return;
  const url = `${cfg.url}/rest/v1/mindmap_projects?workspace_id=eq.${encodeURIComponent(
    state.cloudSyncWorkspace,
  )}&project_id=eq.${encodeURIComponent(projectId)}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      ...cloudHeaders(),
      Prefer: "return=minimal",
    },
  });
  if (!response.ok) throw new Error(`Cloud delete ${response.status}`);
}

function createDefaultGraph() {
  return {
    nodes: [{ id: "1", x: 180, y: 140, title: "Projet", color: "#ffd166", parentId: null }],
    edges: [],
    nextId: 2,
  };
}

function toProjectRecord({
  id,
  name,
  graph,
  createdAt = new Date().toISOString(),
  updatedAt = new Date().toISOString(),
  preferredLayout = state.preferredLayout,
  defaultEdgeShape = state.defaultEdgeShape,
}) {
  return {
    id,
    name,
    graph: core.cloneGraph(graph),
    createdAt,
    updatedAt,
    preferredLayout,
    defaultEdgeShape: normalizeEdgeShape(defaultEdgeShape),
  };
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Erreur IndexedDB"));
  });
}

function getProjectDb() {
  if (state.projectDbPromise) return state.projectDbPromise;
  state.projectDbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(PROJECTS_DB_NAME, PROJECTS_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Impossible d'ouvrir la base locale."));
  });
  return state.projectDbPromise;
}

async function listProjectsFromDb() {
  const db = await getProjectDb();
  const tx = db.transaction(PROJECTS_STORE, "readonly");
  const store = tx.objectStore(PROJECTS_STORE);
  const rows = await idbRequest(store.getAll());
  return Array.isArray(rows) ? rows : [];
}

async function getProjectFromDb(id) {
  const db = await getProjectDb();
  const tx = db.transaction(PROJECTS_STORE, "readonly");
  const store = tx.objectStore(PROJECTS_STORE);
  return idbRequest(store.get(id));
}

async function putProjectToDb(record) {
  const db = await getProjectDb();
  const tx = db.transaction(PROJECTS_STORE, "readwrite");
  const store = tx.objectStore(PROJECTS_STORE);
  await idbRequest(store.put(record));
}

async function deleteProjectFromDb(id) {
  const db = await getProjectDb();
  const tx = db.transaction(PROJECTS_STORE, "readwrite");
  const store = tx.objectStore(PROJECTS_STORE);
  await idbRequest(store.delete(id));
}

function makeProjectId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `project-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function refreshProjectUi() {
  if (!els.projectSelect) return;
  const previous = els.projectSelect.value;
  els.projectSelect.replaceChildren();
  for (const project of state.projects) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name || "Sans nom";
    els.projectSelect.appendChild(option);
  }
  els.projectSelect.value = state.currentProjectId || previous || "";
  const hasProject = state.projects.length > 0;
  const isSingle = state.projects.length <= 1;
  if (els.projectRenameBtn) els.projectRenameBtn.disabled = !hasProject;
  if (els.projectDeleteBtn) els.projectDeleteBtn.disabled = !hasProject || isSingle;
}

async function refreshProjectsFromDb() {
  const rows = await listProjectsFromDb();
  rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr"));
  state.projects = rows.map((row) => ({ id: row.id, name: row.name || "Sans nom" }));
  refreshProjectUi();
}

function loadProjectIntoState(record, label) {
  if (!record || !record.graph) return false;
  const validated = core.validateAndNormalizeData(record.graph);
  if (!validated.ok) return false;
  history.clear();
  state.preferredLayout = record.preferredLayout || state.preferredLayout || "horizontal";
  state.graph = applyPreferredLayout(validated.data);
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  state.inlineEditNodeId = null;
  state.linkDraft = null;
  state.linkMode = false;
  state.currentProjectId = record.id;
  state.currentProjectName = record.name || "Sans nom";
  state.defaultEdgeShape = normalizeEdgeShape(record.defaultEdgeShape || deriveDefaultEdgeShapeFromGraph());
  resetRealtimeVersionState(state.graph);
  state.lastSavedHash = graphHash();
  localStorage.setItem(ACTIVE_PROJECT_KEY, record.id);
  if (label) setStatus(label, false);
  refreshProjectUi();
  requestRender();
  return true;
}

async function persistCurrentProjectToDb() {
  if (!state.currentProjectId) return;
  const now = new Date().toISOString();
  const record = toProjectRecord({
    id: state.currentProjectId,
    name: state.currentProjectName || "Sans nom",
    graph: state.graph,
    preferredLayout: state.preferredLayout,
    defaultEdgeShape: state.defaultEdgeShape,
    updatedAt: now,
  });
  const existing = await getProjectFromDb(state.currentProjectId);
  if (existing && existing.createdAt) {
    record.createdAt = existing.createdAt;
  } else {
    record.createdAt = now;
  }
  await putProjectToDb(record);
  if (state.cloudSyncEnabled) {
    await upsertCloudProject(record);
  }
}

async function syncCloudToLocal() {
  if (!state.cloudSyncEnabled) return;
  const cloudRows = await fetchCloudProjects();
  const localRows = await listProjectsFromDb();

  if (!cloudRows.length) {
    for (const local of localRows) {
      await upsertCloudProject(local);
    }
    return;
  }

  const cloudRecords = cloudRows.map(recordFromCloudRow);
  const cloudMap = new Map(cloudRecords.map((record) => [record.id, record]));
  for (const record of cloudRecords) {
    await putProjectToDb(record);
  }
  for (const local of localRows) {
    if (!cloudMap.has(local.id)) {
      await deleteProjectFromDb(local.id);
    }
  }
}

async function syncCloudFromCurrentState() {
  if (!state.cloudSyncEnabled || !state.currentProjectId) return;
  const record = toProjectRecord({
    id: state.currentProjectId,
    name: state.currentProjectName || "Sans nom",
    graph: state.graph,
    preferredLayout: state.preferredLayout,
    defaultEdgeShape: state.defaultEdgeShape,
    updatedAt: new Date().toISOString(),
  });
  await upsertCloudProject(record);
}

function setStatus(_message, _isError) {
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

function isPostitNode(node) {
  return Boolean(node && node.kind === "postit");
}

function getNodeWidth(node) {
  const base = isPostitNode(node) ? 240 : core.NODE_WIDTH;
  const value = Number(node && node.width);
  if (!Number.isFinite(value)) return base;
  return Math.max(120, Math.min(760, Math.round(value)));
}

function getNodeHeight(node) {
  const base = isPostitNode(node) ? 140 : core.NODE_HEIGHT;
  const value = Number(node && node.height);
  if (!Number.isFinite(value)) return base;
  return Math.max(56, Math.min(720, Math.round(value)));
}

function getEdge(id) {
  return state.graph.edges.find((edge) => edge.id === id);
}

function getEdgeColor(edge) {
  if (edge && typeof edge.color === "string" && /^#[0-9a-fA-F]{6}$/.test(edge.color)) {
    return edge.color;
  }
  return edge && edge.type === "free" ? "#e15d44" : "#6d86b8";
}

function getEdgeStyle(edge) {
  return edge && (edge.style === "dashed" || edge.style === "dotted") ? edge.style : "solid";
}

function getEdgeDashArray(edge) {
  const style = getEdgeStyle(edge);
  if (style === "dashed") return "7 5";
  if (style === "dotted") return "2 5";
  return "0";
}

function getEdgeShape(edge) {
  if (edge && (edge.shape === "arrondi" || edge.shape === "courbe")) return edge.shape;
  return "geometrique";
}

function normalizeEdgeShape(value) {
  if (value === "arrondi" || value === "courbe") return value;
  return "geometrique";
}

function normalizeTextAlign(value, fallback = "left") {
  if (value === "center" || value === "right" || value === "left") return value;
  return fallback;
}

function normalizeTitleLink(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 500);
}

function isValidHttpLink(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function extractFirstHttpLink(text) {
  if (typeof text !== "string") return "";
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!match || !match[0]) return "";
  const cleaned = match[0].replace(/[),.;!?]+$/, "");
  return isValidHttpLink(cleaned) ? cleaned : "";
}

function getExportLink(explicitLink, textFallback) {
  if (isValidHttpLink(explicitLink)) return explicitLink;
  return extractFirstHttpLink(textFallback);
}

function getTextAlignForNode(node) {
  return normalizeTextAlign(node && node.textAlign, "left");
}

function getTextAlignForEdge(edge) {
  return normalizeTextAlign(edge && edge.textAlign, "center");
}

function isTextBold(target) {
  return Boolean(target && target.textBold);
}

function isTextItalic(target) {
  return Boolean(target && target.textItalic);
}

function svgAnchorForAlign(align) {
  if (align === "left") return "start";
  if (align === "right") return "end";
  return "middle";
}

function deriveDefaultEdgeShapeFromGraph() {
  if (!state.graph.edges.length) return state.defaultEdgeShape;
  const counts = new Map([
    ["geometrique", 0],
    ["arrondi", 0],
    ["courbe", 0],
  ]);
  for (const edge of state.graph.edges) {
    const shape = getEdgeShape(edge);
    counts.set(shape, (counts.get(shape) || 0) + 1);
  }
  let bestShape = "geometrique";
  let maxCount = -1;
  for (const [shape, count] of counts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      bestShape = shape;
    }
  }
  return bestShape;
}

function buildObstacle(node, padding = 0) {
  const nodeWidth = getNodeWidth(node);
  const nodeHeight = getNodeHeight(node);
  return {
    left: node.x - padding,
    top: node.y - padding,
    right: node.x + nodeWidth + padding,
    bottom: node.y + nodeHeight + padding,
  };
}

function pointInsideObstacle(point, obstacle) {
  return (
    point.x > obstacle.left
    && point.x < obstacle.right
    && point.y > obstacle.top
    && point.y < obstacle.bottom
  );
}

function segmentIntersectsObstacle(a, b, obstacle) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  if (dx < 0.01 && dy < 0.01) return false;
  if (dx > 0.01 && dy > 0.01) return true;

  if (dx < 0.01) {
    const x = a.x;
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    return x >= obstacle.left && x <= obstacle.right && maxY >= obstacle.top && minY <= obstacle.bottom;
  }

  const y = a.y;
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  return y >= obstacle.top && y <= obstacle.bottom && maxX >= obstacle.left && minX <= obstacle.right;
}

function pathIntersectsObstacles(points, obstacles) {
  if (!points || points.length < 2) return false;
  for (const obstacle of obstacles) {
    for (const point of points) {
      if (pointInsideObstacle(point, obstacle)) return true;
    }
    for (let i = 0; i < points.length - 1; i += 1) {
      if (segmentIntersectsObstacle(points[i], points[i + 1], obstacle)) return true;
    }
  }
  return false;
}

function compressOrthogonalPath(points) {
  const compact = [];
  for (const point of points) {
    const prev = compact[compact.length - 1];
    if (!prev || Math.abs(prev.x - point.x) > 0.01 || Math.abs(prev.y - point.y) > 0.01) {
      compact.push({ x: point.x, y: point.y });
    }
  }
  let changed = true;
  while (changed && compact.length >= 3) {
    changed = false;
    for (let i = 1; i < compact.length - 1; i += 1) {
      const a = compact[i - 1];
      const b = compact[i];
      const c = compact[i + 1];
      const collinearX = Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01;
      const collinearY = Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01;
      if (collinearX || collinearY) {
        compact.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return compact;
}

function polylineLength(points) {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
  }
  return total;
}

function segmentLength(a, b) {
  return Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
}

function alignToStep(value, step = ROUTE_ALIGN_STEP) {
  return Math.round(value / step) * step;
}

function countTurns(points) {
  if (!points || points.length < 3) return 0;
  let turns = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    const abVertical = Math.abs(a.x - b.x) < 0.01;
    const bcVertical = Math.abs(b.x - c.x) < 0.01;
    const abHorizontal = Math.abs(a.y - b.y) < 0.01;
    const bcHorizontal = Math.abs(b.y - c.y) < 0.01;
    const isTurn = (abVertical && bcHorizontal) || (abHorizontal && bcVertical);
    if (isTurn) turns += 1;
  }
  return turns;
}

function shortSegmentPenalty(points) {
  if (!points || points.length < 2) return 0;
  let penalty = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const len = segmentLength(points[i], points[i + 1]);
    if (len > 0 && len < ROUTE_CHANNEL * 0.7) {
      penalty += EDGE_SHORT_SEGMENT_PENALTY;
    }
  }
  return penalty;
}

function rangeOverlap(a1, a2, b1, b2) {
  const start = Math.max(Math.min(a1, a2), Math.min(b1, b2));
  const end = Math.min(Math.max(a1, a2), Math.max(b1, b2));
  return Math.max(0, end - start);
}

function segmentConflictCost(a, b, c, d) {
  const abVertical = Math.abs(a.x - b.x) < 0.01;
  const cdVertical = Math.abs(c.x - d.x) < 0.01;
  const abHorizontal = Math.abs(a.y - b.y) < 0.01;
  const cdHorizontal = Math.abs(c.y - d.y) < 0.01;

  if ((abVertical && cdVertical && Math.abs(a.x - c.x) < 0.01)) {
    const overlap = rangeOverlap(a.y, b.y, c.y, d.y);
    return overlap * EDGE_OVERLAP_PENALTY;
  }
  if ((abHorizontal && cdHorizontal && Math.abs(a.y - c.y) < 0.01)) {
    const overlap = rangeOverlap(a.x, b.x, c.x, d.x);
    return overlap * EDGE_OVERLAP_PENALTY;
  }

  if ((abVertical && cdHorizontal) || (abHorizontal && cdVertical)) {
    const v1 = abVertical ? a : c;
    const v2 = abVertical ? b : d;
    const h1 = abHorizontal ? a : c;
    const h2 = abHorizontal ? b : d;
    const vx = v1.x;
    const hy = h1.y;
    const onV = hy >= Math.min(v1.y, v2.y) && hy <= Math.max(v1.y, v2.y);
    const onH = vx >= Math.min(h1.x, h2.x) && vx <= Math.max(h1.x, h2.x);
    if (onV && onH) return EDGE_CROSS_PENALTY;
  }
  return 0;
}

function pathConflictScore(points, occupiedSegments) {
  if (!points || points.length < 2 || !occupiedSegments.length) return 0;
  let score = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (segmentLength(a, b) < 0.01) continue;
    for (const existing of occupiedSegments) {
      score += segmentConflictCost(a, b, existing.a, existing.b);
    }
  }
  return score;
}

function addPathSegments(points, occupiedSegments) {
  if (!points || points.length < 2) return;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (segmentLength(a, b) < 0.01) continue;
    occupiedSegments.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } });
  }
}

function polylineMidpoint(points) {
  if (!points || points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  const total = polylineLength(points);
  if (total <= 0.01) {
    const first = points[0];
    return { x: first.x, y: first.y };
  }
  const target = total / 2;
  let walked = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const seg = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (walked + seg >= target) {
      const ratio = (target - walked) / Math.max(0.0001, seg);
      return {
        x: a.x + (b.x - a.x) * ratio,
        y: a.y + (b.y - a.y) * ratio,
      };
    }
    walked += seg;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y };
}

function edgeAnchors(source, target) {
  const sourceWidth = getNodeWidth(source);
  const sourceHeight = getNodeHeight(source);
  const targetWidth = getNodeWidth(target);
  const targetHeight = getNodeHeight(target);
  const sx = source.x + sourceWidth / 2;
  const sy = source.y + sourceHeight / 2;
  const tx = target.x + targetWidth / 2;
  const ty = target.y + targetHeight / 2;
  const dx = tx - sx;
  const dy = ty - sy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return {
        start: { x: source.x + sourceWidth, y: sy, side: "right" },
        end: { x: target.x, y: ty, side: "left" },
      };
    }
    return {
      start: { x: source.x, y: sy, side: "left" },
      end: { x: target.x + targetWidth, y: ty, side: "right" },
    };
  }
  if (dy >= 0) {
    return {
      start: { x: sx, y: source.y + sourceHeight, side: "bottom" },
      end: { x: tx, y: target.y, side: "top" },
    };
  }
  return {
    start: { x: sx, y: source.y, side: "top" },
    end: { x: tx, y: target.y + targetHeight, side: "bottom" },
  };
}

function getTreeFanSide(parent, layout) {
  const parentCenterX = parent.x + getNodeWidth(parent) / 2;
  const parentCenterY = parent.y + getNodeHeight(parent) / 2;
  const children = state.graph.nodes.filter((node) => node.parentId === parent.id);
  if (!children.length) {
    return layout === "vertical" ? "bottom" : "right";
  }

  if (layout === "vertical") {
    const score = children.reduce((sum, child) => sum + (child.y + getNodeHeight(child) / 2 - parentCenterY), 0);
    return score >= 0 ? "bottom" : "top";
  }

  const score = children.reduce((sum, child) => sum + (child.x + getNodeWidth(child) / 2 - parentCenterX), 0);
  return score >= 0 ? "right" : "left";
}

function treeEdgeAnchors(source, target, edge) {
  const layout = state.preferredLayout || "horizontal";
  const sourceWidth = getNodeWidth(source);
  const sourceHeight = getNodeHeight(source);
  const targetWidth = getNodeWidth(target);
  const targetHeight = getNodeHeight(target);
  const sx = source.x + sourceWidth / 2;
  const sy = source.y + sourceHeight / 2;
  const tx = target.x + targetWidth / 2;
  const ty = target.y + targetHeight / 2;

  const sourceIsParent = edge && target.parentId === source.id;
  const fixedSide = sourceIsParent ? getTreeFanSide(source, layout) : null;

  if (layout === "vertical") {
    const side = fixedSide || (ty >= sy ? "bottom" : "top");
    if (side === "bottom") {
      return {
        start: { x: sx, y: source.y + sourceHeight, side: "bottom" },
        end: { x: tx, y: target.y, side: "top" },
      };
    }
    return {
      start: { x: sx, y: source.y, side: "top" },
      end: { x: tx, y: target.y + targetHeight, side: "bottom" },
    };
  }

  const side = fixedSide || (tx >= sx ? "right" : "left");
  if (side === "right") {
    return {
      start: { x: source.x + sourceWidth, y: sy, side: "right" },
      end: { x: target.x, y: ty, side: "left" },
    };
  }
  return {
    start: { x: source.x, y: sy, side: "left" },
    end: { x: target.x + targetWidth, y: ty, side: "right" },
  };
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function parentChildren(parentId) {
  return state.graph.nodes.filter((node) => node.parentId === parentId);
}

function computeTreeBusCoordinate(parent, layout, side) {
  const children = parentChildren(parent.id);
  const parentWidth = getNodeWidth(parent);
  const parentHeight = getNodeHeight(parent);
  if (layout === "vertical") {
    const startY = side === "bottom" ? parent.y + parentHeight : parent.y;
    const childPorts = children.map((child) => (side === "bottom" ? child.y : child.y + getNodeHeight(child)));
    const avgPort = childPorts.length
      ? childPorts.reduce((sum, value) => sum + value, 0) / childPorts.length
      : (side === "bottom" ? startY + 220 : startY - 220);
    let bus = alignToStep((startY + avgPort) / 2);
    if (side === "bottom") {
      const min = startY + ROUTE_STUB;
      const max = childPorts.length ? Math.max(min, Math.min(...childPorts) - ROUTE_STUB) : min + 260;
      bus = clamp(bus, min, max);
    } else {
      const min = childPorts.length ? Math.min(startY - ROUTE_STUB, Math.max(...childPorts) + ROUTE_STUB) : startY - 260;
      const max = startY - ROUTE_STUB;
      bus = clamp(bus, min, max);
    }
    return bus;
  }

  const startX = side === "right" ? parent.x + parentWidth : parent.x;
  const childPorts = children.map((child) => (side === "right" ? child.x : child.x + getNodeWidth(child)));
  const avgPort = childPorts.length
    ? childPorts.reduce((sum, value) => sum + value, 0) / childPorts.length
    : (side === "right" ? startX + 220 : startX - 220);
  let bus = alignToStep((startX + avgPort) / 2);
  if (side === "right") {
    const min = startX + ROUTE_STUB;
    const max = childPorts.length ? Math.max(min, Math.min(...childPorts) - ROUTE_STUB) : min + 260;
    bus = clamp(bus, min, max);
  } else {
    const min = childPorts.length ? Math.min(startX - ROUTE_STUB, Math.max(...childPorts) + ROUTE_STUB) : startX - 260;
    const max = startX - ROUTE_STUB;
    bus = clamp(bus, min, max);
  }
  return bus;
}

function anchorStub(anchor, distance = ROUTE_STUB) {
  if (anchor.side === "right") return { x: anchor.x + distance, y: anchor.y };
  if (anchor.side === "left") return { x: anchor.x - distance, y: anchor.y };
  if (anchor.side === "bottom") return { x: anchor.x, y: anchor.y + distance };
  return { x: anchor.x, y: anchor.y - distance };
}

function computeTreeAlignedRoute(edge, source, target, occupiedSegments = []) {
  const anchors = treeEdgeAnchors(source, target, edge);
  const start = { x: anchors.start.x, y: anchors.start.y };
  const end = { x: anchors.end.x, y: anchors.end.y };
  const layout = state.preferredLayout || "horizontal";
  const side = anchors.start.side;

  let points = null;
  if (layout === "vertical") {
    const busY = computeTreeBusCoordinate(source, layout, side);
    points = compressOrthogonalPath([
      start,
      { x: start.x, y: busY },
      { x: end.x, y: busY },
      end,
    ]);
  } else {
    const busX = computeTreeBusCoordinate(source, layout, side);
    points = compressOrthogonalPath([
      start,
      { x: busX, y: start.y },
      { x: busX, y: end.y },
      end,
    ]);
  }

  const obstacles = state.graph.nodes
    .filter((node) => !isPostitNode(node) && node.id !== source.id && node.id !== target.id)
    .map((node) => buildObstacle(node, ROUTE_NODE_PADDING));
  if (pathIntersectsObstacles(points, obstacles)) {
    return null;
  }
  // Keep deterministic tree alignment even with minor overlaps.
  return points;
}

function uniqueSortedCandidates(values, center) {
  const dedupe = new Set();
  const list = [];
  for (const raw of values) {
    if (!Number.isFinite(raw)) continue;
    const value = alignToStep(raw);
    if (dedupe.has(value)) continue;
    dedupe.add(value);
    list.push(value);
  }
  const alignedCenter = alignToStep(center);
  list.sort((a, b) => Math.abs(a - alignedCenter) - Math.abs(b - alignedCenter));
  return list;
}

function routeOrthogonal(start, end, obstacles, bounds, occupiedSegments = []) {
  const candidates = [];

  candidates.push([start, end]);
  candidates.push([start, { x: end.x, y: start.y }, end]);
  candidates.push([start, { x: start.x, y: end.y }, end]);

  const minX = bounds.x - ROUTE_CHANNEL * 4;
  const maxX = bounds.x + bounds.width + ROUTE_CHANNEL * 4;
  const minY = bounds.y - ROUTE_CHANNEL * 4;
  const maxY = bounds.y + bounds.height + ROUTE_CHANNEL * 4;

  const xCandidates = uniqueSortedCandidates(
    [
      start.x,
      end.x,
      (start.x + end.x) / 2,
      minX,
      maxX,
      ...obstacles.flatMap((o) => [o.left - ROUTE_CHANNEL, o.right + ROUTE_CHANNEL]),
    ],
    (start.x + end.x) / 2,
  );
  const yCandidates = uniqueSortedCandidates(
    [
      start.y,
      end.y,
      (start.y + end.y) / 2,
      minY,
      maxY,
      ...obstacles.flatMap((o) => [o.top - ROUTE_CHANNEL, o.bottom + ROUTE_CHANNEL]),
    ],
    (start.y + end.y) / 2,
  );

  for (const x of xCandidates.slice(0, 12)) {
    candidates.push([start, { x, y: start.y }, { x, y: end.y }, end]);
  }
  for (const y of yCandidates.slice(0, 12)) {
    candidates.push([start, { x: start.x, y }, { x: end.x, y }, end]);
  }
  for (const x of xCandidates.slice(0, 8)) {
    for (const y of yCandidates.slice(0, 8)) {
      candidates.push([start, { x, y: start.y }, { x, y }, { x: end.x, y }, end]);
      candidates.push([start, { x: start.x, y }, { x, y }, { x, y: end.y }, end]);
    }
  }

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const rawPath of candidates) {
    const path = compressOrthogonalPath(rawPath);
    if (pathIntersectsObstacles(path, obstacles)) continue;
    const score = polylineLength(path)
      + pathConflictScore(path, occupiedSegments)
      + countTurns(path) * EDGE_TURN_PENALTY
      + shortSegmentPenalty(path);
    if (score < bestScore) {
      best = path;
      bestScore = score;
    }
  }
  return best || compressOrthogonalPath([start, end]);
}

function pointsToPathData(points, offsetX = 0, offsetY = 0) {
  if (!points || points.length === 0) return "";
  let d = `M ${points[0].x - offsetX} ${points[0].y - offsetY}`;
  for (let i = 1; i < points.length; i += 1) {
    d += ` L ${points[i].x - offsetX} ${points[i].y - offsetY}`;
  }
  return d;
}

function smoothCurvePathData(points, offsetX = 0, offsetY = 0) {
  if (!points || points.length === 0) return "";
  if (points.length < 3) return pointsToPathData(points, offsetX, offsetY);
  const radius = 22;
  let d = `M ${points[0].x - offsetX} ${points[0].y - offsetY}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    const len1 = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    const len2 = Math.abs(c.x - b.x) + Math.abs(c.y - b.y);
    if (len1 < 0.01 || len2 < 0.01) continue;
    const r = Math.min(radius, len1 / 2, len2 / 2);
    const ux1 = (b.x - a.x) / len1;
    const uy1 = (b.y - a.y) / len1;
    const ux2 = (c.x - b.x) / len2;
    const uy2 = (c.y - b.y) / len2;
    const pIn = { x: b.x - ux1 * r, y: b.y - uy1 * r };
    const pOut = { x: b.x + ux2 * r, y: b.y + uy2 * r };

    const c1 = { x: pIn.x + ux1 * (r * 0.65), y: pIn.y + uy1 * (r * 0.65) };
    const c2 = { x: pOut.x - ux2 * (r * 0.65), y: pOut.y - uy2 * (r * 0.65) };
    d += ` L ${pIn.x - offsetX} ${pIn.y - offsetY}`;
    d += ` C ${c1.x - offsetX} ${c1.y - offsetY}, ${c2.x - offsetX} ${c2.y - offsetY}, ${pOut.x - offsetX} ${pOut.y - offsetY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x - offsetX} ${last.y - offsetY}`;
  return d;
}

function roundedPathData(points, offsetX = 0, offsetY = 0, radius = 14) {
  if (!points || points.length === 0) return "";
  if (points.length < 3) return pointsToPathData(points, offsetX, offsetY);
  let d = `M ${points[0].x - offsetX} ${points[0].y - offsetY}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    const len1 = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    const len2 = Math.abs(c.x - b.x) + Math.abs(c.y - b.y);
    if (len1 < 0.01 || len2 < 0.01) continue;
    const r = Math.min(radius, len1 / 2, len2 / 2);
    const ux1 = (b.x - a.x) / len1;
    const uy1 = (b.y - a.y) / len1;
    const ux2 = (c.x - b.x) / len2;
    const uy2 = (c.y - b.y) / len2;
    const pIn = { x: b.x - ux1 * r, y: b.y - uy1 * r };
    const pOut = { x: b.x + ux2 * r, y: b.y + uy2 * r };
    d += ` L ${pIn.x - offsetX} ${pIn.y - offsetY}`;
    d += ` Q ${b.x - offsetX} ${b.y - offsetY}, ${pOut.x - offsetX} ${pOut.y - offsetY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x - offsetX} ${last.y - offsetY}`;
  return d;
}

function edgePathDataForShape(points, shape, offsetX = 0, offsetY = 0) {
  if (shape === "courbe") return smoothCurvePathData(points, offsetX, offsetY);
  if (shape === "arrondi") return roundedPathData(points, offsetX, offsetY);
  return pointsToPathData(points, offsetX, offsetY);
}

function drawEdgePathOnCanvas(ctx, points, shape, offsetX = 0, offsetY = 0) {
  if (!points || points.length === 0) return;
  const first = points[0];
  ctx.moveTo(first.x - offsetX, first.y - offsetY);
  if (points.length < 2) return;

  if (shape === "courbe") {
    if (points.length < 3) {
      ctx.lineTo(points[1].x - offsetX, points[1].y - offsetY);
      return;
    }
    const radius = 22;
    for (let i = 1; i < points.length - 1; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const c = points[i + 1];
      const len1 = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const len2 = Math.abs(c.x - b.x) + Math.abs(c.y - b.y);
      if (len1 < 0.01 || len2 < 0.01) continue;
      const r = Math.min(radius, len1 / 2, len2 / 2);
      const ux1 = (b.x - a.x) / len1;
      const uy1 = (b.y - a.y) / len1;
      const ux2 = (c.x - b.x) / len2;
      const uy2 = (c.y - b.y) / len2;
      const pIn = { x: b.x - ux1 * r, y: b.y - uy1 * r };
      const pOut = { x: b.x + ux2 * r, y: b.y + uy2 * r };
      const c1 = { x: pIn.x + ux1 * (r * 0.65), y: pIn.y + uy1 * (r * 0.65) };
      const c2 = { x: pOut.x - ux2 * (r * 0.65), y: pOut.y - uy2 * (r * 0.65) };
      ctx.lineTo(pIn.x - offsetX, pIn.y - offsetY);
      ctx.bezierCurveTo(
        c1.x - offsetX,
        c1.y - offsetY,
        c2.x - offsetX,
        c2.y - offsetY,
        pOut.x - offsetX,
        pOut.y - offsetY,
      );
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x - offsetX, last.y - offsetY);
    return;
  }

  if (shape === "arrondi" && points.length >= 3) {
    const radius = 14;
    for (let i = 1; i < points.length - 1; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const c = points[i + 1];
      const len1 = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const len2 = Math.abs(c.x - b.x) + Math.abs(c.y - b.y);
      if (len1 < 0.01 || len2 < 0.01) continue;
      const r = Math.min(radius, len1 / 2, len2 / 2);
      const ux1 = (b.x - a.x) / len1;
      const uy1 = (b.y - a.y) / len1;
      const ux2 = (c.x - b.x) / len2;
      const uy2 = (c.y - b.y) / len2;
      const pIn = { x: b.x - ux1 * r, y: b.y - uy1 * r };
      const pOut = { x: b.x + ux2 * r, y: b.y + uy2 * r };
      ctx.lineTo(pIn.x - offsetX, pIn.y - offsetY);
      ctx.quadraticCurveTo(b.x - offsetX, b.y - offsetY, pOut.x - offsetX, pOut.y - offsetY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x - offsetX, last.y - offsetY);
    return;
  }

  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x - offsetX, points[i].y - offsetY);
  }
}

function computeEdgeRoute(edge, occupiedSegments = []) {
  const source = getNode(edge.source);
  const target = getNode(edge.target);
  if (!source || !target) return null;

  if (edge.type === "tree") {
    const strictTreePoints = computeTreeAlignedRoute(edge, source, target, occupiedSegments);
    if (strictTreePoints) {
      const strictMid = polylineMidpoint(strictTreePoints);
      return {
        points: strictTreePoints,
        path: pointsToPathData(strictTreePoints),
        mid: strictMid,
      };
    }
  }

  const anchors = edgeAnchors(source, target);
  const start = { x: anchors.start.x, y: anchors.start.y };
  const end = { x: anchors.end.x, y: anchors.end.y };
  const startStub = anchorStub(anchors.start);
  const endStub = anchorStub(anchors.end);
  const obstacles = state.graph.nodes
    .filter((node) => !isPostitNode(node) && node.id !== source.id && node.id !== target.id)
    .map((node) => buildObstacle(node, ROUTE_NODE_PADDING));
  const routingNodes = state.graph.nodes.filter((node) => !isPostitNode(node));
  const bounds = core.getBounds(routingNodes);

  const middle = routeOrthogonal(startStub, endStub, obstacles, bounds, occupiedSegments);
  const points = compressOrthogonalPath([start, startStub, ...middle, endStub, end]);
  const mid = polylineMidpoint(points);

  return {
    points,
    path: pointsToPathData(points),
    mid,
  };
}

function computeOrderedRouteForEdge(edgeId) {
  const occupied = [];
  for (const edge of state.graph.edges) {
    const route = computeEdgeRoute(edge, occupied);
    if (!route) continue;
    if (edge.id === edgeId) return route;
    addPathSegments(route.points, occupied);
  }
  return null;
}

function computeLinkDraftRoute() {
  if (!state.linkDraft || !state.linkDraftCursor) return null;
  const source = getNode(state.linkDraft.sourceId);
  if (!source) return null;
  const sourceWidth = getNodeWidth(source);
  const sourceHeight = getNodeHeight(source);
  const target = state.linkDraftCursor;
  const sx = source.x + sourceWidth / 2;
  const sy = source.y + sourceHeight / 2;
  const dx = target.x - sx;
  const dy = target.y - sy;
  const start = Math.abs(dx) >= Math.abs(dy)
    ? (dx >= 0
      ? { x: source.x + sourceWidth, y: sy, side: "right" }
      : { x: source.x, y: sy, side: "left" })
    : (dy >= 0
      ? { x: sx, y: source.y + sourceHeight, side: "bottom" }
      : { x: sx, y: source.y, side: "top" });
  const stub = anchorStub(start, ROUTE_STUB);
  return (start.side === "right" || start.side === "left")
    ? compressOrthogonalPath([start, stub, { x: target.x, y: stub.y }, target])
    : compressOrthogonalPath([start, stub, { x: stub.x, y: target.y }, target]);
}

function createFreeEdge(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const source = getNode(sourceId);
  const target = getNode(targetId);
  if (!source || !target) return;
  const exists = state.graph.edges.some(
    (edge) => edge.source === sourceId && edge.target === targetId && edge.type === "free",
  );
  if (exists) return;
  commit(() => {
    state.graph.edges.push({
      id: `free-${sourceId}-${targetId}-${Date.now()}`,
      source: sourceId,
      target: targetId,
      type: "free",
      color: state.defaultEdgeColor,
      label: "",
      style: state.defaultEdgeStyle,
      shape: state.defaultEdgeShape,
    });
    state.selectedEdgeId = null;
    state.selectedNodeId = targetId;
  }, "Lien créé");
}

function applyPreferredLayout(graph) {
  const mode = state.preferredLayout || "horizontal";
  return core.layoutGraph(graph, mode);
}

function startLinkDraft(sourceId) {
  const source = getNode(sourceId);
  if (!source) return;
  state.linkMode = true;
  state.linkDraft = {
    sourceId,
  };
  state.linkDraftCursor = {
    x: source.x + getNodeWidth(source) + 120,
    y: source.y + getNodeHeight(source) / 2,
  };
  requestRender();
}

function finishLinkDraft(targetNodeId) {
  if (!state.linkDraft) return;
  const sourceId = state.linkDraft.sourceId;
  state.linkDraft = null;
  state.linkDraftCursor = null;
  state.linkMode = false;
  if (targetNodeId) {
    createFreeEdge(sourceId, targetNodeId);
  } else {
    requestRender();
  }
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
  if (node.kind !== "postit") node.kind = "node";
  node.width = getNodeWidth(node);
  node.height = getNodeHeight(node);
  if (typeof node.textColor !== "string") node.textColor = "#1f2230";
  if (typeof node.borderColor !== "string") node.borderColor = "#5c647f";
  if (!Number.isFinite(node.borderWidth)) node.borderWidth = 2;
  if (!Number.isFinite(node.radius)) node.radius = 14;
  node.textAlign = getTextAlignForNode(node);
  node.textBold = isTextBold(node);
  node.textItalic = isTextItalic(node);
  node.titleLink = normalizeTitleLink(node.titleLink);
}

function appliquerTexteLienParDefaut(edge) {
  if (!edge) return;
  edge.textAlign = getTextAlignForEdge(edge);
  edge.textBold = isTextBold(edge);
  edge.textItalic = isTextItalic(edge);
  edge.titleLink = normalizeTitleLink(edge.titleLink);
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
  if (state.selectedNodeId && isNodeLockedByOther(state.selectedNodeId)) {
    const owner = getLockOwner(state.selectedNodeId);
    setStatus(`Nœud verrouillé par ${owner ? owner.name : "un autre membre"}`, true);
    requestRender();
    return false;
  }
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
  const patch = createRealtimePatch(before, state.graph);

  history.push(before);
  saveNow();
  broadcastRealtimePatch(patch, label || "update");
  trackRealtimePresence();
  setStatus(label || "Mis à jour", false);
  requestRender();
  return true;
}

function applyGraph(nextGraph, label) {
  const before = core.cloneGraph(state.graph);
  const graphToApply = applyPreferredLayout(nextGraph);
  const validated = core.validateAndNormalizeData(graphToApply);
  if (!validated.ok) {
    setStatus(`Carte invalide : ${traduireErreurValidation(validated.errors[0])}`, true);
    return false;
  }
  state.graph = validated.data;
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  state.linkingFrom = null;
  state.defaultEdgeShape = deriveDefaultEdgeShapeFromGraph();
  const patch = createRealtimePatch(before, state.graph);
  saveNow();
  broadcastRealtimePatch(patch, label || "apply-graph");
  setStatus(label || "Chargé", false);
  requestRender();
  return true;
}

function selectNode(id) {
  if (id && isNodeLockedByOther(id)) {
    const owner = getLockOwner(id);
    setStatus(`Édition par ${owner ? owner.name : "un autre membre"}`, true);
  }
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
  trackRealtimePresence();
  requestRender();
}

function selectEdge(id) {
  state.selectedEdgeId = id;
  state.selectedNodeId = null;
  const edge = getEdge(id);
  if (edge) {
    appliquerTexteLienParDefaut(edge);
    els.edgeTitleInput.value = edge.label || "";
    els.edgeColorInput.value = getEdgeColor(edge);
    els.edgeStyleSelect.value = getEdgeStyle(edge);
    if (els.edgeTitleLinkInput) {
      els.edgeTitleLinkInput.value = edge.titleLink || "";
    }
  }
  trackRealtimePresence();
  requestRender();
}

function clearSelection() {
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  state.linkingFrom = null;
  state.linkDraft = null;
  trackRealtimePresence();
  requestRender();
}

function centerOnNode(nodeId) {
  const node = getNode(nodeId);
  if (!node) return;
  const nodeWidth = getNodeWidth(node);
  const nodeHeight = getNodeHeight(node);
  const rect = els.canvas.getBoundingClientRect();
  state.viewport.x = rect.width / 2 - (node.x + nodeWidth / 2) * state.viewport.zoom;
  state.viewport.y = rect.height / 2 - (node.y + nodeHeight / 2) * state.viewport.zoom;
  requestRender();
}

function createNode({
  x = 160,
  y = 120,
  kind = "node",
  width,
  height,
  title = "Nœud",
  color = "#ffd166",
  textColor = "#1f2230",
  borderColor = "#5c647f",
  borderWidth = 2,
  radius = 14,
  textAlign = "left",
  textBold = false,
  textItalic = false,
  titleLink = "",
  parentId = null,
} = {}) {
  commit(() => {
    const id = String(state.graph.nextId++);
    state.graph.nodes.push({
      id,
      x,
      y,
      kind: kind === "postit" ? "postit" : "node",
      width,
      height,
      title,
      color,
      textColor,
      borderColor,
      borderWidth,
      radius,
      textAlign,
      textBold,
      textItalic,
      titleLink,
      parentId,
    });
    if (parentId && kind !== "postit") {
      state.graph.edges.push({
        id: `tree-${parentId}-${id}`,
        source: parentId,
        target: id,
        type: "tree",
        color: state.defaultEdgeColor,
        style: state.defaultEdgeStyle,
        shape: state.defaultEdgeShape,
        textAlign: "center",
        textBold: false,
        textItalic: false,
        titleLink: "",
      });
    }
    if (state.preferredLayout) {
      state.graph = core.layoutGraph(state.graph, state.preferredLayout);
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

function createPostitAtCenter() {
  const rect = els.canvas.getBoundingClientRect();
  const center = toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  createNode({
    x: center.x + 40,
    y: center.y + 24,
    kind: "postit",
    width: 260,
    height: 160,
    title: "Commentaire",
    color: "#ffe68e",
    textColor: "#42310d",
    borderColor: "#c88d17",
    borderWidth: 2,
    radius: 10,
    parentId: null,
  });
}

function addChildToSelected() {
  if (!state.selectedNodeId) return;
  const parent = getNode(state.selectedNodeId);
  if (!parent) return;
  if (isPostitNode(parent)) return;
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
    if (state.preferredLayout) {
      state.graph = core.layoutGraph(state.graph, state.preferredLayout);
    }
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
  if (state.linkDraft) {
    finishLinkDraft(null);
    return;
  }
  const selected = state.selectedNodeId ? getNode(state.selectedNodeId) : null;
  if (selected && !isPostitNode(selected)) {
    startLinkDraft(state.selectedNodeId);
  } else {
    setStatus("Sélectionnez d'abord un nœud", true);
  }
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
  const changed = commit(() => {
    const node = getNode(state.selectedNodeId);
    if (!node) return;
    node.color = style.color;
    node.textColor = style.textColor;
    node.borderColor = style.borderColor;
    node.borderWidth = style.borderWidth;
    node.radius = style.radius;
  }, "Style du nœud appliqué");
  if (changed && state.selectedNodeId) {
    selectNode(state.selectedNodeId);
  }
}

function traitPresetConfig(preset) {
  const map = {
    net: { color: "#2f98ff", style: "solid", shape: "geometrique" },
    signal: { color: "#e15d44", style: "dashed", shape: "arrondi" },
    flux: { color: "#6f63ff", style: "solid", shape: "courbe" },
    organique: { color: "#18b982", style: "dotted", shape: "courbe" },
    discret: { color: "#6d86b8", style: "solid", shape: "geometrique" },
  };
  return map[preset] || map.signal;
}

function applyTraitPresetGlobal(preset) {
  const cfg = traitPresetConfig(preset);
  state.activeTraitPreset = preset;
  state.defaultEdgeColor = cfg.color;
  state.defaultEdgeStyle = cfg.style;
  state.defaultEdgeShape = cfg.shape;
  if (!state.graph.edges.length) {
    requestRender();
    return;
  }
  commit(() => {
    for (const edge of state.graph.edges) {
      edge.color = cfg.color;
      edge.style = cfg.style;
      edge.shape = cfg.shape;
    }
  }, "Preset de traits appliqué");
}

function applyEdgePresetToSelected(preset) {
  if (!state.selectedEdgeId) return;
  const cfg = traitPresetConfig(preset);
  commit(() => {
    const edge = getEdge(state.selectedEdgeId);
    if (!edge) return;
    edge.color = cfg.color;
    edge.style = cfg.style;
    edge.shape = cfg.shape;
  }, "Preset du lien appliqué");
}

function onNodeClick(nodeId) {
  selectNode(nodeId);
}

function runLayout(mode) {
  const libelle = mode === "horizontal" ? "horizontale" : mode === "vertical" ? "verticale" : "radiale";
  state.preferredLayout = mode;
  commit(() => {
    state.graph = core.layoutGraph(state.graph, mode);
    if (state.selectedNodeId) {
      centerOnNode(state.selectedNodeId);
    }
  }, `Disposition ${libelle} appliquée`);
}

function appliquerTemplateSelectionne() {
  const type = els.templateSelect.value || "produit";
  let graph = genererTemplate(type);
  if (state.preferredLayout) {
    graph = core.layoutGraph(graph, state.preferredLayout);
  }
  history.clear();
  const ok = applyGraph(graph, "Modèle appliqué");
  if (!ok) return;
  if (state.graph.nodes[0]) {
    centerOnNode(state.graph.nodes[0].id);
  }
}

function undo() {
  const before = core.cloneGraph(state.graph);
  const prev = history.undo(state.graph);
  if (!prev) return;
  state.graph = prev;
  state.selectedEdgeId = null;
  state.linkingFrom = null;
  const patch = createRealtimePatch(before, state.graph);
  saveNow();
  broadcastRealtimePatch(patch, "undo");
  setStatus("Annulation", false);
  requestRender();
}

function redo() {
  const before = core.cloneGraph(state.graph);
  const next = history.redo(state.graph);
  if (!next) return;
  state.graph = next;
  state.selectedEdgeId = null;
  state.linkingFrom = null;
  const patch = createRealtimePatch(before, state.graph);
  saveNow();
  broadcastRealtimePatch(patch, "redo");
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
  void persistCurrentProjectToDb().catch(() => {});
}

async function loadNow() {
  if (!state.currentProjectId) {
    setStatus("Aucun projet actif", true);
    return;
  }
  const row = await getProjectFromDb(state.currentProjectId);
  if (!row) {
    setStatus("Projet introuvable", true);
    return;
  }
  if (!loadProjectIntoState(row, "Projet rechargé")) {
    setStatus("Projet invalide", true);
  }
}

function runAutosave() {
  const hash = graphHash();
  if (hash === state.lastSavedHash) return;
  saveNow();
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
    bounds = getContentBounds(nodeIds);
  } else if (region === "visible") {
    const rect = els.canvas.getBoundingClientRect();
    const x = (-state.viewport.x) / state.viewport.zoom;
    const y = (-state.viewport.y) / state.viewport.zoom;
    const width = rect.width / state.viewport.zoom;
    const height = rect.height / state.viewport.zoom;
    bounds = { x, y, width, height };
  } else {
    bounds = getContentBounds();
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

function getContentBounds(nodeIds) {
  const base = core.getBounds(state.graph.nodes, nodeIds);
  let minX = base.x;
  let minY = base.y;
  let maxX = base.x + base.width;
  let maxY = base.y + base.height;

  for (const edge of state.graph.edges) {
    if (!edgeVisible(edge, nodeIds)) continue;
    const route = computeEdgeRoute(edge, []);
    if (!route || !route.points || route.points.length === 0) continue;

    for (const point of route.points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    if (edge.label) {
      const align = getTextAlignForEdge(edge);
      const baseX = route.mid.x;
      const labelX = align === "left" ? baseX - 54 : align === "right" ? baseX + 54 : baseX;
      const labelY = route.mid.y - 8;
      minX = Math.min(minX, labelX - 120);
      maxX = Math.max(maxX, labelX + 120);
      minY = Math.min(minY, labelY - 20);
      maxY = Math.max(maxY, labelY + 20);
    }
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function isExportModalOpen() {
  return !els.exportModal.hidden;
}

function openExportModal() {
  els.exportModal.hidden = false;
}

function closeExportModal() {
  els.exportModal.hidden = true;
}

function runExportFromModal() {
  const format = (els.exportFormat.value || "png").toLowerCase();
  if (format === "svg") {
    exportSvg();
    setStatus("Export SVG généré", false);
  } else if (format === "pdf") {
    exportPdf();
    setStatus("Export PDF prêt (impression)", false);
  } else {
    exportPng();
    setStatus("Export PNG généré", false);
  }
  closeExportModal();
}

function runExportJsonFromModal() {
  exportJson();
  setStatus("Export JSON généré", false);
  closeExportModal();
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
  const occupied = [];

  for (const edge of state.graph.edges) {
    if (!edgeVisible(edge, nodeIds)) continue;
    const route = computeEdgeRoute(edge, occupied);
    if (!route) continue;

    ctx.beginPath();
    drawEdgePathOnCanvas(ctx, route.points, getEdgeShape(edge), bounds.x, bounds.y);
    ctx.strokeStyle = getEdgeColor(edge);
    ctx.lineWidth = edge.id === state.selectedEdgeId ? 3.5 : edge.type === "free" ? 2.4 : 2;
    if (getEdgeStyle(edge) === "dashed") ctx.setLineDash([7, 5]);
    else if (getEdgeStyle(edge) === "dotted") ctx.setLineDash([2, 5]);
    else ctx.setLineDash([]);
    ctx.stroke();
    if (edge.label) {
      appliquerTexteLienParDefaut(edge);
      ctx.setLineDash([]);
      ctx.fillStyle = "#2a3140";
      const align = getTextAlignForEdge(edge);
      ctx.textAlign = align;
      ctx.font = `${isTextItalic(edge) ? "italic " : ""}${isTextBold(edge) ? "700 " : "500 "}12px Avenir Next, Segoe UI, sans-serif`;
      const baseX = route.mid.x - bounds.x;
      const x = align === "left" ? baseX - 54 : align === "right" ? baseX + 54 : baseX;
      ctx.fillText(edge.label, x, route.mid.y - bounds.y - 8);
    }
    addPathSegments(route.points, occupied);
  }

  ctx.setLineDash([]);
  ctx.textBaseline = "middle";
  ctx.font = "500 14px Avenir Next, Segoe UI, sans-serif";

  for (const node of state.graph.nodes) {
    appliquerStyleParDefaut(node);
    if (nodeIds && !nodeIds.has(node.id)) continue;
    const x = node.x - bounds.x;
    const y = node.y - bounds.y;
    const nodeWidth = getNodeWidth(node);
    const nodeHeight = getNodeHeight(node);
    roundRect(ctx, x, y, nodeWidth, nodeHeight, node.radius, node.color);
    ctx.strokeStyle = node.id === state.selectedNodeId ? "#2d6cdf" : node.borderColor;
    ctx.lineWidth = node.id === state.selectedNodeId ? Math.max(3, node.borderWidth) : node.borderWidth;
    ctx.stroke();
    ctx.fillStyle = node.textColor;
    const align = getTextAlignForNode(node);
    ctx.textAlign = align;
    ctx.font = `${isTextItalic(node) ? "italic " : ""}${isTextBold(node) ? "700 " : "500 "}14px Avenir Next, Segoe UI, sans-serif`;
    const textX = align === "left" ? x + 14 : align === "right" ? x + nodeWidth - 14 : x + nodeWidth / 2;
    ctx.fillText(node.title, textX, y + nodeHeight / 2);
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

function buildSvgMarkup(bounds, nodeIds, transparent, withLinks = false) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}">`;
  if (!transparent) {
    svg += `<rect width="100%" height="100%" fill="#f4f6fb" />`;
  }
  const occupied = [];

  for (const edge of state.graph.edges) {
    if (!edgeVisible(edge, nodeIds)) continue;
    const route = computeEdgeRoute(edge, occupied);
    if (!route) continue;
    const dash = getEdgeStyle(edge) === "dashed" ? "7 5" : getEdgeStyle(edge) === "dotted" ? "2 5" : "";
    svg += `<path d="${edgePathDataForShape(route.points, getEdgeShape(edge), bounds.x, bounds.y)}" fill="none" stroke="${getEdgeColor(
      edge,
    )}" stroke-width="${edge.id === state.selectedEdgeId ? 3.5 : edge.type === "free" ? 2.4 : 2}" ${
      dash ? `stroke-dasharray="${dash}"` : ""
    } />`;
    if (edge.label) {
      appliquerTexteLienParDefaut(edge);
      const align = getTextAlignForEdge(edge);
      const baseX = route.mid.x - bounds.x;
      const x = align === "left" ? baseX - 54 : align === "right" ? baseX + 54 : baseX;
      const textNode = `<text x="${x}" y="${route.mid.y - bounds.y - 8}" class="edge-label" text-anchor="${svgAnchorForAlign(
        align,
      )}" dominant-baseline="middle" font-family="Avenir Next, Segoe UI, sans-serif" font-size="12" font-weight="${
        isTextBold(edge) ? "700" : "500"
      }" font-style="${isTextItalic(edge) ? "italic" : "normal"}" fill="#2a3140">${
        escapeXml(edge.label)
      }</text>`;
      const edgeLink = getExportLink(edge.titleLink, edge.label);
      if (withLinks && edgeLink) {
        svg += `<a href="${escapeXml(edgeLink)}" target="_blank" rel="noopener noreferrer">${textNode}</a>`;
      } else {
        svg += textNode;
      }
    }
    addPathSegments(route.points, occupied);
  }

  for (const node of state.graph.nodes) {
    appliquerStyleParDefaut(node);
    if (nodeIds && !nodeIds.has(node.id)) continue;
    const x = node.x - bounds.x;
    const y = node.y - bounds.y;
    const nodeWidth = getNodeWidth(node);
    const nodeHeight = getNodeHeight(node);
    svg += `<rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="${node.radius}" ry="${node.radius}" fill="${escapeXml(
      node.color,
    )}" stroke="${node.id === state.selectedNodeId ? "#2d6cdf" : escapeXml(node.borderColor)}" stroke-width="${
      node.id === state.selectedNodeId ? Math.max(3, node.borderWidth) : node.borderWidth
    }" />`;
    const align = getTextAlignForNode(node);
    const textX = align === "left" ? x + 14 : align === "right" ? x + nodeWidth - 14 : x + nodeWidth / 2;
    const textNode = `<text x="${textX}" y="${y + nodeHeight / 2 + 1}" text-anchor="${svgAnchorForAlign(
      align,
    )}" dominant-baseline="middle" font-family="Avenir Next, Segoe UI, sans-serif" font-size="14" font-weight="${
      isTextBold(node) ? "700" : "500"
    }" font-style="${isTextItalic(node) ? "italic" : "normal"}" fill="${escapeXml(node.textColor)}">${escapeXml(
      node.title,
    )}</text>`;
    const nodeLink = getExportLink(node.titleLink, node.title);
    if (withLinks && nodeLink) {
      svg += `<a href="${escapeXml(nodeLink)}" target="_blank" rel="noopener noreferrer">${textNode}</a>`;
    } else {
      svg += textNode;
    }
  }

  svg += `</svg>`;
  return svg;
}

function collectPdfLinkOverlays(bounds, nodeIds) {
  const overlays = [];
  const occupied = [];

  for (const edge of state.graph.edges) {
    if (!edgeVisible(edge, nodeIds)) continue;
    const route = computeEdgeRoute(edge, occupied);
    if (!route) continue;

    if (edge.label) {
      appliquerTexteLienParDefaut(edge);
      const edgeLink = getExportLink(edge.titleLink, edge.label);
      if (edgeLink) {
        const align = getTextAlignForEdge(edge);
        const baseX = route.mid.x - bounds.x;
        const x = align === "left" ? baseX - 54 : align === "right" ? baseX + 54 : baseX;
        const width = Math.max(54, Math.min(480, edge.label.length * 7 + 28));
        const left = align === "left" ? x : align === "right" ? x - width : x - width / 2;
        overlays.push({
          href: edgeLink,
          left,
          top: route.mid.y - bounds.y - 20,
          width,
          height: 24,
        });
      }
    }
    addPathSegments(route.points, occupied);
  }

  for (const node of state.graph.nodes) {
    if (nodeIds && !nodeIds.has(node.id)) continue;
    appliquerStyleParDefaut(node);
    const nodeLink = getExportLink(node.titleLink, node.title);
    if (!nodeLink) continue;
    overlays.push({
      href: nodeLink,
      left: node.x - bounds.x,
      top: node.y - bounds.y,
      width: getNodeWidth(node),
      height: getNodeHeight(node),
    });
  }

  return overlays;
}

function exportPdf() {
  const { bounds, nodeIds, transparent } = getExportContext();
  const isLandscape = bounds.width >= bounds.height;
  const pageSize = isLandscape ? "297mm 210mm" : "210mm 297mm";
  const svgMarkup = buildSvgMarkup(bounds, nodeIds, transparent, false);
  const linkOverlays = collectPdfLinkOverlays(bounds, nodeIds);
  const linksMarkup = linkOverlays
    .map((overlay) => {
      const leftPct = (overlay.left / bounds.width) * 100;
      const topPct = (overlay.top / bounds.height) * 100;
      const widthPct = (overlay.width / bounds.width) * 100;
      const heightPct = (overlay.height / bounds.height) * 100;
      return `<a class="pdf-link" href="${escapeXml(overlay.href)}" target="_blank" rel="noopener noreferrer" style="left:${leftPct}%;top:${topPct}%;width:${widthPct}%;height:${heightPct}%;" aria-label="Lien exporté"></a>`;
    })
    .join("");
  const popup = window.open("", "_blank");
  if (!popup) return;
  popup.document.write(`
    <!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>Export PDF - Mindmap</title>
        <style>
          @page { size: ${pageSize}; margin: 0; }
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #ffffff;
          }
          .page {
            width: 100vw;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            position: relative;
          }
          .sheet {
            position: relative;
            width: 100vw;
            height: 100vh;
          }
          svg {
            width: 100%;
            height: 100%;
            display: block;
          }
          .pdf-link {
            position: absolute;
            display: block;
            z-index: 3;
            background: transparent;
            color: transparent;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="sheet" id="pdf-sheet">
            ${svgMarkup}
            ${linksMarkup}
          </div>
        </div>
        <script>
          const ratio = ${bounds.width} / ${bounds.height};
          const sheet = document.getElementById('pdf-sheet');
          function fitSheet() {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            let w = vw;
            let h = w / ratio;
            if (h > vh) {
              h = vh;
              w = h * ratio;
            }
            sheet.style.width = w + 'px';
            sheet.style.height = h + 'px';
          }
          window.addEventListener('resize', fitSheet);
          window.addEventListener('load', () => {
            fitSheet();
            setTimeout(() => { window.print(); }, 120);
          });
        <\/script>
      </body>
    </html>
  `);
  popup.document.close();
}

function exportSvg() {
  const { bounds, nodeIds, transparent } = getExportContext();
  const svg = `<?xml version="1.0" encoding="UTF-8"?>${buildSvgMarkup(bounds, nodeIds, transparent, false)}`;
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
    const nodeWidth = getNodeWidth(node);
    const nodeHeight = getNodeHeight(node);
    element.style.width = `${nodeWidth}px`;
    element.style.minHeight = `${nodeHeight}px`;
    element.style.height = isPostitNode(node) ? `${nodeHeight}px` : "";
    element.style.background = node.color;
    element.style.color = node.textColor;
    element.style.borderColor = node.borderColor;
    element.style.borderWidth = `${node.borderWidth}px`;
    element.style.borderRadius = `${node.radius}px`;
    if (isPostitNode(node)) {
      element.classList.add("node-postit");
    }

    if (isPostitNode(node)) {
      const textarea = document.createElement("textarea");
      textarea.value = node.title || "";
      textarea.className = "postit-editor";
      textarea.style.textAlign = getTextAlignForNode(node);
      textarea.style.fontWeight = isTextBold(node) ? "700" : "500";
      textarea.style.fontStyle = isTextItalic(node) ? "italic" : "normal";
      textarea.setAttribute("data-postit-editor", "true");
      textarea.setAttribute("data-node-id", node.id);
      title.replaceWith(textarea);
      const grip = document.createElement("div");
      grip.className = "postit-grip";
      grip.title = "Déplacer";
      element.appendChild(grip);
      const resize = document.createElement("div");
      resize.className = "postit-resize-handle";
      resize.title = "Redimensionner";
      element.appendChild(resize);
    } else if (state.inlineEditNodeId === node.id) {
      const input = document.createElement("input");
      input.type = "text";
      input.value = node.title;
      input.className = "node-input";
      input.style.textAlign = getTextAlignForNode(node);
      input.style.fontWeight = isTextBold(node) ? "700" : "500";
      input.style.fontStyle = isTextItalic(node) ? "italic" : "normal";
      input.setAttribute("data-inline-editor", "true");
      input.setAttribute("data-node-id", node.id);
      title.replaceWith(input);
    } else {
      title.textContent = node.title;
      title.style.textAlign = getTextAlignForNode(node);
      title.style.fontWeight = isTextBold(node) ? "700" : "500";
      title.style.fontStyle = isTextItalic(node) ? "italic" : "normal";
      title.style.textDecoration = node.titleLink ? "underline" : "none";
      title.style.textDecorationThickness = node.titleLink ? "1.5px" : "0px";
    }

    if (node.id === state.selectedNodeId) {
      element.classList.add("selected");
    }
    if (state.linkDraft && state.linkDraft.sourceId === node.id) {
      element.classList.add("linking-source");
    }
    const lockOwner = getLockOwner(node.id);
    if (lockOwner) {
      element.classList.add("locked-by-peer");
      const badge = document.createElement("span");
      badge.className = "node-lock-badge";
      badge.title = `Édition: ${lockOwner.name}`;
      badge.textContent = peerInitials(lockOwner.name);
      element.appendChild(badge);
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
  const occupied = [];
  const routeCache = new Map();
  for (const edge of state.graph.edges) {
    const route = computeEdgeRoute(edge, occupied);
    if (!route) continue;
    routeCache.set(edge.id, route);

    const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hitPath.setAttribute("d", edgePathDataForShape(route.points, getEdgeShape(edge)));
    hitPath.setAttribute("fill", "none");
    hitPath.setAttribute("class", "edge-hit");
    hitPath.dataset.edgeId = edge.id;
    fragment.appendChild(hitPath);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", edgePathDataForShape(route.points, getEdgeShape(edge)));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", getEdgeColor(edge));
    path.setAttribute("stroke-width", edge.id === state.selectedEdgeId ? "3.5" : edge.type === "free" ? "2.3" : "2");
    path.setAttribute("stroke-dasharray", getEdgeDashArray(edge));
    path.setAttribute("class", `edge-path ${edge.id === state.selectedEdgeId ? "selected" : ""}`.trim());
    path.dataset.edgeId = edge.id;
    fragment.appendChild(path);

    if (edge.label) {
      appliquerTexteLienParDefaut(edge);
      const align = getTextAlignForEdge(edge);
      const labelBaseX = route.mid.x;
      const labelX = align === "left" ? labelBaseX - 54 : align === "right" ? labelBaseX + 54 : labelBaseX;
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String(labelX));
      label.setAttribute("y", String(route.mid.y - 8));
      label.setAttribute("class", "edge-label");
      label.setAttribute("text-anchor", svgAnchorForAlign(align));
      label.setAttribute("font-weight", isTextBold(edge) ? "700" : "500");
      label.setAttribute("font-style", isTextItalic(edge) ? "italic" : "normal");
      if (edge.titleLink) label.setAttribute("text-decoration", "underline");
      label.dataset.edgeId = edge.id;
      label.textContent = edge.label;
      fragment.appendChild(label);
    }
    addPathSegments(route.points, occupied);
  }

  const draftPoints = computeLinkDraftRoute();
  if (draftPoints && draftPoints.length >= 2) {
    const draft = document.createElementNS("http://www.w3.org/2000/svg", "path");
    draft.setAttribute("d", edgePathDataForShape(draftPoints, normalizeEdgeShape(state.defaultEdgeShape)));
    draft.setAttribute("fill", "none");
    draft.setAttribute("stroke", state.defaultEdgeColor || "#6d86b8");
    draft.setAttribute("stroke-width", "2");
    draft.setAttribute("stroke-dasharray", "7 5");
    draft.setAttribute("stroke-opacity", "0.45");
    draft.setAttribute("class", "edge-draft");
    fragment.appendChild(draft);
  }

  state.edgeRouteCache = routeCache;
  els.edges.replaceChildren(fragment);
}

function renderControls() {
  const nodeSelected = Boolean(state.selectedNodeId);
  const edgeSelected = Boolean(state.selectedEdgeId);
  const hasNodes = state.graph.nodes.length > 0;
  const snapshot = history.snapshot();

  if (nodeSelected) {
    const node = getNode(state.selectedNodeId);
    if (node) {
      appliquerStyleParDefaut(node);
      els.titleInput.value = node.title || "";
      els.textColorInput.value = node.textColor || "#1f2230";
      els.colorInput.value = node.color || "#ffd166";
      els.borderColorInput.value = node.borderColor || "#5c647f";
      els.borderWidthInput.value = String(Number.isFinite(node.borderWidth) ? node.borderWidth : 2);
      els.radiusInput.value = String(Number.isFinite(node.radius) ? node.radius : 14);
      if (els.nodeTitleLinkInput) {
        els.nodeTitleLinkInput.value = node.titleLink || "";
      }
      if (els.nodeTitleCenterBtn) {
        const active = getTextAlignForNode(node) === "center";
        els.nodeTitleCenterBtn.classList.toggle("is-active", active);
      }
      if (els.nodeTitleBoldBtn) {
        els.nodeTitleBoldBtn.classList.toggle("is-active", isTextBold(node));
      }
      if (els.nodeTitleItalicBtn) {
        els.nodeTitleItalicBtn.classList.toggle("is-active", isTextItalic(node));
      }
    }
  } else {
    els.titleInput.value = "";
    els.textColorInput.value = "#1f2230";
    els.colorInput.value = "#ffd166";
    els.borderColorInput.value = "#5c647f";
    els.borderWidthInput.value = "2";
    els.radiusInput.value = "14";
    if (els.nodeTitleLinkInput) els.nodeTitleLinkInput.value = "";
    if (els.nodeTitleCenterBtn) els.nodeTitleCenterBtn.classList.remove("is-active");
    if (els.nodeTitleBoldBtn) els.nodeTitleBoldBtn.classList.remove("is-active");
    if (els.nodeTitleItalicBtn) els.nodeTitleItalicBtn.classList.remove("is-active");
  }

  els.undoBtn.disabled = !history.canUndo();
  els.redoBtn.disabled = !history.canRedo();
  const selectedNode = nodeSelected ? getNode(state.selectedNodeId) : null;
  const canAddChild = Boolean(selectedNode) && !isPostitNode(selectedNode);
  els.addChildBtn.disabled = !canAddChild;
  if (els.qaAddChildBtn) els.qaAddChildBtn.disabled = !canAddChild;
  els.deleteEdgeBtn.disabled = !edgeSelected;
  els.edgeTitleInput.disabled = !edgeSelected;
  els.edgeColorInput.disabled = !edgeSelected;
  els.edgeStyleSelect.disabled = !edgeSelected;
  els.deleteBtn.disabled = !nodeSelected && !edgeSelected;
  els.titleInput.disabled = !nodeSelected;
  els.textColorInput.disabled = !nodeSelected;
  els.colorInput.disabled = !nodeSelected;
  els.borderColorInput.disabled = !nodeSelected;
  els.borderWidthInput.disabled = !nodeSelected;
  els.radiusInput.disabled = !nodeSelected;
  if (els.nodeTitleCenterBtn) els.nodeTitleCenterBtn.disabled = !nodeSelected;
  if (els.nodeTitleBoldBtn) els.nodeTitleBoldBtn.disabled = !nodeSelected;
  if (els.nodeTitleItalicBtn) els.nodeTitleItalicBtn.disabled = !nodeSelected;
  if (els.nodeTitleLinkInput) els.nodeTitleLinkInput.disabled = !nodeSelected;

  if (edgeSelected) {
    const edge = getEdge(state.selectedEdgeId);
    if (edge) {
      appliquerTexteLienParDefaut(edge);
      els.edgeTitleInput.value = edge.label || "";
      els.edgeColorInput.value = getEdgeColor(edge);
      els.edgeStyleSelect.value = getEdgeStyle(edge);
      if (els.edgeTitleLinkInput) {
        els.edgeTitleLinkInput.value = edge.titleLink || "";
      }
      if (els.edgeTitleCenterBtn) {
        els.edgeTitleCenterBtn.classList.toggle("is-active", getTextAlignForEdge(edge) === "center");
      }
      if (els.edgeTitleBoldBtn) {
        els.edgeTitleBoldBtn.classList.toggle("is-active", isTextBold(edge));
      }
      if (els.edgeTitleItalicBtn) {
        els.edgeTitleItalicBtn.classList.toggle("is-active", isTextItalic(edge));
      }
    }
  } else {
    if (els.edgeTitleLinkInput) els.edgeTitleLinkInput.value = "";
    if (els.edgeTitleCenterBtn) els.edgeTitleCenterBtn.classList.remove("is-active");
    if (els.edgeTitleBoldBtn) els.edgeTitleBoldBtn.classList.remove("is-active");
    if (els.edgeTitleItalicBtn) els.edgeTitleItalicBtn.classList.remove("is-active");
  }
  if (els.edgeTitleCenterBtn) els.edgeTitleCenterBtn.disabled = !edgeSelected;
  if (els.edgeTitleBoldBtn) els.edgeTitleBoldBtn.disabled = !edgeSelected;
  if (els.edgeTitleItalicBtn) els.edgeTitleItalicBtn.disabled = !edgeSelected;
  if (els.edgeTitleLinkInput) els.edgeTitleLinkInput.disabled = !edgeSelected;

  const currentShape = normalizeEdgeShape(state.defaultEdgeShape);
  if (els.edgeShapeGeoBtn) {
    const isActive = currentShape === "geometrique";
    els.edgeShapeGeoBtn.classList.toggle("is-active", isActive);
    els.edgeShapeGeoBtn.setAttribute("aria-pressed", isActive ? "true" : "false");
  }
  if (els.edgeShapeRoundBtn) {
    const isActive = currentShape === "arrondi";
    els.edgeShapeRoundBtn.classList.toggle("is-active", isActive);
    els.edgeShapeRoundBtn.setAttribute("aria-pressed", isActive ? "true" : "false");
  }
  if (els.edgeShapeCurveBtn) {
    const isActive = currentShape === "courbe";
    els.edgeShapeCurveBtn.classList.toggle("is-active", isActive);
    els.edgeShapeCurveBtn.setAttribute("aria-pressed", isActive ? "true" : "false");
  }

  els.undoBtn.title = `Annuler (${snapshot.undo})`;
  els.redoBtn.title = `Rétablir (${snapshot.redo})`;
  const currentLayout = state.preferredLayout || "horizontal";
  els.layoutHorizontalBtn.classList.toggle("is-active", currentLayout === "horizontal");
  els.layoutVerticalBtn.classList.toggle("is-active", currentLayout === "vertical");
  els.layoutRadialBtn.classList.toggle("is-active", currentLayout === "radial");
  els.layoutHorizontalBtn.setAttribute("aria-pressed", currentLayout === "horizontal" ? "true" : "false");
  els.layoutVerticalBtn.setAttribute("aria-pressed", currentLayout === "vertical" ? "true" : "false");
  els.layoutRadialBtn.setAttribute("aria-pressed", currentLayout === "radial" ? "true" : "false");
  if (els.emptyState) {
    els.emptyState.hidden = hasNodes;
  }
}

function renderQuickActions() {
  const node = state.selectedNodeId ? getNode(state.selectedNodeId) : null;
  const show = Boolean(node) && !isPostitNode(node) && !state.selectedEdgeId && !state.inlineEditNodeId;
  els.quickActions.hidden = !show;
  if (!show) return;

  const mapSize = computeMapSize();
  const menuWidth = 312;
  let x = node.x + getNodeWidth(node) + 14;
  let y = node.y - 6;
  if (x + menuWidth > mapSize.width - 10) {
    x = node.x - menuWidth - 14;
  }
  if (y < 10) y = 10;
  els.quickActions.style.left = `${Math.max(10, x)}px`;
  els.quickActions.style.top = `${y}px`;
  const invZoom = 1 / Math.max(0.25, state.viewport.zoom || 1);
  els.quickActions.style.transformOrigin = "top left";
  els.quickActions.style.transform = `scale(${invZoom})`;
}

function renderEdgeQuickActions() {
  const edge = state.selectedEdgeId ? getEdge(state.selectedEdgeId) : null;
  const show = Boolean(edge) && !state.selectedNodeId;
  els.edgeQuickActions.hidden = !show;
  if (!show) return;
  const route = state.edgeRouteCache.get(edge.id) || computeOrderedRouteForEdge(edge.id);
  if (!route) return;
  const midX = route.mid.x;
  const midY = route.mid.y;
  const mapSize = computeMapSize();
  const menuWidth = 312;
  let x = midX - menuWidth / 2;
  let y = midY + 14;
  if (x < 10) x = 10;
  if (x + menuWidth > mapSize.width - 10) x = mapSize.width - menuWidth - 10;
  if (y < 10) y = 10;
  els.edgeQuickActions.style.left = `${x}px`;
  els.edgeQuickActions.style.top = `${y}px`;
  const invZoom = 1 / Math.max(0.25, state.viewport.zoom || 1);
  els.edgeQuickActions.style.transformOrigin = "top left";
  els.edgeQuickActions.style.transform = `scale(${invZoom})`;
}

function renderViewport() {
  els.stage.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.zoom})`;
}

function maybeAutoPanWhileDragging(clientX, clientY) {
  const rect = els.canvas.getBoundingClientRect();
  const margin = 56;
  const speed = 14;
  let moved = false;
  if (clientX < rect.left + margin) {
    state.viewport.x += speed;
    moved = true;
  } else if (clientX > rect.right - margin) {
    state.viewport.x -= speed;
    moved = true;
  }
  if (clientY < rect.top + margin) {
    state.viewport.y += speed;
    moved = true;
  } else if (clientY > rect.bottom - margin) {
    state.viewport.y -= speed;
    moved = true;
  }
  if (moved) {
    renderViewport();
  }
}

function render() {
  renderEdges();
  renderNodes();
  renderControls();
  renderQuickActions();
  renderEdgeQuickActions();
  renderViewport();
}

function onNodePointerDown(event) {
  const nodeEl = event.target.closest(".node");
  if (!nodeEl) return;
  const nodeId = nodeEl.dataset.id;
  const node = getNode(nodeId);
  if (!node) return;
  const resizeHandle = event.target.closest(".postit-resize-handle");
  if (resizeHandle) {
    if (!isPostitNode(node)) return;
    event.preventDefault();
    event.stopPropagation();
    state.resizingPostitId = nodeId;
    state.resizePostitStartClient = { x: event.clientX, y: event.clientY };
    state.resizePostitStartSize = { width: getNodeWidth(node), height: getNodeHeight(node) };
    nodeEl.setPointerCapture(event.pointerId);
    return;
  }
  if (event.target.closest("[data-inline-editor='true'], [data-postit-editor='true']")) return;
  const onPostitGrip = Boolean(event.target.closest(".postit-grip"));
  if (isPostitNode(node) && !onPostitGrip) {
    selectNode(nodeId);
    return;
  }
  if (event.target.closest(".node-handle")) return;
  if (state.spacePressed) return;
  if (!isPostitNode(node)) {
    event.preventDefault();
  }

  if (isNodeLockedByOther(nodeId)) {
    const owner = getLockOwner(nodeId);
    setStatus(`Nœud verrouillé par ${owner ? owner.name : "un autre membre"}`, true);
    return;
  }

  selectNode(nodeId);

  const world = toWorld(event.clientX, event.clientY);
  state.draggingNodeId = nodeId;
  state.dragActivated = isPostitNode(node) && onPostitGrip;
  state.dragStartClient = { x: event.clientX, y: event.clientY };
  state.dragOffset.x = world.x - node.x;
  state.dragOffset.y = world.y - node.y;

  nodeEl.setPointerCapture(event.pointerId);
}

function onNodePointerMove(event) {
  if (state.linkDraft) {
    state.linkDraftCursor = toWorld(event.clientX, event.clientY);
    requestRender();
  }
  if (state.resizingPostitId) {
    const node = getNode(state.resizingPostitId);
    if (!node || !state.resizePostitStartClient || !state.resizePostitStartSize) return;
    const zoom = Math.max(0.1, state.viewport.zoom || 1);
    const dx = (event.clientX - state.resizePostitStartClient.x) / zoom;
    const dy = (event.clientY - state.resizePostitStartClient.y) / zoom;
    node.width = Math.max(160, Math.min(760, Math.round(state.resizePostitStartSize.width + dx)));
    node.height = Math.max(80, Math.min(720, Math.round(state.resizePostitStartSize.height + dy)));
    requestRender();
    return;
  }
  if (!state.draggingNodeId) return;
  const nodeId = state.draggingNodeId;
  const node = getNode(nodeId);
  if (!node) return;
  if (isPostitNode(node)) {
    maybeAutoPanWhileDragging(event.clientX, event.clientY);
  }

  if (!state.dragActivated) {
    const start = state.dragStartClient;
    const dx = start ? event.clientX - start.x : 0;
    const dy = start ? event.clientY - start.y : 0;
    const threshold = isPostitNode(node) ? 2 : NODE_DRAG_START_PX;
    if (Math.hypot(dx, dy) < threshold) {
      return;
    }
    state.dragActivated = true;
  }

  const world = toWorld(event.clientX, event.clientY);
  const rawX = isPostitNode(node) ? world.x - state.dragOffset.x : Math.max(20, world.x - state.dragOffset.x);
  const rawY = isPostitNode(node) ? world.y - state.dragOffset.y : Math.max(20, world.y - state.dragOffset.y);
  if (isPostitNode(node)) {
    node.x = rawX;
    node.y = rawY;
    const el = els.nodes.querySelector(`.node[data-id="${nodeId}"]`);
    if (el) {
      el.style.left = `${rawX}px`;
      el.style.top = `${rawY}px`;
    }
    return;
  } else {
    const snapped = magnetiserPositionNoeud(nodeId, rawX, rawY);
    node.x = snapped.x;
    node.y = snapped.y;
  }
  requestRender();
}

function onNodePointerUp() {
  if (state.resizingPostitId) {
    const resizedId = state.resizingPostitId;
    state.resizingPostitId = null;
    state.resizePostitStartClient = null;
    state.resizePostitStartSize = null;
    commit(() => {
      const node = getNode(resizedId);
      if (!node) return;
      node.width = getNodeWidth(node);
      node.height = getNodeHeight(node);
    }, "Post-it redimensionné");
    return;
  }
  if (!state.draggingNodeId) return;
  const movedId = state.draggingNodeId;
  const moved = state.dragActivated;
  state.draggingNodeId = null;
  state.dragActivated = false;
  state.dragStartClient = null;
  if (!moved) return;
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
  if (isNodeLockedByOther(nodeId)) {
    const owner = getLockOwner(nodeId);
    setStatus(`Nœud verrouillé par ${owner ? owner.name : "un autre membre"}`, true);
    return;
  }
  state.inlineEditNodeId = nodeId;
  state.inlineEditIsPostit = isPostitNode(node);
  state.selectedNodeId = nodeId;
  state.selectedEdgeId = null;
  requestRender();

  window.requestAnimationFrame(() => {
    const allInputs = els.nodes.querySelectorAll("[data-inline-editor='true']");
    const input = Array.from(allInputs).find((el) => el.dataset.nodeId === nodeId);
    if (!input) return;
    input.focus();
    if (typeof input.select === "function") input.select();
  });
}

function commitInlineEdit(nodeId, nextTitle, options = {}) {
  const node = getNode(nodeId);
  const isPostit = isPostitNode(node);
  const normalized = isPostit
    ? String(nextTitle || "").replace(/\r/g, "").trim() || "Commentaire"
    : (nextTitle || "").trim() || "Nœud";
  const changed = commit(() => {
    const target = getNode(nodeId);
    if (target) target.title = normalized;
    if (target && isPostit) {
      const width = Number(options.width);
      const height = Number(options.height);
      if (Number.isFinite(width)) target.width = Math.max(160, Math.min(760, Math.round(width)));
      if (Number.isFinite(height)) target.height = Math.max(80, Math.min(720, Math.round(height)));
    }
  }, "Titre du nœud mis à jour");
  state.inlineEditNodeId = null;
  state.inlineEditIsPostit = false;
  if (!changed) {
    requestRender();
  }
}

function postitSizeFromEditor(input) {
  const nodeEl = input && typeof input.closest === "function" ? input.closest(".node") : null;
  if (!nodeEl) return null;
  const styles = window.getComputedStyle(nodeEl);
  const padX = parseFloat(styles.paddingLeft || "0") + parseFloat(styles.paddingRight || "0");
  const padY = parseFloat(styles.paddingTop || "0") + parseFloat(styles.paddingBottom || "0");
  const width = Math.max(160, Math.round(input.offsetWidth + padX));
  const height = Math.max(80, Math.round(input.offsetHeight + padY));
  return { width, height };
}

function cancelInlineEdit() {
  if (!state.inlineEditNodeId) return;
  state.inlineEditNodeId = null;
  state.inlineEditIsPostit = false;
  requestRender();
}

function onCanvasPointerDown(event) {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  const inNodeQuickActions = path.includes(els.quickActions);
  const inEdgeQuickActions = path.includes(els.edgeQuickActions);
  const hitNode = event.target.closest(".node");
  const hitEdge = event.target.closest(".edge-hit, .edge-path, .edge-label");
  const hitQuickActions = inNodeQuickActions || event.target.closest(".node-quick-actions");
  const hitEdgeQuickActions = inEdgeQuickActions || event.target.closest(".edge-quick-actions");
  if (state.linkDraft && !hitNode) {
    finishLinkDraft(null);
    return;
  }
  if ((hitNode || hitEdge || hitQuickActions || hitEdgeQuickActions) && !state.spacePressed) return;
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
  if (state.linkDraft) {
    state.linkDraftCursor = toWorld(event.clientX, event.clientY);
    requestRender();
  }
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
  if (state.appLocked) return;
  const activeTag = document.activeElement ? document.activeElement.tagName : "";
  const inInput = ["INPUT", "TEXTAREA", "SELECT"].includes(activeTag);

  if (event.key === "Escape" && isExportModalOpen()) {
    event.preventDefault();
    closeExportModal();
    return;
  }

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
  if (event.key === "Escape" && state.linkDraft) {
    finishLinkDraft(null);
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

  if (event.key.toLowerCase() === "p") {
    event.preventDefault();
    createPostitAtCenter();
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

async function boot() {
  closeExportModal();
  const cfg = cloudConfig();
  state.cloudSyncEnabled = cfg.enabled;
  state.cloudSyncWorkspace = cfg.workspace;
  const identity = ensureCollaboratorIdentity();
  state.realtime.clientId = identity.id;
  state.realtime.clientName = identity.name;
  state.realtime.enabled = cfg.enabled;
  updatePresenceBar();

  if (state.cloudSyncEnabled) {
    try {
      await syncCloudToLocal();
    } catch {
      setStatus("Cloud indisponible, mode local actif", true);
    }
  }

  let projects = await listProjectsFromDb();

  if (!projects.length) {
    let seedGraph = createDefaultGraph();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const validated = core.validateAndNormalizeData(parsed);
        if (validated.ok) {
          seedGraph = validated.data;
        }
      } catch {
      }
    }
    const firstId = makeProjectId();
    await putProjectToDb(toProjectRecord({
      id: firstId,
      name: "Projet 1",
      graph: seedGraph,
      preferredLayout: state.preferredLayout,
      defaultEdgeShape: state.defaultEdgeShape,
    }));
    projects = await listProjectsFromDb();
  }

  await refreshProjectsFromDb();
  const requestedId = localStorage.getItem(ACTIVE_PROJECT_KEY);
  let project = null;
  if (requestedId) {
    project = projects.find((row) => row.id === requestedId) || null;
  }
  if (!project) {
    project = projects[0] || null;
  }
  if (project && loadProjectIntoState(project, "")) {
    state.lastSavedHash = graphHash();
    await joinRealtimeChannelForProject(state.currentProjectId);
    return;
  }

  state.graph = createDefaultGraph();
  resetRealtimeVersionState(state.graph);
  state.lastSavedHash = graphHash();
  state.defaultEdgeShape = deriveDefaultEdgeShapeFromGraph();
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  refreshProjectUi();
  requestRender();
  await joinRealtimeChannelForProject(state.currentProjectId);
}

els.nodes.addEventListener("click", (event) => {
  if (event.target.closest("[data-inline-editor='true'], [data-postit-editor='true']")) return;
  const nodeEl = event.target.closest(".node");
  if (!nodeEl) return;
  event.stopPropagation();
  if ((event.metaKey || event.ctrlKey) && event.target.closest(".node-title")) {
    const node = getNode(nodeEl.dataset.id);
    if (node && isValidHttpLink(node.titleLink)) {
      window.open(node.titleLink, "_blank", "noopener,noreferrer");
      return;
    }
  }
  if (state.linkDraft) {
    finishLinkDraft(nodeEl.dataset.id);
    return;
  }
  if (state.inlineEditNodeId === nodeEl.dataset.id) return;
  onNodeClick(nodeEl.dataset.id);
});

els.nodes.addEventListener("dblclick", (event) => {
  if (event.target.closest("[data-inline-editor='true']")) return;
  const nodeEl = event.target.closest(".node");
  if (!nodeEl) return;
  const node = getNode(nodeEl.dataset.id);
  if (node && isPostitNode(node)) return;
  event.preventDefault();
  event.stopPropagation();
  startInlineEdit(nodeEl.dataset.id);
});

els.nodes.addEventListener("keydown", (event) => {
  const input = event.target.closest("[data-inline-editor='true']");
  if (!input) return;
  const nodeId = input.dataset.nodeId;
  const node = nodeId ? getNode(nodeId) : null;
  const isPostit = isPostitNode(node);

  if (!isPostit && event.key === "Enter") {
    event.preventDefault();
    commitInlineEdit(input.dataset.nodeId, input.value);
    return;
  }
  if (isPostit && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    const size = postitSizeFromEditor(input) || {};
    commitInlineEdit(input.dataset.nodeId, input.value, {
      width: size.width,
      height: size.height,
    });
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
  const size = postitSizeFromEditor(input) || {};
  commitInlineEdit(input.dataset.nodeId, input.value, {
    width: size.width,
    height: size.height,
  });
}, true);

els.nodes.addEventListener("input", (event) => {
  const editor = event.target.closest("[data-postit-editor='true']");
  if (!editor) return;
  const nodeId = editor.dataset.nodeId;
  const node = nodeId ? getNode(nodeId) : null;
  if (!node || !isPostitNode(node)) return;
  node.title = String(editor.value || "").slice(0, 4000);
});

function syncPostitDimensionsFromDom(editor) {
  if (!editor) return;
  const nodeId = editor.dataset.nodeId;
  const node = nodeId ? getNode(nodeId) : null;
  const nodeEl = editor.closest(".node");
  if (!node || !nodeEl || !isPostitNode(node)) return;
  node.width = Math.max(160, Math.min(760, Math.round(nodeEl.offsetWidth)));
  node.height = Math.max(80, Math.min(720, Math.round(nodeEl.offsetHeight)));
}

els.nodes.addEventListener("pointerup", (event) => {
  const editor = event.target.closest("[data-postit-editor='true']");
  if (!editor) return;
  syncPostitDimensionsFromDom(editor);
});

els.nodes.addEventListener("blur", (event) => {
  const editor = event.target.closest("[data-postit-editor='true']");
  if (!editor) return;
  syncPostitDimensionsFromDom(editor);
  saveNow();
}, true);

els.nodes.addEventListener("pointerdown", onNodePointerDown);
els.nodes.addEventListener("pointermove", onNodePointerMove);
els.nodes.addEventListener("pointerup", onNodePointerUp);
els.nodes.addEventListener("pointercancel", onNodePointerUp);
window.addEventListener("pointermove", onNodePointerMove);
window.addEventListener("pointerup", onNodePointerUp);
window.addEventListener("pointercancel", onNodePointerUp);
els.nodes.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest(".node-handle");
  if (!handle) return;
  const nodeEl = handle.closest(".node");
  if (!nodeEl) return;
  const node = getNode(nodeEl.dataset.id);
  if (!node || isPostitNode(node)) return;
  event.preventDefault();
  event.stopPropagation();
  if (!state.linkDraft) {
    startLinkDraft(nodeEl.dataset.id);
    return;
  }
  if (state.linkDraft.sourceId === nodeEl.dataset.id) {
    finishLinkDraft(null);
    return;
  }
  finishLinkDraft(nodeEl.dataset.id);
});

function selectEdgeFromEvent(event) {
  const edgeEl = event.target.closest(".edge-hit, .edge-path, .edge-label");
  if (!edgeEl || !edgeEl.dataset.edgeId) return;
  if ((event.metaKey || event.ctrlKey) && event.target.closest(".edge-label")) {
    const edge = getEdge(edgeEl.dataset.edgeId);
    if (edge && isValidHttpLink(edge.titleLink)) {
      window.open(edge.titleLink, "_blank", "noopener,noreferrer");
      return;
    }
  }
  event.preventDefault();
  event.stopPropagation();
  selectEdge(edgeEl.dataset.edgeId);
}

els.edges.addEventListener("pointerdown", selectEdgeFromEvent);
els.edges.addEventListener("click", selectEdgeFromEvent);

els.canvas.addEventListener("pointerdown", onCanvasPointerDown);
els.canvas.addEventListener("pointermove", onCanvasPointerMove);
window.addEventListener("pointerup", onCanvasPointerUp);
els.canvas.addEventListener("wheel", onCanvasWheel, { passive: false });

window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("beforeunload", () => {
  void leaveRealtimeChannel();
});

els.undoBtn.addEventListener("click", undo);
els.redoBtn.addEventListener("click", redo);

els.addRootBtn.addEventListener("click", () => {
  createRootAtCenter();
});

els.addChildBtn.addEventListener("click", () => {
  addChildToSelected();
});
if (els.addPostitBtn) {
  els.addPostitBtn.addEventListener("click", () => {
    createPostitAtCenter();
  });
}

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

if (els.nodeTitleCenterBtn) {
  els.nodeTitleCenterBtn.addEventListener("click", () => {
    if (!state.selectedNodeId) return;
    commit(() => {
      const node = getNode(state.selectedNodeId);
      if (!node) return;
      node.textAlign = getTextAlignForNode(node) === "center" ? "left" : "center";
    }, "Alignement du titre mis à jour");
  });
}

if (els.nodeTitleBoldBtn) {
  els.nodeTitleBoldBtn.addEventListener("click", () => {
    if (!state.selectedNodeId) return;
    commit(() => {
      const node = getNode(state.selectedNodeId);
      if (!node) return;
      node.textBold = !isTextBold(node);
    }, "Gras du titre mis à jour");
  });
}

if (els.nodeTitleItalicBtn) {
  els.nodeTitleItalicBtn.addEventListener("click", () => {
    if (!state.selectedNodeId) return;
    commit(() => {
      const node = getNode(state.selectedNodeId);
      if (!node) return;
      node.textItalic = !isTextItalic(node);
    }, "Italique du titre mis à jour");
  });
}

if (els.nodeTitleLinkInput) {
  els.nodeTitleLinkInput.addEventListener("change", (event) => {
    if (!state.selectedNodeId) return;
    const value = normalizeTitleLink(event.target.value);
    commit(() => {
      const node = getNode(state.selectedNodeId);
      if (!node) return;
      node.titleLink = value;
    }, "Lien du titre du nœud mis à jour");
  });
}

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

els.edgeTitleInput.addEventListener("input", (event) => {
  if (!state.selectedEdgeId) return;
  const nextLabel = event.target.value.trim().slice(0, 80);
  commit(() => {
    const edge = getEdge(state.selectedEdgeId);
    if (edge) edge.label = nextLabel;
  }, "Titre du lien mis à jour");
});

els.edgeColorInput.addEventListener("input", (event) => {
  if (!state.selectedEdgeId) return;
  const nextColor = event.target.value;
  commit(() => {
    const edge = getEdge(state.selectedEdgeId);
    if (edge) edge.color = nextColor;
  }, "Couleur du lien mise à jour");
});

els.edgeStyleSelect.addEventListener("change", (event) => {
  if (!state.selectedEdgeId) return;
  const nextStyle = event.target.value === "dashed" || event.target.value === "dotted" ? event.target.value : "solid";
  commit(() => {
    const edge = getEdge(state.selectedEdgeId);
    if (edge) edge.style = nextStyle;
  }, "Style du lien mis à jour");
});

if (els.edgeTitleCenterBtn) {
  els.edgeTitleCenterBtn.addEventListener("click", () => {
    if (!state.selectedEdgeId) return;
    commit(() => {
      const edge = getEdge(state.selectedEdgeId);
      if (!edge) return;
      edge.textAlign = getTextAlignForEdge(edge) === "center" ? "left" : "center";
    }, "Alignement du titre du lien mis à jour");
  });
}

if (els.edgeTitleBoldBtn) {
  els.edgeTitleBoldBtn.addEventListener("click", () => {
    if (!state.selectedEdgeId) return;
    commit(() => {
      const edge = getEdge(state.selectedEdgeId);
      if (!edge) return;
      edge.textBold = !isTextBold(edge);
    }, "Gras du titre du lien mis à jour");
  });
}

if (els.edgeTitleItalicBtn) {
  els.edgeTitleItalicBtn.addEventListener("click", () => {
    if (!state.selectedEdgeId) return;
    commit(() => {
      const edge = getEdge(state.selectedEdgeId);
      if (!edge) return;
      edge.textItalic = !isTextItalic(edge);
    }, "Italique du titre du lien mis à jour");
  });
}

if (els.edgeTitleLinkInput) {
  els.edgeTitleLinkInput.addEventListener("change", (event) => {
    if (!state.selectedEdgeId) return;
    const value = normalizeTitleLink(event.target.value);
    commit(() => {
      const edge = getEdge(state.selectedEdgeId);
      if (!edge) return;
      edge.titleLink = value;
    }, "Lien du titre du lien mis à jour");
  });
}

function applyGlobalEdgeShape(nextShape) {
  const normalized = normalizeEdgeShape(nextShape);
  state.defaultEdgeShape = normalized;
  state.activeTraitPreset = "personnalise";
  if (!state.graph.edges.length) {
    requestRender();
    return;
  }
  commit(() => {
    for (const edge of state.graph.edges) {
      edge.shape = normalized;
    }
  }, "Forme globale des liens mise à jour");
}

if (els.edgeShapeGeoBtn) {
  els.edgeShapeGeoBtn.addEventListener("click", () => applyGlobalEdgeShape("geometrique"));
}
if (els.edgeShapeRoundBtn) {
  els.edgeShapeRoundBtn.addEventListener("click", () => applyGlobalEdgeShape("arrondi"));
}
if (els.edgeShapeCurveBtn) {
  els.edgeShapeCurveBtn.addEventListener("click", () => applyGlobalEdgeShape("courbe"));
}

if (els.edgeQuickActions) {
  els.edgeQuickActions.addEventListener("click", (event) => {
    const presetButton = event.target.closest("[data-edge-preset]");
    if (!presetButton) return;
    applyEdgePresetToSelected(presetButton.dataset.edgePreset);
  });
}


els.layoutHorizontalBtn.addEventListener("click", () => runLayout("horizontal"));
els.layoutVerticalBtn.addEventListener("click", () => runLayout("vertical"));
els.layoutRadialBtn.addEventListener("click", () => runLayout("radial"));

els.openImportBtn.addEventListener("click", () => {
  els.importJsonInput.click();
});

els.importJsonInput.addEventListener("change", (event) => {
  const file = event.target.files && event.target.files[0];
  if (file) importJson(file);
  event.target.value = "";
});

els.openExportModalBtn.addEventListener("click", openExportModal);
els.closeExportModalBtn.addEventListener("click", closeExportModal);
els.runExportJsonBtn.addEventListener("click", runExportJsonFromModal);
els.runExportBtn.addEventListener("click", runExportFromModal);
els.exportModal.addEventListener("click", (event) => {
  if (event.target === els.exportModal) {
    closeExportModal();
  }
});

els.qaAddChildBtn.addEventListener("click", () => {
  addChildToSelected();
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

if (els.projectSelect) {
  els.projectSelect.addEventListener("change", async (event) => {
    const nextId = event.target.value;
    if (!nextId || nextId === state.currentProjectId) return;
    try {
      await persistCurrentProjectToDb();
      const project = await getProjectFromDb(nextId);
      if (!project || !loadProjectIntoState(project, `Projet "${project.name || "Sans nom"}" chargé`)) {
        setStatus("Impossible de charger ce projet", true);
        refreshProjectUi();
        return;
      }
      await joinRealtimeChannelForProject(state.currentProjectId);
    } catch {
      setStatus("Erreur lors du changement de projet", true);
      refreshProjectUi();
    }
  });
}

if (els.projectNewBtn) {
  els.projectNewBtn.addEventListener("click", async () => {
    const proposed = window.prompt("Nom du nouveau projet", `Projet ${state.projects.length + 1}`);
    if (proposed === null) return;
    const name = proposed.trim() || `Projet ${state.projects.length + 1}`;
    const id = makeProjectId();
    try {
      await persistCurrentProjectToDb();
      const record = toProjectRecord({
        id,
        name,
        graph: createDefaultGraph(),
        preferredLayout: state.preferredLayout,
        defaultEdgeShape: state.defaultEdgeShape,
      });
      await putProjectToDb(record);
      if (state.cloudSyncEnabled) {
        await upsertCloudProject(record);
      }
      await refreshProjectsFromDb();
      loadProjectIntoState(record, `Projet "${name}" créé`);
      await joinRealtimeChannelForProject(state.currentProjectId);
    } catch {
      setStatus("Création du projet impossible", true);
    }
  });
}

if (els.projectRenameBtn) {
  els.projectRenameBtn.addEventListener("click", async () => {
    if (!state.currentProjectId) return;
    const proposed = window.prompt("Nouveau nom du projet", state.currentProjectName || "");
    if (proposed === null) return;
    const name = proposed.trim();
    if (!name) {
      setStatus("Nom de projet vide", true);
      return;
    }
    try {
      const row = await getProjectFromDb(state.currentProjectId);
      if (!row) return;
      row.name = name;
      row.updatedAt = new Date().toISOString();
      await putProjectToDb(row);
      if (state.cloudSyncEnabled) {
        await upsertCloudProject(row);
      }
      state.currentProjectName = name;
      await refreshProjectsFromDb();
      setStatus("Projet renommé", false);
    } catch {
      setStatus("Renommage impossible", true);
    }
  });
}

if (els.projectDeleteBtn) {
  els.projectDeleteBtn.addEventListener("click", async () => {
    if (!state.currentProjectId || state.projects.length <= 1) return;
    const ok = window.confirm(`Supprimer le projet "${state.currentProjectName}" ?`);
    if (!ok) return;
    const deletedId = state.currentProjectId;
    try {
      await deleteProjectFromDb(deletedId);
      if (state.cloudSyncEnabled) {
        await deleteCloudProject(deletedId);
      }
      await refreshProjectsFromDb();
      const fallbackId = state.projects[0] ? state.projects[0].id : null;
      if (!fallbackId) return;
      const fallback = await getProjectFromDb(fallbackId);
      if (fallback) {
        loadProjectIntoState(fallback, "Projet supprimé");
        await joinRealtimeChannelForProject(state.currentProjectId);
      }
    } catch {
      setStatus("Suppression impossible", true);
    }
  });
}

window.setInterval(runAutosave, AUTOSAVE_INTERVAL_MS);
window.setInterval(() => {
  void syncCloudFromCurrentState().catch(() => {});
}, CLOUD_SYNC_INTERVAL_MS);

ensurePasswordGate(() => {
  void boot().catch(() => {
    setStatus("Erreur d'initialisation", true);
  });
});
