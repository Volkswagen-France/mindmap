const core = window.MindMapCore;

const STORAGE_KEY = "mindmap-data-v2";
const AUTOSAVE_INTERVAL_MS = 12000;
const SNAP_THRESHOLD = 18;
const ROUTE_NODE_PADDING = 16;
const ROUTE_STUB = 24;
const ROUTE_CHANNEL = 28;
const ROUTE_ALIGN_STEP = 14;
const EDGE_OVERLAP_PENALTY = 10;
const EDGE_CROSS_PENALTY = 140;
const EDGE_TURN_PENALTY = 18;
const EDGE_SHORT_SEGMENT_PENALTY = 12;

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
  lastSavedHash: "",
  preferredLayout: "horizontal",
  defaultEdgeShape: "arrondi",
  edgeRouteCache: new Map(),
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
  deleteBtn: document.getElementById("delete-btn"),
  clearBtn: document.getElementById("clear-btn"),
  titleInput: document.getElementById("node-title"),
  textColorInput: document.getElementById("node-text-color"),
  colorInput: document.getElementById("node-color"),
  borderColorInput: document.getElementById("node-border-color"),
  borderWidthInput: document.getElementById("node-border-width"),
  radiusInput: document.getElementById("node-radius"),
  edgeQuickActions: document.getElementById("edge-quick-actions"),
  edgeTitleInput: document.getElementById("edge-title"),
  edgeColorInput: document.getElementById("edge-color"),
  edgeStyleSelect: document.getElementById("edge-style"),
  edgeShapeGlobalSelect: document.getElementById("edge-shape-global"),
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
  qaRenameBtn: document.getElementById("qa-rename"),
  qaDeleteBtn: document.getElementById("qa-delete"),
  emptyState: document.getElementById("empty-state"),
  emptyCreateBtn: document.getElementById("empty-create-btn"),
};

function graphHash() {
  return JSON.stringify(state.graph);
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
  return {
    left: node.x - padding,
    top: node.y - padding,
    right: node.x + core.NODE_WIDTH + padding,
    bottom: node.y + core.NODE_HEIGHT + padding,
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

function alignPathInterior(points, step = ROUTE_ALIGN_STEP) {
  if (!points || points.length < 3) return points;
  const aligned = points.map((point, index) => {
    if (index === 0 || index === points.length - 1) {
      return { x: Math.round(point.x), y: Math.round(point.y) };
    }
    return {
      x: alignToStep(point.x, step),
      y: alignToStep(point.y, step),
    };
  });
  return compressOrthogonalPath(aligned);
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
  const sx = source.x + core.NODE_WIDTH / 2;
  const sy = source.y + core.NODE_HEIGHT / 2;
  const tx = target.x + core.NODE_WIDTH / 2;
  const ty = target.y + core.NODE_HEIGHT / 2;
  const dx = tx - sx;
  const dy = ty - sy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return {
        start: { x: source.x + core.NODE_WIDTH, y: sy, side: "right" },
        end: { x: target.x, y: ty, side: "left" },
      };
    }
    return {
      start: { x: source.x, y: sy, side: "left" },
      end: { x: target.x + core.NODE_WIDTH, y: ty, side: "right" },
    };
  }
  if (dy >= 0) {
    return {
      start: { x: sx, y: source.y + core.NODE_HEIGHT, side: "bottom" },
      end: { x: tx, y: target.y, side: "top" },
    };
  }
  return {
    start: { x: sx, y: source.y, side: "top" },
    end: { x: tx, y: target.y + core.NODE_HEIGHT, side: "bottom" },
  };
}

function anchorStub(anchor, distance = ROUTE_STUB) {
  if (anchor.side === "right") return { x: anchor.x + distance, y: anchor.y };
  if (anchor.side === "left") return { x: anchor.x - distance, y: anchor.y };
  if (anchor.side === "bottom") return { x: anchor.x, y: anchor.y + distance };
  return { x: anchor.x, y: anchor.y - distance };
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
    const path = alignPathInterior(compressOrthogonalPath(rawPath));
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
  return best || alignPathInterior(compressOrthogonalPath([start, end]));
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
  const first = points[0];
  let d = `M ${first.x - offsetX} ${first.y - offsetY}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const mx = (current.x + next.x) / 2;
    const my = (current.y + next.y) / 2;
    d += ` Q ${current.x - offsetX} ${current.y - offsetY}, ${mx - offsetX} ${my - offsetY}`;
  }
  const beforeLast = points[points.length - 2];
  const last = points[points.length - 1];
  d += ` Q ${beforeLast.x - offsetX} ${beforeLast.y - offsetY}, ${last.x - offsetX} ${last.y - offsetY}`;
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
    for (let i = 1; i < points.length - 1; i += 1) {
      const current = points[i];
      const next = points[i + 1];
      const mx = (current.x + next.x) / 2;
      const my = (current.y + next.y) / 2;
      ctx.quadraticCurveTo(current.x - offsetX, current.y - offsetY, mx - offsetX, my - offsetY);
    }
    const beforeLast = points[points.length - 2];
    const last = points[points.length - 1];
    ctx.quadraticCurveTo(beforeLast.x - offsetX, beforeLast.y - offsetY, last.x - offsetX, last.y - offsetY);
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

  const anchors = edgeAnchors(source, target);
  const start = { x: anchors.start.x, y: anchors.start.y };
  const end = { x: anchors.end.x, y: anchors.end.y };
  const startStub = anchorStub(anchors.start);
  const endStub = anchorStub(anchors.end);
  const obstacles = state.graph.nodes
    .filter((node) => node.id !== source.id && node.id !== target.id)
    .map((node) => buildObstacle(node, ROUTE_NODE_PADDING));
  const bounds = core.getBounds(state.graph.nodes);

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
      color: "#e15d44",
      label: "",
      style: "dashed",
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
  requestRender();
}

function finishLinkDraft(targetNodeId) {
  if (!state.linkDraft) return;
  const sourceId = state.linkDraft.sourceId;
  state.linkDraft = null;
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
  saveNow();
  setStatus(label || "Mis à jour", false);
  requestRender();
  return true;
}

function applyGraph(nextGraph, label) {
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
  saveNow();
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
    els.edgeTitleInput.value = edge.label || "";
    els.edgeColorInput.value = getEdgeColor(edge);
    els.edgeStyleSelect.value = getEdgeStyle(edge);
  }
  requestRender();
}

function clearSelection() {
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  state.linkingFrom = null;
  state.linkDraft = null;
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
  if (state.selectedNodeId && getNode(state.selectedNodeId)) {
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
    state.graph = applyPreferredLayout(validated.data);
    state.inlineEditNodeId = null;
    state.lastSavedHash = graphHash();
    state.selectedNodeId = null;
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
  } else if (format === "json") {
    exportJson();
    setStatus("Export JSON généré", false);
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
      ctx.setLineDash([]);
      ctx.fillStyle = "#2a3140";
      ctx.fillText(edge.label, route.mid.x - bounds.x, route.mid.y - bounds.y - 8);
    }
    addPathSegments(route.points, occupied);
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
      svg += `<text x="${route.mid.x - bounds.x}" y="${route.mid.y - bounds.y - 8}" class="edge-label" text-anchor="middle" dominant-baseline="middle" font-family="Avenir Next, Segoe UI, sans-serif" font-size="12" fill="#2a3140">${escapeXml(edge.label)}</text>`;
    }
    addPathSegments(route.points, occupied);
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
    if (state.linkDraft && state.linkDraft.sourceId === node.id) {
      element.classList.add("linking-source");
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
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String(route.mid.x));
      label.setAttribute("y", String(route.mid.y - 8));
      label.setAttribute("class", "edge-label");
      label.dataset.edgeId = edge.id;
      label.textContent = edge.label;
      fragment.appendChild(label);
    }
    addPathSegments(route.points, occupied);
  }

  state.edgeRouteCache = routeCache;
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

  els.undoBtn.disabled = !history.canUndo();
  els.redoBtn.disabled = !history.canRedo();
  els.addChildBtn.disabled = !nodeSelected;
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

  if (els.edgeShapeGlobalSelect) {
    els.edgeShapeGlobalSelect.value = normalizeEdgeShape(state.defaultEdgeShape);
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
  const menuWidth = 280;
  let x = midX - menuWidth / 2;
  let y = midY + 14;
  if (x < 10) x = 10;
  if (x + menuWidth > mapSize.width - 10) x = mapSize.width - menuWidth - 10;
  if (y < 10) y = 10;
  els.edgeQuickActions.style.left = `${x}px`;
  els.edgeQuickActions.style.top = `${y}px`;
}

function renderViewport() {
  els.stage.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.zoom})`;
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
  if (event.target.closest(".node-handle")) return;
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
  closeExportModal();
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
    state.graph = {
      nodes: [{ id: "1", x: 180, y: 140, title: "Projet", color: "#ffd166", parentId: null }],
      edges: [],
      nextId: 2,
    };
  }

  state.lastSavedHash = graphHash();
  state.defaultEdgeShape = deriveDefaultEdgeShapeFromGraph();
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  requestRender();
}

els.nodes.addEventListener("click", (event) => {
  const nodeEl = event.target.closest(".node");
  if (!nodeEl) return;
  event.stopPropagation();
  if (state.linkDraft) {
    finishLinkDraft(nodeEl.dataset.id);
    return;
  }
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
els.nodes.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest(".node-handle");
  if (!handle) return;
  const nodeEl = handle.closest(".node");
  if (!nodeEl) return;
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

els.undoBtn.addEventListener("click", undo);
els.redoBtn.addEventListener("click", redo);

els.addRootBtn.addEventListener("click", () => {
  createRootAtCenter();
});

els.addChildBtn.addEventListener("click", () => {
  addChildToSelected();
});

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

if (els.edgeShapeGlobalSelect) {
  els.edgeShapeGlobalSelect.addEventListener("change", (event) => {
    const nextShape = normalizeEdgeShape(event.target.value);
    state.defaultEdgeShape = nextShape;
    if (!state.graph.edges.length) {
      requestRender();
      return;
    }
    commit(() => {
      for (const edge of state.graph.edges) {
        edge.shape = nextShape;
      }
    }, "Forme globale des liens mise à jour");
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

window.setInterval(runAutosave, AUTOSAVE_INTERVAL_MS);

boot();
