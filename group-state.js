(function initGroupStateUtils(globalScope) {
  function sanitizeSelectedNodeIds(nodes, selectedNodeIds, selectedNodeId) {
    const list = Array.isArray(nodes) ? nodes : [];
    const alive = new Set(list.map((node) => node.id));
    const next = [];
    for (const rawId of selectedNodeIds || []) {
      const id = String(rawId || "");
      if (!id || !alive.has(id) || next.includes(id)) continue;
      next.push(id);
    }
    if (!next.length && selectedNodeId && alive.has(selectedNodeId)) {
      next.push(selectedNodeId);
    }
    return next;
  }

  function resolveSelectedGroupId(activeGroupId, selectedIds, getNode, hasGroupNodes) {
    const ids = Array.isArray(selectedIds) ? selectedIds : [];
    if (activeGroupId && typeof hasGroupNodes === "function" && hasGroupNodes(activeGroupId)) {
      return activeGroupId;
    }
    if (ids.length < 2 || typeof getNode !== "function") return "";
    const first = getNode(ids[0]);
    if (!first || !first.groupId) return "";
    const groupId = first.groupId;
    for (const id of ids) {
      const node = getNode(id);
      if (!node || node.groupId !== groupId) return "";
    }
    return groupId;
  }

  function ensureGroupUiPrefs(groupUiPrefs, groupId, preferredLayout, normalizeLayoutMode, dominantEdgeShapeForGroup) {
    if (!groupId) return null;
    const prefsMap = groupUiPrefs instanceof Map ? groupUiPrefs : new Map();
    if (!prefsMap.has(groupId)) {
      prefsMap.set(groupId, {
        layout: normalizeLayoutMode(preferredLayout || "horizontal"),
        edgeShape: dominantEdgeShapeForGroup(groupId),
      });
    }
    return prefsMap.get(groupId);
  }

  function resolveActiveModes(args) {
    const input = args || {};
    const activeGroupId = String(input.activeGroupId || "");
    const normalizeLayoutMode = input.normalizeLayoutMode;
    const normalizeEdgeShape = input.normalizeEdgeShape;
    const getGroupUiPrefs = input.getGroupUiPrefs;
    const dominantEdgeShapeForGroup = input.dominantEdgeShapeForGroup;

    if (!activeGroupId) {
      return {
        layout: normalizeLayoutMode(input.preferredLayout || "horizontal"),
        edgeShape: normalizeEdgeShape(input.defaultEdgeShape),
      };
    }
    const prefs = typeof getGroupUiPrefs === "function" ? getGroupUiPrefs(activeGroupId) : null;
    return {
      layout: prefs && prefs.layout
        ? normalizeLayoutMode(prefs.layout)
        : normalizeLayoutMode(input.preferredLayout || "horizontal"),
      edgeShape: prefs && prefs.edgeShape
        ? normalizeEdgeShape(prefs.edgeShape)
        : dominantEdgeShapeForGroup(activeGroupId),
    };
  }

  globalScope.MindMapGroupStateUtils = {
    sanitizeSelectedNodeIds,
    resolveSelectedGroupId,
    ensureGroupUiPrefs,
    resolveActiveModes,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
