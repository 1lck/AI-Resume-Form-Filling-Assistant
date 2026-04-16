const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadParser(fileName, stopFunctionName) {
  const source = fs.readFileSync(
    path.join(__dirname, `../${fileName}`),
    "utf8"
  );
  const marker = `function ${stopFunctionName}(`;
  const start = source.indexOf("function parseJsonFromAiText(text) {");
  const end = source.indexOf(marker, start);

  assert.notEqual(start, -1, `${fileName} should contain parseJsonFromAiText`);
  assert.notEqual(end, -1, `${fileName} should contain ${stopFunctionName}`);

  const snippet = source.slice(start, end);
  const context = {
    module: { exports: {} },
    exports: {},
  };

  vm.createContext(context);
  vm.runInContext(
    `${snippet}\nmodule.exports = { parseJsonFromAiText };`,
    context
  );

  return context.module.exports.parseJsonFromAiText;
}

const popupParser = loadParser("popup.js", "updateStatus");
const editorParser = loadParser("resume-editor.js", "updatePageStatus");

for (const [name, parseJsonFromAiText] of [
  ["popup", popupParser],
  ["resume-editor", editorParser],
]) {
  test(`${name} parser accepts JSON with trailing commas`, () => {
    const parsed = parseJsonFromAiText('{ "name": "陈嘉昊", "skills": ["React", "Node.js",], }');

    assert.equal(parsed.name, "陈嘉昊");
    assert.deepEqual(Array.from(parsed.skills), ["React", "Node.js"]);
  });

  test(`${name} parser extracts JSON before prose that contains braces`, () => {
    const parsed = parseJsonFromAiText(
      [
        "下面是整理后的 JSON：",
        '{ "name": "陈嘉昊", "city": "上海" }',
        "说明：字段 {additional.notes} 因原文缺失已留空。",
      ].join("\n")
    );

    assert.equal(parsed.name, "陈嘉昊");
    assert.equal(parsed.city, "上海");
  });
}
