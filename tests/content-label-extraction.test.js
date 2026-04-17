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

function loadLabelHelpers({ documentOverrides = {} } = {}) {
  const source = fs.readFileSync(
    path.join(__dirname, "../content.js"),
    "utf8"
  );
  const fieldText = require("../shared/field-text.js");

  const snippet = `
    ${extractFunction(
      source,
      "function cssEscape(value) {",
      "function hasExistingFieldValue(runtime) {"
    )}
    ${extractFunction(
      source,
      "function getOptionLabel(input) {",
      "function normalizeText(text) {"
    )}
    ${extractFunction(
      source,
      "function normalizeText(text) {",
      "function collectDirectFieldLabelCandidates(el) {"
    )}
    module.exports = {
      cssEscape,
      getOptionLabel,
      normalizeText,
    };
  `;

  const context = {
    module: { exports: {} },
    exports: {},
    document: {
      querySelector() {
        return null;
      },
      ...documentOverrides,
    },
    fieldText,
    window: {},
  };

  vm.createContext(context);
  vm.runInContext(snippet, context);
  return context.module.exports;
}

function createNode(textContent = "") {
  return {
    textContent,
    parentElement: null,
    children: [],
    closest() {
      return null;
    },
  };
}

test("getOptionLabel falls back to sibling text for checkbox-like controls", () => {
  const helpers = loadLabelHelpers();
  const input = createNode("");
  input.id = "";
  input.value = "on";
  input.closest = () => null;

  const textNode = createNode("至今");
  const container = createNode("");
  container.children = [input, textNode];
  input.parentElement = container;
  textNode.parentElement = container;

  assert.equal(helpers.getOptionLabel(input), "至今");
});
