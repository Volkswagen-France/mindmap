const assert = require("node:assert/strict");
const core = require("./core.js");

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

function run() {
  const tests = [
    testValidateAcceptsCleanGraph,
    testValidateRejectsDuplicateNodeIds,
    testValidateRejectsBrokenEdgeReferences,
    testCycleDetection,
    testSubtreeCollection,
    testLayoutProducesCoordinates,
    testHistoryUndoRedo,
  ];

  for (const test of tests) {
    test();
  }

  console.log(`OK: ${tests.length} tests passed`);
}

run();
