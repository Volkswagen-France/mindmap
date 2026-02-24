(function initGroupRender(globalScope) {
  function renderGroupLayer(options) {
    const opts = options || {};
    const groupLayer = opts.groupLayer;
    if (!groupLayer) return false;
    const groupTitleLayer = opts.groupTitleLayer || null;
    const nodes = Array.isArray(opts.nodes) ? opts.nodes : [];
    const ensureGraphGroups = opts.ensureGraphGroups;
    const boundsForNodeIds = opts.boundsForNodeIds;
    const getGroupMeta = opts.getGroupMeta;
    if (
      typeof ensureGraphGroups !== "function"
      || typeof boundsForNodeIds !== "function"
      || typeof getGroupMeta !== "function"
    ) {
      return false;
    }
    const fragment = document.createDocumentFragment();
    const titleFragment = document.createDocumentFragment();
    ensureGraphGroups();
    const byGroup = new Map();
    for (const node of nodes) {
      if (!node || !node.groupId) continue;
      if (!byGroup.has(node.groupId)) byGroup.set(node.groupId, []);
      byGroup.get(node.groupId).push(node);
    }
    for (const [groupId, members] of byGroup.entries()) {
      if (!members.length) continue;
      const bounds = boundsForNodeIds(members.map((node) => node.id));
      if (!bounds) continue;
      const pad = 16;
      const box = document.createElement("div");
      box.className = "group-box";
      box.dataset.groupId = groupId;
      box.style.left = `${bounds.left - pad}px`;
      box.style.top = `${bounds.top - pad}px`;
      box.style.width = `${bounds.width + pad * 2}px`;
      box.style.height = `${bounds.height + pad * 2}px`;
      const meta = getGroupMeta(groupId);
      if (meta) {
        box.style.background = meta.color;
        if (groupTitleLayer) {
          const title = document.createElement("div");
          title.className = "group-box-title";
          title.dataset.groupId = groupId;
          title.style.left = `${bounds.left - pad + 10}px`;
          title.style.top = `${bounds.top - pad - 12}px`;
          const text = document.createElement("span");
          text.className = "group-box-title-text";
          text.textContent = meta.title || "Groupe";
          title.appendChild(text);
          const editBtn = document.createElement("button");
          editBtn.type = "button";
          editBtn.className = "group-edit-btn";
          editBtn.dataset.groupId = groupId;
          editBtn.setAttribute("aria-label", "Éditer le groupe");
          editBtn.innerHTML = "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M4 20h4l10-10-4-4L4 16v4z'/><path d='M13 7l4 4'/></svg>";
          title.appendChild(editBtn);
          titleFragment.appendChild(title);
        } else {
          const title = document.createElement("div");
          title.className = "group-box-title";
          title.dataset.groupId = groupId;
          const text = document.createElement("span");
          text.className = "group-box-title-text";
          text.textContent = meta.title || "Groupe";
          title.appendChild(text);
          const editBtn = document.createElement("button");
          editBtn.type = "button";
          editBtn.className = "group-edit-btn";
          editBtn.dataset.groupId = groupId;
          editBtn.setAttribute("aria-label", "Éditer le groupe");
          editBtn.innerHTML = "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M4 20h4l10-10-4-4L4 16v4z'/><path d='M13 7l4 4'/></svg>";
          title.appendChild(editBtn);
          box.appendChild(title);
        }
      }
      fragment.appendChild(box);
    }
    groupLayer.replaceChildren(fragment);
    if (groupTitleLayer) {
      groupTitleLayer.replaceChildren(titleFragment);
    }
    return true;
  }

  function renderSelectionRect(options) {
    const opts = options || {};
    const selectionRectEl = opts.selectionRectEl;
    if (!selectionRectEl) return false;
    const rect = opts.selectionRect;
    if (!rect || !rect.active) {
      selectionRectEl.hidden = true;
      return true;
    }
    if (typeof opts.rectFromPoints !== "function") return false;
    const visual = opts.rectFromPoints(rect.start, rect.current);
    selectionRectEl.hidden = false;
    selectionRectEl.style.left = `${visual.left}px`;
    selectionRectEl.style.top = `${visual.top}px`;
    selectionRectEl.style.width = `${visual.width}px`;
    selectionRectEl.style.height = `${visual.height}px`;
    return true;
  }

  function renderGroupQuickActions(options) {
    const opts = options || {};
    const els = opts.els || {};
    if (!els.groupQuickActions || !els.groupTitleInput || !els.groupColorInput) return false;
    const resolver = typeof opts.openGroupEditorId === "function"
      ? opts.openGroupEditorId
      : (typeof opts.selectedGroupId === "function" ? opts.selectedGroupId : null);
    if (!resolver) return false;
    const groupId = resolver();
    if (!groupId) {
      els.groupQuickActions.hidden = true;
      return true;
    }
    const nodes = Array.isArray(opts.nodes) ? opts.nodes : [];
    const members = nodes.filter((node) => node && node.groupId === groupId);
    if (!members.length) {
      els.groupQuickActions.hidden = true;
      return true;
    }
    if (typeof opts.getGroupMeta !== "function") return false;
    const meta = opts.getGroupMeta(groupId);
    if (meta) {
      if (document.activeElement !== els.groupTitleInput) {
        els.groupTitleInput.value = meta.title || "Groupe";
      }
      if (document.activeElement !== els.groupColorInput) {
        els.groupColorInput.value = meta.color || "#eef3ff";
      }
    }
    els.groupQuickActions.hidden = false;
    const anchor = typeof opts.quickActionsAnchorForMembers === "function"
      ? opts.quickActionsAnchorForMembers(members, opts.getNodeWidth)
      : null;
    const left = anchor ? anchor.left : 8;
    const top = anchor ? anchor.top : 8;
    els.groupQuickActions.style.left = `${left}px`;
    els.groupQuickActions.style.top = `${top}px`;
    const zoom = Number.isFinite(opts.viewportZoom) ? opts.viewportZoom : 1;
    const invZoom = 1 / Math.max(0.25, zoom || 1);
    els.groupQuickActions.style.transformOrigin = "top left";
    els.groupQuickActions.style.transform = `scale(${invZoom})`;
    return true;
  }

  globalScope.MindMapGroupRender = {
    renderGroupLayer,
    renderSelectionRect,
    renderGroupQuickActions,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
