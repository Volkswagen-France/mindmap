(function initGroupUtils(globalScope) {
  function rectFromPoints(a, b) {
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const right = Math.max(a.x, b.x);
    const bottom = Math.max(a.y, b.y);
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function nodeInRect(node, rect, getNodeWidth, getNodeHeight) {
    if (!node || !rect) return false;
    const width = getNodeWidth(node);
    const height = getNodeHeight(node);
    const cx = node.x + width / 2;
    const cy = node.y + height / 2;
    return cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
  }

  function boundsForNodeIds(ids, getNodeById, getNodeWidth, getNodeHeight) {
    if (!Array.isArray(ids) || !ids.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of ids) {
      const node = getNodeById(id);
      if (!node) continue;
      const width = getNodeWidth(node);
      const height = getNodeHeight(node);
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + width);
      maxY = Math.max(maxY, node.y + height);
    }
    if (!Number.isFinite(minX)) return null;
    return { left: minX, top: minY, right: maxX, bottom: maxY, width: maxX - minX, height: maxY - minY };
  }

  function uniqueGroupIds(nodes) {
    const list = Array.isArray(nodes) ? nodes : [];
    return Array.from(new Set(
      list
        .map((node) => (node && typeof node.groupId === "string" ? node.groupId : ""))
        .filter((value) => value.length > 0),
    ));
  }

  function groupBounds(groupId, nodes, getNodeById, getNodeWidth, getNodeHeight, pad) {
    if (!groupId) return null;
    const members = (Array.isArray(nodes) ? nodes : [])
      .filter((node) => node && node.groupId === groupId)
      .map((node) => node.id);
    if (!members.length) return null;
    const spacing = Number.isFinite(pad) ? pad : 16;
    const bounds = boundsForNodeIds(members, getNodeById, getNodeWidth, getNodeHeight);
    if (!bounds) return null;
    return {
      left: bounds.left - spacing,
      top: bounds.top - spacing,
      right: bounds.right + spacing,
      bottom: bounds.bottom + spacing,
      width: bounds.width + spacing * 2,
      height: bounds.height + spacing * 2,
    };
  }

  function groupTitleBox(box, title) {
    const safeTitle = String(title || "Groupe");
    const visualWidth = Math.max(68, Math.min(280, 18 + safeTitle.length * 6.8));
    const titleWidth = Math.max(140, visualWidth + 22);
    const titleHeight = 32;
    return {
      left: box.left + 6,
      top: box.top - 16,
      width: titleWidth,
      height: titleHeight,
      title: safeTitle,
    };
  }

  function findGroupTitleAtPoint(worldPoint, nodes, getGroupMeta, getNodeById, getNodeWidth, getNodeHeight) {
    if (!worldPoint) return "";
    const groupIds = uniqueGroupIds(nodes);
    for (const groupId of groupIds) {
      const box = groupBounds(groupId, nodes, getNodeById, getNodeWidth, getNodeHeight, 16);
      if (!box) continue;
      const meta = getGroupMeta(groupId);
      const title = groupTitleBox(box, meta && meta.title ? meta.title : "Groupe");
      const inside = (
        worldPoint.x >= title.left
        && worldPoint.x <= title.left + title.width
        && worldPoint.y >= title.top
        && worldPoint.y <= title.top + title.height
      );
      if (inside) return groupId;
    }
    return "";
  }

  function findGroupZoneAtPoint(worldPoint, nodes, getNodeById, getNodeWidth, getNodeHeight) {
    if (!worldPoint) return "";
    const groupIds = uniqueGroupIds(nodes);
    let bestGroupId = "";
    let bestArea = Number.POSITIVE_INFINITY;
    for (const groupId of groupIds) {
      const box = groupBounds(groupId, nodes, getNodeById, getNodeWidth, getNodeHeight, 16);
      if (!box) continue;
      const inside = (
        worldPoint.x >= box.left
        && worldPoint.x <= box.right
        && worldPoint.y >= box.top
        && worldPoint.y <= box.bottom
      );
      if (!inside) continue;
      const area = box.width * box.height;
      if (area < bestArea) {
        bestArea = area;
        bestGroupId = groupId;
      }
    }
    return bestGroupId;
  }

  function quickActionsAnchorForMembers(members, getNodeWidth) {
    const list = Array.isArray(members) ? members : [];
    if (!list.length) return null;
    let minY = Infinity;
    let minX = Infinity;
    for (const node of list) {
      if (!node) continue;
      minY = Math.min(minY, node.y);
      minX = Math.min(minX, node.x);
    }
    if (!Number.isFinite(minY) || !Number.isFinite(minX)) return null;
    return {
      left: Math.max(8, minX + 174),
      top: Math.max(8, minY - 18),
    };
  }

  globalScope.MindMapGroupUtils = {
    rectFromPoints,
    nodeInRect,
    boundsForNodeIds,
    groupBounds,
    findGroupTitleAtPoint,
    findGroupZoneAtPoint,
    quickActionsAnchorForMembers,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
