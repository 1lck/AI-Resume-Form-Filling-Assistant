const test = require("node:test");
const assert = require("node:assert/strict");

const diagnostics = require("../shared/diagnostics.js");

test("formatFieldSummary keeps the most useful field metadata readable", () => {
  const summary = diagnostics.formatFieldSummary({
    fieldId: "f_12",
    kind: "text",
    label: "电子邮箱",
    name: "email",
    id: "user_email",
    placeholder: "请输入常用邮箱地址",
    context: "联系方式 请填写常用邮箱，后续通知会发到这里",
    options: [],
    sectionLabel: "基本信息",
    nearbyLabels: ["联系方式", "邮箱"],
  });

  assert.match(summary, /f_12/);
  assert.match(summary, /label="电子邮箱"/);
  assert.match(summary, /name="email"/);
  assert.match(summary, /placeholder="请输入常用邮箱地址"/);
  assert.match(summary, /section="基本信息"/);
  assert.match(summary, /nearby=\[联系方式 \| 邮箱\]/);
  assert.match(summary, /context="联系方式 请填写常用邮箱/);
});

test("formatMappingSummary shows source, reason, and transform", () => {
  const summary = diagnostics.formatMappingSummary(
    {
      fieldId: "f_3",
      label: "Available Start Date",
    },
    {
      resumePath: "jobPreferences.availableDate",
      reason: "字段明确询问可入职日期",
      transform: { type: "date_part", part: "year" },
    },
    { source: "ai" }
  );

  assert.match(summary, /\[映射:ai\]/);
  assert.match(summary, /f_3/);
  assert.match(summary, /jobPreferences.availableDate/);
  assert.match(summary, /transform=date_part\(year\)/);
  assert.match(summary, /reason="字段明确询问可入职日期"/);
});

test("formatFillSummary surfaces failure reason and final value", () => {
  const summary = diagnostics.formatFillSummary({
    field: {
      fieldId: "f_8",
      label: "性别",
    },
    mapping: {
      resumePath: "personal.gender",
    },
    rawValue: "男",
    finalValue: "男",
    fillResult: {
      filled: false,
      message: "未找到可匹配的下拉选项",
    },
  });

  assert.match(summary, /\[填充:失败\]/);
  assert.match(summary, /f_8/);
  assert.match(summary, /personal.gender/);
  assert.match(summary, /final="男"/);
  assert.match(summary, /detail="未找到可匹配的下拉选项"/);
});
