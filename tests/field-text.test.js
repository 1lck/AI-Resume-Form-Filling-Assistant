const test = require("node:test");
const assert = require("node:assert/strict");

const fieldText = require("../shared/field-text.js");

test("selectBestFieldTextCandidate prefers label-like text over selected values", () => {
  const selected = fieldText.selectBestFieldTextCandidate([
    "+86",
    "手机号码",
    "15779197185",
  ]);

  assert.equal(selected, "手机号码");
});

test("selectBestFieldTextCandidate avoids generic values when a structural label exists", () => {
  const selected = fieldText.selectBestFieldTextCandidate([
    "中国 - 居民身份证",
    "证件类型",
    "中国大陆居民",
  ]);

  assert.equal(selected, "证件类型");
});

test("selectBestFieldTextCandidate still accepts meaningful long labels", () => {
  const selected = fieldText.selectBestFieldTextCandidate([
    "统招全日制",
    "培养方式（统招/非统招）",
  ]);

  assert.equal(selected, "培养方式（统招/非统招）");
});

test("selectBestFieldTextCandidate prefers a precise field label over aggregated row text", () => {
  const selected = fieldText.selectBestFieldTextCandidate([
    "最高学历： 学习形式：",
    "性别：",
  ]);

  assert.equal(selected, "性别：");
});

test("selectBestFieldTextCandidate prefers a concrete field label over timeline helper text", () => {
  const selected = fieldText.selectBestFieldTextCandidate([
    "工作时间： 年 月 至 年 月 至今",
    "工作地点：",
  ]);

  assert.equal(selected, "工作地点：");
});
