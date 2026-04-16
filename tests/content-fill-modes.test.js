const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function extractFunction(source, signature, nextSignature) {
  const start = source.indexOf(signature);
  const end = source.indexOf(nextSignature);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Failed to locate snippet: ${signature}`);
  }
  return source.slice(start, end);
}

function loadContentHelpers() {
  const source = fs.readFileSync(
    path.join(__dirname, "../content.js"),
    "utf8"
  );

  const snippet = `
    ${extractFunction(
      source,
      "function normalizeSelectionRect(startPoint, endPoint) {",
      "function scanFields({ scope = \"page\", selectionRect = null } = {}) {"
    )}
    ${extractFunction(
      source,
      "function rectsIntersect(leftRect, rightRect) {",
      "function pickLikelyFormRoot() {"
    )}
    ${extractFunction(
      source,
      "function hasExistingFieldValue(runtime) {",
      "async function fillOne(runtime, value) {"
    )}
    module.exports = {
      normalizeSelectionRect,
      rectsIntersect,
      hasExistingFieldValue,
    };
  `;

  const context = {
    module: { exports: {} },
    exports: {},
  };

  vm.createContext(context);
  vm.runInContext(snippet, context);
  return context.module.exports;
}

test("normalizeSelectionRect creates a stable viewport rectangle", () => {
  const helpers = loadContentHelpers();
  const rect = JSON.parse(
    JSON.stringify(
      helpers.normalizeSelectionRect({ x: 180, y: 140 }, { x: 20, y: 40 })
    )
  );

  assert.deepEqual(rect, {
    left: 20,
    top: 40,
    right: 180,
    bottom: 140,
    width: 160,
    height: 100,
  });
});

test("rectsIntersect treats overlapping rectangles as in-scope", () => {
  const helpers = loadContentHelpers();

  assert.equal(
    helpers.rectsIntersect(
      { left: 0, top: 0, right: 100, bottom: 100 },
      { left: 80, top: 80, right: 140, bottom: 140 }
    ),
    true
  );

  assert.equal(
    helpers.rectsIntersect(
      { left: 0, top: 0, right: 50, bottom: 50 },
      { left: 80, top: 80, right: 140, bottom: 140 }
    ),
    false
  );
});

test("hasExistingFieldValue detects filled controls for incremental mode", () => {
  const helpers = loadContentHelpers();

  assert.equal(helpers.hasExistingFieldValue({ kind: "text", el: { value: "Alice" } }), true);
  assert.equal(helpers.hasExistingFieldValue({ kind: "text", el: { value: "   " } }), false);
  assert.equal(
    helpers.hasExistingFieldValue({
      kind: "select",
      el: { value: "", selectedIndex: 0 },
    }),
    false
  );
  assert.equal(
    helpers.hasExistingFieldValue({
      kind: "select",
      el: { value: "", selectedIndex: 2 },
    }),
    true
  );
  assert.equal(
    helpers.hasExistingFieldValue({
      kind: "radio_group",
      options: [{ el: { checked: false } }, { el: { checked: true } }],
    }),
    true
  );
  assert.equal(
    helpers.hasExistingFieldValue({
      kind: "contenteditable",
      el: { textContent: "已有内容" },
    }),
    true
  );
});
