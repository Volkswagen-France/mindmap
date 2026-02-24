(function initPersistUtils(globalScope) {
  function projectStorageKey(baseKey, projectId) {
    return `${String(baseKey || "mindmap-data")}:${String(projectId || "default")}`;
  }

  function persistDebugEnabled() {
    try {
      if (globalScope && globalScope.location && /[?&]debug_persist=1\b/.test(globalScope.location.search)) return true;
      if (globalScope.localStorage && globalScope.localStorage.getItem("mindmap-debug-persist") === "1") return true;
    } catch {
    }
    return false;
  }

  function countGroupedNodesInZones(zones) {
    const list = Array.isArray(zones) ? zones : [];
    return list.reduce((acc, zone) => {
      const nodes = zone && zone.graph && Array.isArray(zone.graph.nodes) ? zone.graph.nodes : [];
      return acc + nodes.filter((node) => node && typeof node.groupId === "string" && node.groupId.length > 0).length;
    }, 0);
  }

  function countGroupedNodesInGraph(graph) {
    const nodes = graph && Array.isArray(graph.nodes) ? graph.nodes : [];
    return nodes.filter((node) => node && typeof node.groupId === "string" && node.groupId.length > 0).length;
  }

  function persistLog(stage, payload) {
    if (!persistDebugEnabled()) return;
    try {
      const now = new Date().toISOString();
      console.info(`[persist][${now}][${stage}]`, payload || {});
    } catch {
    }
  }

  globalScope.MindMapPersistUtils = {
    projectStorageKey,
    persistDebugEnabled,
    countGroupedNodesInZones,
    countGroupedNodesInGraph,
    persistLog,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
