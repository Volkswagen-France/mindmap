const assert = require("node:assert/strict");
const core = require("./core.js");
require("./group-utils.js");
require("./group-state.js");
require("./group-actions.js");
require("./group-interactions.js");

const groupUtils = globalThis.MindMapGroupUtils;
const groupStateUtils = globalThis.MindMapGroupStateUtils;
const groupActionsUtils = globalThis.MindMapGroupActionsUtils;
const groupInteractions = globalThis.MindMapGroupInteractions;

function testValidateAcceptsCleanGraph() {
  const result = core.validateAndNormalizeData({
    nodes: [
      { id: "1", x: 100, y: 100, title: "Root", color: "#ffffff", parentId: null },
      { id: "2", x: 300, y: 180, title: "Child", color: "#ffd166", parentId: "1" },
    ],
    edges: [{ id: "tree-1-2", source: "1", target: "2", type: "tree" }],
    nextId: 3,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.nodes.length, 2);
  assert.equal(result.data.edges.length, 1);
}

function testValidateRejectsDuplicateNodeIds() {
  const result = core.validateAndNormalizeData({
    nodes: [
      { id: "1", x: 0, y: 0 },
      { id: "1", x: 10, y: 10 },
    ],
    edges: [],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((msg) => msg.includes("Duplicate node id")));
}

function testValidateRejectsBrokenEdgeReferences() {
  const result = core.validateAndNormalizeData({
    nodes: [{ id: "1", x: 0, y: 0 }],
    edges: [{ source: "1", target: "999", type: "free" }],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((msg) => msg.includes("references unknown node")));
}

function testEdgeDefaultStylesByType() {
  const result = core.validateAndNormalizeData({
    nodes: [
      { id: "1", x: 0, y: 0, parentId: null },
      { id: "2", x: 10, y: 10, parentId: "1" },
      { id: "3", x: 30, y: 10, parentId: null },
    ],
    edges: [
      { id: "free-1-3", source: "1", target: "3", type: "free" },
    ],
    nextId: 4,
  });
  assert.equal(result.ok, true);
  const tree = result.data.edges.find((edge) => edge.type === "tree" && edge.source === "1" && edge.target === "2");
  const free = result.data.edges.find((edge) => edge.type === "free");
  assert.ok(tree);
  assert.ok(free);
  assert.equal(tree.style, "solid");
  assert.equal(free.style, "dotted");
}

function testCycleDetection() {
  const nodes = [
    { id: "1", parentId: "3" },
    { id: "2", parentId: "1" },
    { id: "3", parentId: "2" },
  ];

  assert.equal(core.createsTreeCycle(nodes, "1", "3"), true);
}

function testSubtreeCollection() {
  const ids = core.collectSubtreeIds(
    [
      { id: "1", parentId: null },
      { id: "2", parentId: "1" },
      { id: "3", parentId: "1" },
      { id: "4", parentId: "2" },
      { id: "5", parentId: null },
    ],
    "1",
  );

  assert.equal(ids.has("1"), true);
  assert.equal(ids.has("4"), true);
  assert.equal(ids.has("5"), false);
}

function testLayoutProducesCoordinates() {
  const graph = {
    nodes: [
      { id: "1", x: 0, y: 0, parentId: null, title: "A", color: "#ffffff" },
      { id: "2", x: 0, y: 0, parentId: "1", title: "B", color: "#ffffff" },
      { id: "3", x: 0, y: 0, parentId: "1", title: "C", color: "#ffffff" },
    ],
    edges: [
      { id: "tree-1-2", source: "1", target: "2", type: "tree" },
      { id: "tree-1-3", source: "1", target: "3", type: "tree" },
    ],
    nextId: 4,
  };

  const horizontal = core.layoutGraph(graph, "horizontal");
  const radial = core.layoutGraph(graph, "radial");

  for (const node of horizontal.nodes) {
    assert.equal(Number.isFinite(node.x), true);
    assert.equal(Number.isFinite(node.y), true);
  }
  for (const node of radial.nodes) {
    assert.equal(Number.isFinite(node.x), true);
    assert.equal(Number.isFinite(node.y), true);
  }
}

function testHistoryUndoRedo() {
  const history = core.createHistory(10);
  const g1 = { nodes: [{ id: "1", x: 0, y: 0 }], edges: [], nextId: 2 };
  const g2 = { nodes: [{ id: "1", x: 10, y: 0 }], edges: [], nextId: 2 };
  const g3 = { nodes: [{ id: "1", x: 20, y: 0 }], edges: [], nextId: 2 };

  history.push(g1);
  history.push(g2);

  const undo1 = history.undo(g3);
  assert.equal(undo1.nodes[0].x, 10);

  const undo2 = history.undo(undo1);
  assert.equal(undo2.nodes[0].x, 0);

  const redo1 = history.redo(undo2);
  assert.equal(redo1.nodes[0].x, 10);
}

function testGroupUtilsRectAndBounds() {
  assert.ok(groupUtils);
  const rect = groupUtils.rectFromPoints({ x: 50, y: 20 }, { x: 10, y: 80 });
  assert.deepEqual(rect, { left: 10, top: 20, right: 50, bottom: 80, width: 40, height: 60 });

  const nodes = [
    { id: "n1", x: 100, y: 120, groupId: "g1" },
    { id: "n2", x: 260, y: 220, groupId: "g1" },
  ];
  const getNode = (id) => nodes.find((n) => n.id === id) || null;
  const getNodeWidth = () => 100;
  const getNodeHeight = () => 40;
  const bounds = groupUtils.boundsForNodeIds(["n1", "n2"], getNode, getNodeWidth, getNodeHeight);
  assert.deepEqual(bounds, { left: 100, top: 120, right: 360, bottom: 260, width: 260, height: 140 });
}

function testGroupUtilsHitTesting() {
  const nodes = [
    { id: "n1", x: 100, y: 100, groupId: "g1" },
    { id: "n2", x: 260, y: 100, groupId: "g1" },
    { id: "n3", x: 650, y: 100, groupId: "g2" },
  ];
  const getNode = (id) => nodes.find((n) => n.id === id) || null;
  const getNodeWidth = () => 120;
  const getNodeHeight = () => 52;
  const getGroupMeta = (groupId) => ({ id: groupId, title: groupId === "g1" ? "Alpha" : "Beta" });

  const g1Zone = groupUtils.findGroupZoneAtPoint({ x: 150, y: 140 }, nodes, getNode, getNodeWidth, getNodeHeight);
  assert.equal(g1Zone, "g1");
  const g2Zone = groupUtils.findGroupZoneAtPoint({ x: 700, y: 140 }, nodes, getNode, getNodeWidth, getNodeHeight);
  assert.equal(g2Zone, "g2");

  const g1Title = groupUtils.findGroupTitleAtPoint({ x: 120, y: 92 }, nodes, getGroupMeta, getNode, getNodeWidth, getNodeHeight);
  assert.equal(g1Title, "g1");
}

function testGroupInteractionsSelectionRect() {
  assert.ok(groupInteractions);
  const nodes = [
    { id: "a", x: 100, y: 100 },
    { id: "b", x: 320, y: 100 },
  ];
  const nodeInRect = (node, rect) => node.x >= rect.left && node.x <= rect.right && node.y >= rect.top && node.y <= rect.bottom;
  const rectFromPoints = (a, b) => ({
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  });

  const start = groupInteractions.startSelectionRect({ x: 80, y: 80 });
  const updated = groupInteractions.updateSelectionRect(start, { x: 200, y: 160 }, nodes, nodeInRect, rectFromPoints);
  assert.deepEqual(updated.ids, ["a"]);

  const done = groupInteractions.finishSelectionRect(updated.rect, nodes, nodeInRect, rectFromPoints);
  assert.deepEqual(done, ["a"]);
}

function testGroupInteractionsStartGroupDrag() {
  const nodes = [
    { id: "a", x: 100, y: 120 },
    { id: "b", x: 210, y: 260 },
  ];
  const getNode = (id) => nodes.find((n) => n.id === id) || null;
  const toWorld = (x, y) => ({ x: x / 2, y: y / 2 });
  const drag = groupInteractions.startGroupDrag({
    groupId: "g1",
    ids: ["a", "b"],
    clientX: 300,
    clientY: 180,
    toWorld,
    getNode,
  });
  assert.equal(drag.draggingGroupId, "g1");
  assert.equal(drag.draggingNodeId, "a");
  assert.deepEqual(drag.draggingNodeIds, ["a", "b"]);
  assert.deepEqual(drag.dragStartWorld, { x: 150, y: 90 });
  assert.deepEqual(drag.dragNodeStartPositions.get("b"), { x: 210, y: 260 });
}

function testGroupStateResolveSelectedGroupId() {
  assert.ok(groupStateUtils);
  const nodes = [
    { id: "1", groupId: "g1" },
    { id: "2", groupId: "g1" },
    { id: "3", groupId: "" },
  ];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const getNode = (id) => byId.get(id) || null;
  const hasGroupNodes = (groupId) => nodes.some((n) => n.groupId === groupId);

  const active = groupStateUtils.resolveSelectedGroupId("g1", ["1", "2"], getNode, hasGroupNodes);
  assert.equal(active, "g1");
  const fallback = groupStateUtils.resolveSelectedGroupId("", ["1", "2"], getNode, hasGroupNodes);
  assert.equal(fallback, "g1");
  const none = groupStateUtils.resolveSelectedGroupId("", ["1", "3"], getNode, hasGroupNodes);
  assert.equal(none, "");
}

function testGroupStateResolveActiveModes() {
  const prefs = new Map([["g1", { layout: "vertical", edgeShape: "courbe" }]]);
  const outGrouped = groupStateUtils.resolveActiveModes({
    activeGroupId: "g1",
    preferredLayout: "horizontal",
    defaultEdgeShape: "arrondi",
    getGroupUiPrefs: (gid) => prefs.get(gid) || null,
    normalizeLayoutMode: (v) => (v === "vertical" || v === "radial" ? v : "horizontal"),
    normalizeEdgeShape: (v) => (v === "arrondi" || v === "courbe" ? v : "geometrique"),
    dominantEdgeShapeForGroup: () => "geometrique",
  });
  assert.deepEqual(outGrouped, { layout: "vertical", edgeShape: "courbe" });

  const outGlobal = groupStateUtils.resolveActiveModes({
    activeGroupId: "",
    preferredLayout: "horizontal",
    defaultEdgeShape: "arrondi",
    getGroupUiPrefs: () => null,
    normalizeLayoutMode: (v) => (v === "vertical" || v === "radial" ? v : "horizontal"),
    normalizeEdgeShape: (v) => (v === "arrondi" || v === "courbe" ? v : "geometrique"),
    dominantEdgeShapeForGroup: () => "geometrique",
  });
  assert.deepEqual(outGlobal, { layout: "horizontal", edgeShape: "arrondi" });
}

function testGroupActionsShapeScoping() {
  assert.ok(groupActionsUtils);
  const edges = [
    { source: "1", target: "2", shape: "arrondi" },
    { source: "7", target: "8", shape: "arrondi" },
  ];
  groupActionsUtils.applyShapeToEdges(edges, "courbe", ["1", "2"]);
  assert.equal(edges[0].shape, "courbe");
  assert.equal(edges[1].shape, "arrondi");

  groupActionsUtils.applyShapeToEdges(edges, "geometrique");
  assert.equal(edges[0].shape, "geometrique");
  assert.equal(edges[1].shape, "geometrique");
}

function testGroupActionsScopedLayoutNodeIds() {
  const nodes = [
    { id: "1", groupId: "g1" },
    { id: "2", groupId: "g1" },
    { id: "3", groupId: "" },
  ];
  const collectSubtreeIds = (_nodes, parentId) => new Set([parentId, "3"]);
  const grouped = groupActionsUtils.scopedLayoutNodeIds(nodes, "g1", "1", collectSubtreeIds);
  assert.deepEqual(grouped, ["1", "2"]);
  const subtree = groupActionsUtils.scopedLayoutNodeIds(nodes, "", "1", collectSubtreeIds);
  assert.deepEqual(subtree, ["1", "3"]);
}

function run() {
  const tests = [
    testValidateAcceptsCleanGraph,
    testValidateRejectsDuplicateNodeIds,
    testValidateRejectsBrokenEdgeReferences,
    testEdgeDefaultStylesByType,
    testCycleDetection,
    testSubtreeCollection,
    testLayoutProducesCoordinates,
    testHistoryUndoRedo,
    testGroupUtilsRectAndBounds,
    testGroupUtilsHitTesting,
    testGroupInteractionsSelectionRect,
    testGroupInteractionsStartGroupDrag,
    testGroupStateResolveSelectedGroupId,
    testGroupStateResolveActiveModes,
    testGroupActionsShapeScoping,
    testGroupActionsScopedLayoutNodeIds,
  ];

  for (const test of tests) {
    test();
  }

  console.log(`OK: ${tests.length} tests passed`);
}

run();
