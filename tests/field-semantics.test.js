const test = require("node:test");
const assert = require("node:assert/strict");

const semantics = require("../shared/field-semantics.js");

test("inferSectionFromTexts recognizes education sections", () => {
  const section = semantics.inferSectionFromTexts([
    "教育经历",
    "学校名称",
    "学历类型",
    "实验室",
  ]);

  assert.equal(section.key, "education");
  assert.equal(section.label, "教育经历");
  assert.match(section.evidence, /学历类型|实验室|学校名称/);
});

test("inferSectionFromTexts prefers internship over generic work for intern labels", () => {
  const section = semantics.inferSectionFromTexts([
    "实习经历",
    "公司名称",
    "职位名称",
    "后端开发实习生",
  ]);

  assert.equal(section.key, "internship");
  assert.equal(section.label, "实习经历");
});

test("inferSectionFromTexts recognizes campus sections", () => {
  const section = semantics.inferSectionFromTexts([
    "校园经历",
    "学生组织",
    "社团",
    "技术负责人",
  ]);

  assert.equal(section.key, "campus");
  assert.equal(section.label, "校园经历");
});
