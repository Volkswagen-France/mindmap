(function rootFactory(globalScope, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.MindMapCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function buildCore() {
  const NODE_WIDTH = 200;
  const NODE_HEIGHT = 56;

  function cloneGraph(graph) {
    return JSON.parse(JSON.stringify(graph));
  }

  function isHexColor(value) {
    return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
  }

  function normalizeEdgeStyle(value, fallback = "dotted") {
    if (value === "solid" || value === "dashed" || value === "dotted") return value;
    return fallback;
  }

  function normalizeEdgeShape(value) {
    if (value === "arrondi" || value === "courbe") return value;
    return "geometrique";
  }

  function normalizeTextAlign(value, fallback) {
    if (value === "center" || value === "right") return value;
    if (value === "left") return "left";
    return fallback;
  }

  function normalizeTitleLink(value) {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, 500);
  }

  function normalizeNodeKind(value) {
    return value === "postit" ? "postit" : "node";
  }

  function normalizeNodeWidth(value, kind) {
    const base = kind === "postit" ? 240 : NODE_WIDTH;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return base;
    return Math.max(120, Math.min(760, Math.round(parsed)));
  }

  function normalizeNodeHeight(value, kind) {
    const base = kind === "postit" ? 140 : NODE_HEIGHT;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return base;
    return Math.max(56, Math.min(720, Math.round(parsed)));
  }

  function buildNodeIndex(nodes) {
    const map = new Map();
    for (const node of nodes) {
      map.set(node.id, node);
    }
    return map;
  }

  function buildChildrenMap(nodes) {
    const children = new Map();
    for (const node of nodes) {
      if (!children.has(node.id)) children.set(node.id, []);
    }
    for (const node of nodes) {
      if (!node.parentId) continue;
      if (!children.has(node.parentId)) children.set(node.parentId, []);
      children.get(node.parentId).push(node.id);
    }
    return children;
  }

  function createsTreeCycle(nodes, childId, parentId) {
    if (!parentId || childId === parentId) return childId === parentId;
    const index = buildNodeIndex(nodes);
    let cursor = index.get(parentId);
    const seen = new Set();

    while (cursor) {
      if (cursor.id === childId) return true;
      if (!cursor.parentId) return false;
      if (seen.has(cursor.id)) return true;
      seen.add(cursor.id);
      cursor = index.get(cursor.parentId);
    }
    return false;
  }

  function validateAndNormalizeData(input) {
    const errors = [];
    if (!input || typeof input !== "object") {
      return { ok: false, errors: ["Payload must be an object."], data: null };
    }

    const rawNodes = Array.isArray(input.nodes) ? input.nodes : [];
    const rawEdges = Array.isArray(input.edges) ? input.edges : [];
    const rawGroups = Array.isArray(input.groups) ? input.groups : [];
    const nodes = [];
    const idSet = new Set();

    for (let i = 0; i < rawNodes.length; i += 1) {
      const raw = rawNodes[i];
      if (!raw || typeof raw !== "object") {
        errors.push(`Node at index ${i} is invalid.`);
        continue;
      }
      const id = String(raw.id || "").trim();
      if (!id) {
        errors.push(`Node at index ${i} has no id.`);
        continue;
      }
      if (idSet.has(id)) {
        errors.push(`Duplicate node id '${id}'.`);
        continue;
      }
      idSet.add(id);

      const x = Number(raw.x);
      const y = Number(raw.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        errors.push(`Node '${id}' has invalid coordinates.`);
        continue;
      }

      const kind = normalizeNodeKind(raw.kind);
      nodes.push({
        id,
        x,
        y,
        kind,
        groupId: typeof raw.groupId === "string" ? raw.groupId.trim().slice(0, 120) : "",
        width: normalizeNodeWidth(raw.width, kind),
        height: normalizeNodeHeight(raw.height, kind),
        title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Node",
        color: isHexColor(raw.color) ? raw.color : "#ffd166",
        textColor: isHexColor(raw.textColor) ? raw.textColor : "#1f2230",
        borderColor: isHexColor(raw.borderColor) ? raw.borderColor : "#5c647f",
        borderWidth: Number.isFinite(Number(raw.borderWidth)) ? Math.max(0, Math.min(8, Number(raw.borderWidth))) : 2,
        radius: Number.isFinite(Number(raw.radius)) ? Math.max(0, Math.min(28, Number(raw.radius))) : 14,
        textAlign: normalizeTextAlign(raw.textAlign, "left"),
        textBold: Boolean(raw.textBold),
        textItalic: Boolean(raw.textItalic),
        titleLink: normalizeTitleLink(raw.titleLink),
        parentId: raw.parentId ? String(raw.parentId) : null,
      });
    }

    const nodeIndex = buildNodeIndex(nodes);
    for (const node of nodes) {
      if (node.parentId && !nodeIndex.has(node.parentId)) {
        errors.push(`Node '${node.id}' references unknown parent '${node.parentId}'.`);
      }
      if (node.kind !== "postit" && createsTreeCycle(nodes, node.id, node.parentId)) {
        errors.push(`Node '${node.id}' introduces a parent cycle.`);
      }
    }

    const edges = [];
    const edgeSet = new Set();
    for (let i = 0; i < rawEdges.length; i += 1) {
      const raw = rawEdges[i];
      if (!raw || typeof raw !== "object") {
        errors.push(`Edge at index ${i} is invalid.`);
        continue;
      }
      const source = String(raw.source || "").trim();
      const target = String(raw.target || "").trim();
      if (!source || !target) {
        errors.push(`Edge at index ${i} has missing source/target.`);
        continue;
      }
      if (source === target) {
        errors.push(`Edge '${source}->${target}' is a self-loop.`);
        continue;
      }
      if (!nodeIndex.has(source) || !nodeIndex.has(target)) {
        errors.push(`Edge '${source}->${target}' references unknown node.`);
        continue;
      }
      const type = raw.type === "tree" ? "tree" : "free";
      const id = String(raw.id || `${type}-${source}-${target}`);
      const dedupeKey = `${type}:${source}:${target}`;
      if (edgeSet.has(dedupeKey)) {
        errors.push(`Duplicate edge '${dedupeKey}'.`);
        continue;
      }
      edgeSet.add(dedupeKey);
      const color = isHexColor(raw.color)
        ? raw.color
        : (type === "free" ? "#e15d44" : "#6d86b8");
      const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 80) : "";
      const labelBgColor = isHexColor(raw.labelBgColor) ? raw.labelBgColor : "#ffffff";
      const style = normalizeEdgeStyle(raw.style, type === "tree" ? "solid" : "dotted");
      const shape = normalizeEdgeShape(raw.shape);
      edges.push({
        id,
        source,
        target,
        type,
        color,
        label,
        style,
        shape,
        labelBgColor,
        textAlign: normalizeTextAlign(raw.textAlign, "center"),
        textBold: Boolean(raw.textBold),
        textItalic: Boolean(raw.textItalic),
        titleLink: normalizeTitleLink(raw.titleLink),
      });
    }

    for (const node of nodes) {
      if (!node.parentId) continue;
      const hasTreeEdge = edges.some(
        (edge) => edge.type === "tree" && edge.source === node.parentId && edge.target === node.id,
      );
      if (!hasTreeEdge && node.kind !== "postit") {
        edges.push({
          id: `tree-${node.parentId}-${node.id}`,
          source: node.parentId,
          target: node.id,
          type: "tree",
          color: "#6d86b8",
          label: "",
          style: "solid",
          shape: "geometrique",
          labelBgColor: "#ffffff",
          textAlign: "center",
          textBold: false,
          textItalic: false,
          titleLink: "",
        });
      }
    }

    const numericIds = nodes
      .map((node) => Number(node.id))
      .filter((value) => Number.isInteger(value) && value > 0);

    const nextId = Number.isInteger(input.nextId) && input.nextId > 0
      ? input.nextId
      : (numericIds.length ? Math.max(...numericIds) : 0) + 1;

    const groups = [];
    const groupIdSet = new Set();
    for (const raw of rawGroups) {
      if (!raw || typeof raw !== "object") continue;
      const id = String(raw.id || "").trim();
      if (!id || groupIdSet.has(id)) continue;
      groupIdSet.add(id);
      groups.push({
        id,
        title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 80) : "Groupe",
        color: isHexColor(raw.color) ? raw.color : "#eef3ff",
      });
    }

    return {
      ok: errors.length === 0,
      errors,
      data: { nodes, edges, groups, nextId },
    };
  }

  function collectSubtreeIds(nodes, rootId) {
    const children = buildChildrenMap(nodes);
    const result = new Set();
    const queue = [rootId];

    while (queue.length) {
      const id = queue.shift();
      if (!id || result.has(id)) continue;
      result.add(id);
      const childIds = children.get(id) || [];
      for (const childId of childIds) {
        queue.push(childId);
      }
    }

    return result;
  }

  function getBounds(nodes, ids) {
    const picked = ids ? nodes.filter((node) => ids.has(node.id)) : nodes;
    if (picked.length === 0) return { x: 0, y: 0, width: 1200, height: 900 };

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of picked) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      const w = normalizeNodeWidth(node.width, node.kind);
      const h = normalizeNodeHeight(node.height, node.kind);
      maxX = Math.max(maxX, node.x + w);
      maxY = Math.max(maxY, node.y + h);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  function layoutGraph(graph, mode) {
    const next = cloneGraph(graph);
    const allNodes = next.nodes;
    if (allNodes.length === 0) return next;
    const nodes = allNodes.filter((node) => normalizeNodeKind(node.kind) !== "postit");
    if (nodes.length === 0) return next;

    const nodeIndex = buildNodeIndex(nodes);
    const children = new Map();
    for (const node of nodes) {
      children.set(node.id, []);
    }
    for (const node of nodes) {
      if (!node.parentId || !nodeIndex.has(node.parentId)) continue;
      children.get(node.parentId).push(node.id);
    }

    const roots = nodes
      .filter((node) => !node.parentId || !nodeIndex.has(node.parentId))
      .map((node) => node.id);
    if (roots.length === 0) {
      roots.push(nodes[0].id);
    }

    const spanMemo = new Map();
    const SIBLING_GAP_UNITS = mode === "vertical" ? 0.58 : 0.42;

    function subtreeSpan(nodeId) {
      if (spanMemo.has(nodeId)) return spanMemo.get(nodeId);
      const kids = children.get(nodeId) || [];
      if (kids.length === 0) {
        spanMemo.set(nodeId, 1);
        return 1;
      }
      let total = 0;
      for (let i = 0; i < kids.length; i += 1) {
        total += subtreeSpan(kids[i]);
      }
      total += SIBLING_GAP_UNITS * Math.max(0, kids.length - 1);
      const span = Math.max(1, total);
      spanMemo.set(nodeId, span);
      return span;
    }

    if (mode === "horizontal" || mode === "vertical") {
      const depthGap = mode === "horizontal" ? 300 : 172;
      const trackGap = mode === "horizontal" ? 114 : 296;
      const startX = 140;
      const startY = 110;
      let cursor = 0;

      function place(nodeId, depth, topUnits) {
        const kids = children.get(nodeId) || [];
        const span = subtreeSpan(nodeId);
        const center = topUnits + span / 2;
        const node = nodeIndex.get(nodeId);

        if (mode === "horizontal") {
          node.x = startX + depth * depthGap;
          node.y = startY + center * trackGap;
        } else {
          node.x = startX + center * trackGap;
          node.y = startY + depth * depthGap;
        }

        let childTop = topUnits;
        for (let i = 0; i < kids.length; i += 1) {
          const childId = kids[i];
          place(childId, depth + 1, childTop);
          childTop += subtreeSpan(childId) + SIBLING_GAP_UNITS;
        }
      }

      for (let i = 0; i < roots.length; i += 1) {
        const rootId = roots[i];
        place(rootId, 0, cursor);
        cursor += subtreeSpan(rootId) + 1.1;
      }

      // Second pass: enforce strict centering of each parent on its children.
      function centerParentOnChildren(nodeId) {
        const kids = children.get(nodeId) || [];
        for (let i = 0; i < kids.length; i += 1) {
          centerParentOnChildren(kids[i]);
        }
        if (kids.length === 0) return;
        const parent = nodeIndex.get(nodeId);
        if (!parent) return;
        const orderedKids = kids
          .map((id) => nodeIndex.get(id))
          .filter(Boolean)
          .sort((a, b) => (mode === "horizontal" ? a.y - b.y : a.x - b.x));
        if (orderedKids.length === 0) return;

        const first = orderedKids[0];
        const last = orderedKids[orderedKids.length - 1];
        if (mode === "horizontal") {
          const firstCenter = first.y + NODE_HEIGHT / 2;
          const lastCenter = last.y + NODE_HEIGHT / 2;
          const parentCenter = (firstCenter + lastCenter) / 2;
          parent.y = parentCenter - NODE_HEIGHT / 2;
        } else {
          const firstCenter = first.x + NODE_WIDTH / 2;
          const lastCenter = last.x + NODE_WIDTH / 2;
          const parentCenter = (firstCenter + lastCenter) / 2;
          parent.x = parentCenter - NODE_WIDTH / 2;
        }
      }

      for (let i = 0; i < roots.length; i += 1) {
        centerParentOnChildren(roots[i]);
      }

      // Pixel snapping for crisp rendering and stable hit-testing.
      for (let i = 0; i < nodes.length; i += 1) {
        nodes[i].x = Math.round(nodes[i].x);
        nodes[i].y = Math.round(nodes[i].y);
      }
      return next;
    }

    if (mode === "radial") {
      const centerX = 920;
      const centerY = 620;
      const radiusStep = 230;
      const sectorPadding = 0.03;

      function placeRadial(nodeId, depth, angleStart, angleEnd) {
        const node = nodeIndex.get(nodeId);
        const angle = (angleStart + angleEnd) / 2;
        const radius = depth * radiusStep;
        node.x = centerX + Math.cos(angle) * radius - NODE_WIDTH / 2;
        node.y = centerY + Math.sin(angle) * radius - NODE_HEIGHT / 2;

        const kids = children.get(nodeId) || [];
        if (kids.length === 0) return;

        let total = 0;
        for (let i = 0; i < kids.length; i += 1) {
          total += subtreeSpan(kids[i]);
        }
        let cursor = angleStart;
        const range = angleEnd - angleStart;
        for (let i = 0; i < kids.length; i += 1) {
          const childId = kids[i];
          const weight = subtreeSpan(childId) / Math.max(total, 1);
          const slice = range * weight;
          const a0 = cursor + sectorPadding;
          const a1 = cursor + slice - sectorPadding;
          placeRadial(childId, depth + 1, Math.min(a0, a1), Math.max(a0, a1));
          cursor += slice;
        }
      }

      if (roots.length === 1) {
        const rootId = roots[0];
        const root = nodeIndex.get(rootId);
        root.x = centerX - NODE_WIDTH / 2;
        root.y = centerY - NODE_HEIGHT / 2;
        const kids = children.get(rootId) || [];
        let total = 0;
        for (let i = 0; i < kids.length; i += 1) total += subtreeSpan(kids[i]);
        let cursor = -Math.PI;
        for (let i = 0; i < kids.length; i += 1) {
          const childId = kids[i];
          const weight = subtreeSpan(childId) / Math.max(total, 1);
          const slice = 2 * Math.PI * weight;
          placeRadial(childId, 1, cursor + sectorPadding, cursor + slice - sectorPadding);
          cursor += slice;
        }
      } else {
        let totalRootSpan = 0;
        for (let i = 0; i < roots.length; i += 1) totalRootSpan += subtreeSpan(roots[i]);
        let cursor = -Math.PI;
        for (let i = 0; i < roots.length; i += 1) {
          const rootId = roots[i];
          const weight = subtreeSpan(rootId) / Math.max(totalRootSpan, 1);
          const slice = 2 * Math.PI * weight;
          placeRadial(rootId, 1, cursor + sectorPadding, cursor + slice - sectorPadding);
          cursor += slice;
        }
      }
      return next;
    }

    return next;
  }

  function createHistory(limit) {
    const safeLimit = Number.isInteger(limit) && limit > 2 ? limit : 200;
    const stack = [];
    const redoStack = [];

    return {
      clear() {
        stack.length = 0;
        redoStack.length = 0;
      },
      push(graph) {
        stack.push(cloneGraph(graph));
        if (stack.length > safeLimit) stack.shift();
        redoStack.length = 0;
      },
      undo(currentGraph) {
        if (stack.length === 0) return null;
        const prev = stack.pop();
        redoStack.push(cloneGraph(currentGraph));
        return prev;
      },
      redo(currentGraph) {
        if (redoStack.length === 0) return null;
        const next = redoStack.pop();
        stack.push(cloneGraph(currentGraph));
        return next;
      },
      canUndo() {
        return stack.length > 0;
      },
      canRedo() {
        return redoStack.length > 0;
      },
      snapshot() {
        return { undo: stack.length, redo: redoStack.length };
      },
    };
  }

  return {
    NODE_WIDTH,
    NODE_HEIGHT,
    cloneGraph,
    createsTreeCycle,
    validateAndNormalizeData,
    collectSubtreeIds,
    getBounds,
    layoutGraph,
    createHistory,
  };
});
