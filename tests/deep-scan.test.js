const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function extractFunction(source, signature, nextSignature) {
  const start = source.indexOf(signature);
  const end = source.indexOf(nextSignature, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Failed to locate snippet: ${signature}`);
  }
  return source.slice(start, end);
}

function loadDeepScanHelpers() {
  const source = fs.readFileSync(path.join(__dirname, "../content.js"), "utf8");
  const constants = source.slice(
    source.indexOf("  const DEEP_SCAN_MAX_ROUNDS ="),
    source.indexOf("\n\n  const fieldRuntimeMap")
  );
  const snippet = `
    ${constants}
    function isVisible() { return true; }
    ${extractFunction(source, "  function normalizeDeepScanText(value) {", "  function getDeepScanTargetElements(el) {")}
    ${extractFunction(source, "  function getDeepScanText(el) {", "  function getDeepScanTargetElements(el) {")}
    ${extractFunction(source, "  function getDeepScanTargetElements(el) {", "  function hasHiddenDeepScanTarget(el) {")}
    ${extractFunction(source, "  function hasHiddenDeepScanTarget(el) {", "  function isDeepScanExpandTrigger(el) {")}
    ${extractFunction(source, "  function isDeepScanExpandTrigger(el) {", "  function hasSectionContent(profile, sectionKey) {")}
    module.exports = { isDeepScanExpandTrigger };
  `;
  const context = { module: { exports: {} }, exports: {} };
  vm.createContext(context);
  vm.runInContext(snippet, context);
  return context.module.exports;
}

function mockElement({ text, attrs = {}, className = "", tagName = "BUTTON" }) {
  return {
    tagName,
    textContent: text,
    className,
    disabled: false,
    dataset: {},
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    ownerDocument: {
      getElementById() {
        return null;
      },
    },
  };
}

test("deep scan does not click add or new-item controls", () => {
  const helpers = loadDeepScanHelpers();

  assert.equal(
    helpers.isDeepScanExpandTrigger(mockElement({ text: "添加教育经历" })),
    false
  );
  assert.equal(
    helpers.isDeepScanExpandTrigger(mockElement({ text: "新增项目经历", className: "expand" })),
    false
  );
  assert.equal(
    helpers.isDeepScanExpandTrigger(mockElement({ text: "+", className: "plus-button" })),
    false
  );
});

test("deep scan accepts explicit collapsed expand controls", () => {
  const helpers = loadDeepScanHelpers();

  assert.equal(
    helpers.isDeepScanExpandTrigger(
      mockElement({ text: "展开教育经历", attrs: { "aria-expanded": "false" } })
    ),
    true
  );
  assert.equal(
    helpers.isDeepScanExpandTrigger(
      mockElement({ text: "查看更多", attrs: { "aria-expanded": "false" } })
    ),
    true
  );
  assert.equal(
    helpers.isDeepScanExpandTrigger(
      mockElement({ text: "展开菜单", attrs: { "aria-haspopup": "menu" } })
    ),
    false
  );
});

test("deep scan recognizes hidden targets referenced by data-target", () => {
  const helpers = loadDeepScanHelpers();
  const hiddenTarget = {
    hidden: true,
    getAttribute() {
      return null;
    },
  };
  const element = mockElement({
    text: "更多",
    attrs: { "data-target": "#details" },
  });
  element.ownerDocument.getElementById = (id) => (id === "details" ? hiddenTarget : null);

  assert.equal(helpers.isDeepScanExpandTrigger(element), true);
});
