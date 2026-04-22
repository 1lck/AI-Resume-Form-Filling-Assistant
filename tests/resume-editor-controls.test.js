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

function createDocumentStub() {
  return {
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        className: "",
        type: "",
        value: "",
        placeholder: "",
        dataset: {},
        children: [],
        appendChild(child) {
          this.children.push(child);
        },
        addEventListener() {},
      };
    },
  };
}

function loadCreateFieldControl(fileName) {
  const source = fs.readFileSync(
    path.join(__dirname, `../${fileName}`),
    "utf8"
  );

  const snippet = `
    const document = globalThis.__document;
    function markResumeDirty() {}
    ${extractFunction(
      source,
      "function createFieldControl(field, value, path) {",
      "function markResumeDirty() {"
    )}
    module.exports = { createFieldControl };
  `;

  const context = {
    module: { exports: {} },
    exports: {},
    __document: createDocumentStub(),
  };
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(snippet, context);
  return context.module.exports.createFieldControl;
}

for (const fileName of ["popup.js", "resume-editor.js"]) {
  test(`${fileName} preserves flexible date values in text inputs`, () => {
    const createFieldControl = loadCreateFieldControl(fileName);
    const control = createFieldControl(
      { input: "date", placeholder: "" },
      "2025-06",
      "personal.birthDate"
    );

    assert.equal(control.type, "text");
    assert.equal(control.value, "2025-06");
    assert.equal(control.placeholder, "YYYY-MM 或 YYYY-MM-DD");
  });
}
