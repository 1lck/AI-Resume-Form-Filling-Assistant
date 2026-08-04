const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function extract(source, startSignature, endSignature) {
  const start = source.indexOf(startSignature);
  const end = source.indexOf(endSignature, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Failed to locate snippet: ${startSignature}`);
  }
  return source.slice(start, end);
}

function loadContentSecurityHelpers() {
  const contentSource = fs.readFileSync(
    path.join(__dirname, "../content.js"),
    "utf8"
  );
  const schemaSource = fs.readFileSync(
    path.join(__dirname, "../shared/resume-schema.js"),
    "utf8"
  );
  const snippet = `
    ${schemaSource}
    const schema = window.ResumeSchema;
    ${extract(contentSource, "function sanitizePageUrl(value) {", "function cssEscape(value) {")}
    ${extract(contentSource, "function normalizeMappings(rawMappings, fields) {", "function normalizeTransform(transform) {")}
    ${extract(contentSource, "function normalizeTransform(transform) {", "function deriveFillValue(rawValue, transform, runtime) {")}
    module.exports = { normalizeMappings, sanitizePageUrl };
  `;
  const context = { module: { exports: {} }, exports: {}, window: {}, URL };
  vm.createContext(context);
  vm.runInContext(snippet, context);
  return context.module.exports;
}

test("page URLs sent to the model exclude query and hash", () => {
  const helpers = loadContentSecurityHelpers();
  assert.equal(
    helpers.sanitizePageUrl("https://example.com/app?token=secret#section"),
    "https://example.com/app"
  );
});

test("mapping paths are restricted to the schema catalog", () => {
  const helpers = loadContentSecurityHelpers();
  const mappings = helpers.normalizeMappings(
    [
      { fieldId: "f_1", resumePath: "personal.email" },
      { fieldId: "f_2", resumePath: "../../apiKey" },
      { fieldId: "f_3", resumePath: "[object Object]" },
    ],
    [{ fieldId: "f_1" }, { fieldId: "f_2" }, { fieldId: "f_3" }]
  );

  assert.equal(mappings[0].resumePath, "personal.email");
  assert.equal(mappings[1].resumePath, "");
  assert.equal(mappings[2].resumePath, "");
});
