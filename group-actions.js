(function initGroupActionsUtils(globalScope) {
  const TRAIT_PRESETS = {
    net: { color: "#2f98ff", style: "solid", shape: "geometrique" },
    signal: { color: "#e15d44", style: "dashed", shape: "arrondi" },
    flux: { color: "#6f63ff", style: "solid", shape: "courbe" },
    organique: { color: "#18b982", style: "dotted", shape: "courbe" },
    discret: { color: "#6d86b8", style: "solid", shape: "geometrique" },
  };

  function traitPresetConfig(preset) {
    return TRAIT_PRESETS[preset] || TRAIT_PRESETS.signal;
  }

  function layoutLabel(mode) {
    if (mode === "horizontal") return "horizontale";
    if (mode === "vertical") return "verticale";
    return "radiale";
  }

  function groupNodeIds(nodes, groupId) {
    if (!groupId || !Array.isArray(nodes)) return [];
    return nodes.filter((node) => node && node.groupId === groupId).map((node) => node.id);
  }

  function hasImpactedEdges(edges, nodeIds) {
    const ids = new Set(Array.isArray(nodeIds) ? nodeIds : []);
    if (!ids.size) return false;
    return (Array.isArray(edges) ? edges : []).some((edge) => ids.has(edge.source) || ids.has(edge.target));
  }

  function applyShapeToEdges(edges, shape, nodeIds) {
    const list = Array.isArray(edges) ? edges : [];
    if (!Array.isArray(nodeIds) || !nodeIds.length) {
      for (const edge of list) edge.shape = shape;
      return;
    }
    const ids = new Set(nodeIds);
    for (const edge of list) {
      if (ids.has(edge.source) || ids.has(edge.target)) edge.shape = shape;
    }
  }

  function scopedLayoutNodeIds(nodes, scopedGroupId, parentId, collectSubtreeIds) {
    if (scopedGroupId) return groupNodeIds(nodes, scopedGroupId);
    if (!parentId || typeof collectSubtreeIds !== "function") return [];
    return Array.from(collectSubtreeIds(nodes, parentId));
  }

  globalScope.MindMapGroupActionsUtils = {
    traitPresetConfig,
    layoutLabel,
    groupNodeIds,
    hasImpactedEdges,
    applyShapeToEdges,
    scopedLayoutNodeIds,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
