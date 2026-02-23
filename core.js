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

      nodes.push({
        id,
        x,
        y,
        title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Node",
        color: isHexColor(raw.color) ? raw.color : "#ffd166",
        textColor: isHexColor(raw.textColor) ? raw.textColor : "#1f2230",
        borderColor: isHexColor(raw.borderColor) ? raw.borderColor : "#5c647f",
        borderWidth: Number.isFinite(Number(raw.borderWidth)) ? Math.max(0, Math.min(8, Number(raw.borderWidth))) : 2,
        radius: Number.isFinite(Number(raw.radius)) ? Math.max(0, Math.min(28, Number(raw.radius))) : 14,
        parentId: raw.parentId ? String(raw.parentId) : null,
      });
    }

    const nodeIndex = buildNodeIndex(nodes);
    for (const node of nodes) {
      if (node.parentId && !nodeIndex.has(node.parentId)) {
        errors.push(`Node '${node.id}' references unknown parent '${node.parentId}'.`);
      }
      if (createsTreeCycle(nodes, node.id, node.parentId)) {
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
      edges.push({ id, source, target, type });
    }

    for (const node of nodes) {
      if (!node.parentId) continue;
      const hasTreeEdge = edges.some(
        (edge) => edge.type === "tree" && edge.source === node.parentId && edge.target === node.id,
      );
      if (!hasTreeEdge) {
        edges.push({ id: `tree-${node.parentId}-${node.id}`, source: node.parentId, target: node.id, type: "tree" });
      }
    }

    const numericIds = nodes
      .map((node) => Number(node.id))
      .filter((value) => Number.isInteger(value) && value > 0);

    const nextId = Number.isInteger(input.nextId) && input.nextId > 0
      ? input.nextId
      : (numericIds.length ? Math.max(...numericIds) : 0) + 1;

    return {
      ok: errors.length === 0,
      errors,
      data: { nodes, edges, nextId },
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
      maxX = Math.max(maxX, node.x + NODE_WIDTH);
      maxY = Math.max(maxY, node.y + NODE_HEIGHT);
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
    const nodes = next.nodes;
    if (nodes.length === 0) return next;

    const nodeIndex = buildNodeIndex(nodes);
    const roots = nodes.filter((node) => !node.parentId || !nodeIndex.has(node.parentId));
    const visited = new Set();
    const layers = [];

    function bfs(root) {
      const queue = [{ id: root.id, depth: 0 }];
      while (queue.length) {
        const current = queue.shift();
        if (!current || visited.has(current.id)) continue;
        visited.add(current.id);
        if (!layers[current.depth]) layers[current.depth] = [];
        layers[current.depth].push(current.id);

        for (const node of nodes) {
          if (node.parentId === current.id) {
            queue.push({ id: node.id, depth: current.depth + 1 });
          }
        }
      }
    }

    for (const root of roots) bfs(root);
    for (const node of nodes) {
      if (!visited.has(node.id)) bfs(node);
    }

    if (mode === "horizontal") {
      for (let depth = 0; depth < layers.length; depth += 1) {
        const ids = layers[depth] || [];
        for (let row = 0; row < ids.length; row += 1) {
          const node = nodeIndex.get(ids[row]);
          node.x = 120 + depth * 280;
          node.y = 100 + row * 110;
        }
      }
    } else if (mode === "vertical") {
      for (let depth = 0; depth < layers.length; depth += 1) {
        const ids = layers[depth] || [];
        for (let col = 0; col < ids.length; col += 1) {
          const node = nodeIndex.get(ids[col]);
          node.x = 120 + col * 260;
          node.y = 100 + depth * 120;
        }
      }
    } else if (mode === "radial") {
      const centerX = 700;
      const centerY = 480;
      for (let depth = 0; depth < layers.length; depth += 1) {
        const ids = layers[depth] || [];
        const radius = depth * 210;
        if (depth === 0) {
          const node = nodeIndex.get(ids[0]);
          if (node) {
            node.x = centerX - NODE_WIDTH / 2;
            node.y = centerY - NODE_HEIGHT / 2;
          }
          continue;
        }
        for (let i = 0; i < ids.length; i += 1) {
          const angle = (2 * Math.PI * i) / Math.max(1, ids.length);
          const node = nodeIndex.get(ids[i]);
          node.x = centerX + Math.cos(angle) * radius - NODE_WIDTH / 2;
          node.y = centerY + Math.sin(angle) * radius - NODE_HEIGHT / 2;
        }
      }
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
