const test = require("node:test");
const assert = require("node:assert/strict");

const fillRuntime = require("../shared/fill-runtime.js");

test("normalizeValueForRuntime converts readonly month picker values to YYYY-MM", () => {
  const runtime = {
    readOnly: true,
    inputType: "text",
    placeholder: "入学时间",
    label: "请填写入学时间",
    hasCalendarIcon: true,
  };

  assert.equal(
    fillRuntime.normalizeValueForRuntime(runtime, "2025-12-01"),
    "2025-12"
  );
});

test("normalizeValueForRuntime also treats birth year-month fields as month precision", () => {
  const runtime = {
    readOnly: true,
    inputType: "text",
    placeholder: "选择日期",
    label: "姓名",
    context: "请填写出生年月",
    nearbyLabels: ["出生年月"],
    hasCalendarIcon: true,
  };

  assert.equal(
    fillRuntime.normalizeValueForRuntime(runtime, "2005-06-23"),
    "2005-06"
  );
});

test("matchesWrittenValue accepts readonly month picker values with month prefix", () => {
  const runtime = {
    readOnly: true,
    inputType: "text",
    placeholder: "毕业时间",
    label: "请填写毕业时间",
    hasCalendarIcon: true,
  };

  assert.equal(
    fillRuntime.matchesWrittenValue(runtime, "2026-04-01", "2026-04"),
    true
  );
});

test("normalizeValueForRuntime keeps day precision for generic start/end date pickers", () => {
  const runtime = {
    readOnly: true,
    inputType: "text",
    placeholder: "请选择日期",
    label: "开始日期",
    hasCalendarIcon: true,
  };

  assert.equal(
    fillRuntime.normalizeValueForRuntime(runtime, "2026-06-03"),
    "2026-06-03"
  );
});

test("isReadonlyDateLikeRuntime rejects ordinary readonly text inputs without date hints", () => {
  const runtime = {
    readOnly: true,
    inputType: "text",
    placeholder: "请输入账号名称",
    label: "账号名称",
    hasCalendarIcon: false,
  };

  assert.equal(fillRuntime.isReadonlyDateLikeRuntime(runtime), false);
});

test("parseDateParts understands common site and resume date formats", () => {
  const cases = [
    ["2024", { year: 2024, month: 0, day: 0 }],
    ["2024-3", { year: 2024, month: 3, day: 0 }],
    ["2024-03-05", { year: 2024, month: 3, day: 5 }],
    ["2024/03/05", { year: 2024, month: 3, day: 5 }],
    ["2024.03", { year: 2024, month: 3, day: 0 }],
    ["2024年3月", { year: 2024, month: 3, day: 0 }],
    ["2024年03月05日", { year: 2024, month: 3, day: 5 }],
    ["2024 年 3 月", { year: 2024, month: 3, day: 0 }],
    ["20240305", { year: 2024, month: 3, day: 5 }],
    ["Mar 2024", { year: 2024, month: 3, day: 0 }],
    ["March 5, 2024", { year: 2024, month: 3, day: 5 }],
  ];

  for (const [input, expected] of cases) {
    assert.deepEqual(fillRuntime.parseDateParts(input), expected, input);
  }

  assert.deepEqual(fillRuntime.parseDateParts("至今"), { year: 0, month: 0, day: 0 });
  assert.deepEqual(fillRuntime.parseDateParts("2024-13"), { year: 0, month: 0, day: 0 });
});

test("parseDateParts rejects ambiguous digit runs and impossible days", () => {
  const empty = { year: 0, month: 0, day: 0 };
  assert.deepEqual(fillRuntime.parseDateParts("2024-115"), empty);
  assert.deepEqual(fillRuntime.parseDateParts("2024-02-31"), empty);
  assert.deepEqual(fillRuntime.parseDateParts("20230229"), empty);
  assert.deepEqual(fillRuntime.parseDateParts("2024-02-29"), { year: 2024, month: 2, day: 29 });
  assert.deepEqual(fillRuntime.parseDateParts("2024年3月"), { year: 2024, month: 3, day: 0 });
  assert.deepEqual(fillRuntime.parseDateParts("2024年"), { year: 2024, month: 0, day: 0 });
});

test("toDatePrecision pads or trims to the requested precision", () => {
  assert.equal(fillRuntime.toDatePrecision("2024", "day"), "2024-01-01");
  assert.equal(fillRuntime.toDatePrecision("2024-03", "day"), "2024-03-01");
  assert.equal(fillRuntime.toDatePrecision("2024/3/5", "day"), "2024-03-05");
  assert.equal(fillRuntime.toDatePrecision("2024-03-05", "month"), "2024-03");
  assert.equal(fillRuntime.toDatePrecision("2024", "month"), "2024-01");
  assert.equal(fillRuntime.toDatePrecision("至今", "month"), "");
});

test("matchesWrittenValue accepts site-formatted readonly date values", () => {
  const runtime = {
    readOnly: true,
    inputType: "text",
    label: "开始时间",
    hasCalendarIcon: true,
  };

  assert.equal(fillRuntime.matchesWrittenValue(runtime, "2024/03/15", "2024-03-15"), true);
  assert.equal(fillRuntime.matchesWrittenValue(runtime, "2024年03月", "2024-03"), true);
  assert.equal(fillRuntime.matchesWrittenValue(runtime, "2024.03.01", "2024-03"), true);
  assert.equal(fillRuntime.matchesWrittenValue(runtime, "2024/03/16", "2024-03-15"), false);
  assert.equal(fillRuntime.matchesWrittenValue(runtime, "2025-03", "2024-03"), false);
  assert.equal(fillRuntime.matchesWrittenValue(runtime, "2024-03", "2024-03-15"), false);
});

test("matchesWrittenValue stays strict for non-date fields", () => {
  const runtime = { readOnly: false, inputType: "text", label: "姓名" };

  assert.equal(fillRuntime.matchesWrittenValue(runtime, "张三", "张三"), true);
  assert.equal(fillRuntime.matchesWrittenValue(runtime, "2024/03/15", "2024-03-15"), false);
});

test("isReadonlyDateLikeRuntime ignores non-date readonly fields near date fields", () => {
  const schoolSelect = {
    readOnly: true,
    inputType: "text",
    label: "毕业院校",
    placeholder: "请选择",
    context: "教育经历 开始时间 结束时间 毕业院校",
    nearbyLabels: ["开始时间", "结束时间"],
    hasCalendarIcon: false,
  };
  const citySelect = {
    readOnly: true,
    inputType: "text",
    label: "所在城市",
    placeholder: "请选择",
    hasCalendarIcon: true,
  };
  const degreeSelect = {
    readOnly: true,
    inputType: "text",
    label: "学历",
    placeholder: "请选择",
    context: "入学时间 毕业时间",
    hasCalendarIcon: false,
  };

  assert.equal(fillRuntime.isReadonlyDateLikeRuntime(schoolSelect), false);
  assert.equal(fillRuntime.isReadonlyDateLikeRuntime(citySelect), false);
  assert.equal(fillRuntime.isReadonlyDateLikeRuntime(degreeSelect), false);
});

test("isReadonlyDateLikeRuntime still detects date fields by their own label or calendar icon", () => {
  assert.equal(
    fillRuntime.isReadonlyDateLikeRuntime({ readOnly: true, inputType: "text", label: "毕业时间" }),
    true
  );
  assert.equal(
    fillRuntime.isReadonlyDateLikeRuntime({ readOnly: true, inputType: "text", label: "毕业院校起止时间" }),
    true
  );
  assert.equal(
    fillRuntime.isReadonlyDateLikeRuntime({
      readOnly: true,
      inputType: "text",
      label: "",
      placeholder: "",
      hasCalendarIcon: true,
    }),
    true
  );
});
