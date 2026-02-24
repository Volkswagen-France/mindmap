(function initGroupInteractions(globalScope) {
  function makeNodeStartPositions(ids, getNode) {
    const list = Array.isArray(ids) ? ids : [];
    return new Map(
      list.map((id) => {
        const node = getNode(id);
        return [id, { x: node ? node.x : 0, y: node ? node.y : 0 }];
      }),
    );
  }

  function startGroupDrag(options) {
    const opts = options || {};
    const ids = Array.isArray(opts.ids) ? opts.ids.filter(Boolean) : [];
    if (!ids.length) return null;
    const world = opts.toWorld(opts.clientX, opts.clientY);
    return {
      draggingGroupId: String(opts.groupId || ""),
      draggingNodeId: ids[0],
      draggingNodeIds: ids.slice(),
      dragActivated: false,
      dragStartClient: { x: opts.clientX, y: opts.clientY },
      dragStartWorld: { x: world.x, y: world.y },
      dragNodeStartPositions: makeNodeStartPositions(ids, opts.getNode),
    };
  }

  function startSelectionRect(world) {
    if (!world) return null;
    return { active: true, start: { x: world.x, y: world.y }, current: { x: world.x, y: world.y } };
  }

  function selectedNodeIdsInRect(rect, nodes, nodeInRect) {
    if (!rect || !Array.isArray(nodes)) return [];
    return nodes.filter((node) => nodeInRect(node, rect)).map((node) => node.id);
  }

  function updateSelectionRect(selectionRect, world, nodes, nodeInRect, rectFromPoints) {
    if (!selectionRect || !selectionRect.active) return { ids: [], rect: null };
    const next = { ...selectionRect, current: { x: world.x, y: world.y } };
    const rect = rectFromPoints(next.start, next.current);
    return { ids: selectedNodeIdsInRect(rect, nodes, nodeInRect), rect: next };
  }

  function finishSelectionRect(selectionRect, nodes, nodeInRect, rectFromPoints) {
    if (!selectionRect || !selectionRect.active) return [];
    const rect = rectFromPoints(selectionRect.start, selectionRect.current);
    return selectedNodeIdsInRect(rect, nodes, nodeInRect);
  }

  function bindGroupQuickActions(options) {
    const opts = options || {};
    const els = opts.els || {};
    if (!els.groupUngroupBtn || !els.groupTitleInput || !els.groupColorInput) return;
    const resolveGroupId = () => {
      if (typeof opts.getEditedGroupId === "function") {
        return String(opts.getEditedGroupId() || "");
      }
      return String(opts.selectedGroupId() || "");
    };

    els.groupUngroupBtn.addEventListener("click", () => {
      const groupId = resolveGroupId();
      if (!groupId) return;
      opts.ungroupByGroupId(groupId);
    });

    els.groupTitleInput.addEventListener("input", (event) => {
      const groupId = resolveGroupId();
      if (!groupId) return;
      const next = String(event.target.value || "").slice(0, 80);
      const meta = opts.getGroupMeta(groupId);
      if (!meta) return;
      meta.title = next;
      opts.requestRender();
    });

    els.groupTitleInput.addEventListener("change", (event) => {
      const groupId = resolveGroupId();
      if (!groupId) return;
      const next = String(event.target.value || "").trim().slice(0, 80) || "Groupe";
      opts.commit(() => {
        const meta = opts.getGroupMeta(groupId);
        if (!meta) return;
        meta.title = next;
      }, "Titre du groupe mis à jour");
    });

    els.groupColorInput.addEventListener("input", (event) => {
      const groupId = resolveGroupId();
      if (!groupId) return;
      const next = opts.normalizeHexColor(event.target.value) || "#eef3ff";
      const meta = opts.getGroupMeta(groupId);
      if (!meta) return;
      meta.color = next;
      opts.requestRender();
    });

    els.groupColorInput.addEventListener("change", (event) => {
      const groupId = resolveGroupId();
      if (!groupId) return;
      const next = opts.normalizeHexColor(event.target.value) || "#eef3ff";
      opts.commit(() => {
        const meta = opts.getGroupMeta(groupId);
        if (!meta) return;
        meta.color = next;
      }, "Fond du groupe mis à jour");
    });
  }

  globalScope.MindMapGroupInteractions = {
    makeNodeStartPositions,
    startGroupDrag,
    startSelectionRect,
    updateSelectionRect,
    finishSelectionRect,
    bindGroupQuickActions,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
