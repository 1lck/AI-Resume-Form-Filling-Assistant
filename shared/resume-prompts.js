(function initResumePrompts(root) {
  "use strict";

  function buildResumeImportPrompt(schema, rawText) {
    const optionRules = schema
      .getFieldCatalog()
      .filter((field) => Array.isArray(field.options) && field.options.length > 0)
      .map(
        (field) =>
          `- ${field.path}: ${field.options.filter(Boolean).join(" | ")}`
      )
      .join("\n");

    return [
      "请把下面的原始简历内容提取到固定 JSON 模板中。",
      "要求：",
      "1. 只输出 JSON，不要解释。",
      "2. 只能使用模板中已有字段，不要新增字段。",
      "3. 没有信息的字段保持空字符串。",
      "4. 列表字段按时间从近到远填写前几个槽位，剩余槽位留空。",
      "5. 日期尽量输出为 YYYY-MM-DD；若只能确认到月份，可输出 YYYY-MM。",
      "6. 下列枚举字段只能使用给定选项值：",
      optionRules,
      "",
      "固定 JSON 模板：",
      schema.createImportTemplateString(),
      "",
      "原始简历内容：",
      String(rawText || ""),
    ].join("\n");
  }

  root.ResumePrompts = Object.freeze({ buildResumeImportPrompt });
})(typeof globalThis !== "undefined" ? globalThis : this);
