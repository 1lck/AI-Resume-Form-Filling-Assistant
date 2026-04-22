const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function extractBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Failed to locate snippet: ${startMarker}`);
  }
  return source.slice(start, end);
}

function loadHelpers() {
  const source = fs.readFileSync(
    path.join(__dirname, "../content.js"),
    "utf8"
  );

  const snippet = `
    ${extractBetween(
      source,
      "  function buildTextFallbackValues(runtime, desired) {",
      "  function scrollIntoView(el) {"
    )}
    ${extractBetween(
      source,
      "  function pickBestOption(options, desired) {",
      "  function matchesAnyCandidate(optionText, candidates) {"
    )}
    ${extractBetween(
      source,
      "  function getMatchScore(optionText, candidateText) {",
      "  function sleep(ms) {"
    )}
    ${extractBetween(source, "  const MATCH_ALIAS_GROUPS = [", "  console.log(EXT_TAG,")}
    module.exports = {
      buildTextFallbackValues,
      pickBestOption,
    };
  `;

  const context = {
    module: { exports: {} },
    exports: {},
  };
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(snippet, context);
  return context.module.exports;
}

test("pickBestOption prefers full-time study mode over fuzzy sibling options", () => {
  const helpers = loadHelpers();
  const option = helpers.pickBestOption(
    [
      { label: "统招专升本", value: "upgrade" },
      { label: "全国普通高等院校全日制", value: "fulltime" },
      { label: "全国普通高等院校非全日制", value: "parttime" },
    ],
    "统招"
  );

  assert.equal(option?.value, "fulltime");
});

test("buildTextFallbackValues converts month salary ranges to numeric fallback", () => {
  const helpers = loadHelpers();
  const fallbacks = helpers.buildTextFallbackValues(
    {
      label: "期望月薪",
      context: "请输入期望月薪（元）",
    },
    "10K-15K/月"
  );

  assert.deepEqual(JSON.parse(JSON.stringify(fallbacks)), ["10000"]);
});
