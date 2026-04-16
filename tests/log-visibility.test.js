const test = require("node:test");
const assert = require("node:assert/strict");

const visibility = require("../shared/log-visibility.js");

test("hides verbose structured diagnostics from the side panel", () => {
  assert.equal(visibility.shouldRenderLogInUi("info", '[扫描] f_1 text label="邮箱"'), false);
  assert.equal(
    visibility.shouldRenderLogInUi("info", '[映射:ai] f_1 "邮箱" -> personal.email'),
    false
  );
  assert.equal(visibility.shouldRenderLogInUi("info", '[取值] f_1 personal.email'), false);
  assert.equal(
    visibility.shouldRenderLogInUi("success", '[填充:成功] f_1 "邮箱" -> personal.email'),
    false
  );
  assert.equal(
    visibility.shouldRenderLogInUi("warning", '[跳过] f_8 "性别" -> personal.gender'),
    false
  );
  assert.equal(
    visibility.shouldRenderLogInUi("info", '[日期] f_12 "入学时间" 面板已打开 detail="year=2025 month=12 day=0"'),
    false
  );
});

test("keeps key process logs and failures visible in the side panel", () => {
  assert.equal(visibility.shouldRenderLogInUi("info", "开始识别页面字段，准备进行 AI 字段映射..."), true);
  assert.equal(
    visibility.shouldRenderLogInUi("success", "填充完成：识别 18 个字段，映射 16 个，成功填充 14 个。"),
    true
  );
  assert.equal(
    visibility.shouldRenderLogInUi("warning", '[填充:失败] f_2 "开始时间" -> jobPreferences.availableDate'),
    true
  );
  assert.equal(visibility.shouldRenderLogInUi("error", "填充失败：AI 调用失败"), true);
});
