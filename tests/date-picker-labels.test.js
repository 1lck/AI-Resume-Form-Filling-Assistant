const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadDatePickerLabelHelpers() {
  const source = fs
    .readFileSync(path.join(__dirname, "../content.js"), "utf8")
    .replace(/\r\n/g, "\n");

  const start = source.indexOf("  const MONTH_NAMES_EN_SHORT = [");
  const end = source.indexOf("  function setNativeValue(element, value) {");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Failed to locate date picker label helpers in content.js");
  }

  const snippet = `
    ${source.slice(start, end)}
    module.exports = {
      buildMonthLabelCandidates,
      buildDayLabelCandidates,
      buildYearLabelCandidates,
    };
  `;

  const context = { module: { exports: {} }, exports: {} };
  vm.createContext(context);
  vm.runInContext(snippet, context);
  const exported = context.module.exports;
  return {
    buildMonthLabelCandidates: (month) => JSON.parse(JSON.stringify(exported.buildMonthLabelCandidates(month))),
    buildDayLabelCandidates: (day) => JSON.parse(JSON.stringify(exported.buildDayLabelCandidates(day))),
    buildYearLabelCandidates: (year) => JSON.parse(JSON.stringify(exported.buildYearLabelCandidates(year))),
  };
}

test("buildMonthLabelCandidates covers Chinese, padded and English month formats", () => {
  const helpers = loadDatePickerLabelHelpers();

  assert.deepEqual(helpers.buildMonthLabelCandidates(3), [
    "3月",
    "03月",
    "3 月",
    "03 月",
    "3",
    "03",
    "mar",
    "march",
  ]);
  assert.deepEqual(helpers.buildMonthLabelCandidates(12), [
    "12月",
    "12 月",
    "12",
    "dec",
    "december",
  ]);
  assert.deepEqual(helpers.buildMonthLabelCandidates(0), []);
});

test("buildDayLabelCandidates covers bare and zero-padded day numbers", () => {
  const helpers = loadDatePickerLabelHelpers();

  assert.deepEqual(helpers.buildDayLabelCandidates(4), ["4", "04"]);
  assert.deepEqual(helpers.buildDayLabelCandidates(23), ["23"]);
  assert.deepEqual(helpers.buildDayLabelCandidates(0), []);
});

test("buildYearLabelCandidates covers the Chinese-suffixed and bare year formats", () => {
  const helpers = loadDatePickerLabelHelpers();

  assert.deepEqual(helpers.buildYearLabelCandidates(2026), ["2026年", "2026"]);
  assert.deepEqual(helpers.buildYearLabelCandidates(0), []);
});
