(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.ResumeDiagnostics = api;
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function () {
    "use strict";

    const DEFAULT_MAX_TEXT = 80;
    const DEFAULT_MAX_OPTIONS = 4;

    function compactText(value) {
      return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function truncateText(value, maxLength = DEFAULT_MAX_TEXT) {
      const text = compactText(value);
      if (!text) return "";
      if (text.length <= maxLength) return text;
      return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
    }

    function summarizeValue(value, { maxLength = DEFAULT_MAX_TEXT } = {}) {
      if (Array.isArray(value)) {
        const items = value
          .map((item) => compactText(item))
          .filter(Boolean)
          .slice(0, 3);

        if (items.length === 0) {
          return "(empty)";
        }

        const suffix = value.length > items.length ? ", ..." : "";
        return `"${truncateText(items.join(", ") + suffix, maxLength)}"`;
      }

      if (value && typeof value === "object") {
        try {
          return `"${truncateText(JSON.stringify(value), maxLength)}"`;
        } catch (_) {
          return '"[object]"';
        }
      }

      const text = truncateText(value, maxLength);
      return text ? `"${text}"` : "(empty)";
    }

    function summarizeOptions(options, { maxItems = DEFAULT_MAX_OPTIONS } = {}) {
      const list = Array.isArray(options)
        ? options.map((item) => truncateText(item, 24)).filter(Boolean)
        : [];

      if (list.length === 0) {
        return "[]";
      }

      const visible = list.slice(0, maxItems).join(" | ");
      const suffix = list.length > maxItems ? " | ..." : "";
      return `[${visible}${suffix}]`;
    }

    function formatTransform(transform) {
      if (!transform || typeof transform !== "object") {
        return "none";
      }

      const type = compactText(transform.type) || "none";
      if (type === "date_part" || type === "phone_part") {
        const part = compactText(transform.part);
        return part ? `${type}(${part})` : type;
      }

      if (type === "boolean_choice") {
        return `${type}(${compactText(transform.trueValue) || "true"}/${compactText(
          transform.falseValue
        ) || "false"})`;
      }

      if (type === "join") {
        return `${type}(${compactText(transform.separator) || ","})`;
      }

      return type;
    }

    function isSensitiveField(field, mapping) {
      const text = [
        field?.label,
        field?.name,
        field?.id,
        mapping?.resumePath,
      ]
        .map((item) => compactText(item))
        .join(" ");

      return /(姓名|名字|name|邮箱|email|手机|电话|phone|身份证|证件|护照|passport|地址|住址|微信|wechat|生日|出生|薪资|salary|简历|resume)/i.test(
        text
      );
    }

    function summarizeLoggedValue(value, field, mapping) {
      return isSensitiveField(field, mapping) ? '"[redacted]"' : summarizeValue(value);
    }

    function formatFieldSummary(field) {
      return [
        "[扫描]",
        compactText(field?.fieldId) || "(no-field-id)",
        compactText(field?.kind) || "unknown",
        `label=${summarizeValue(field?.label)}`,
        `name=${summarizeValue(field?.name)}`,
        `id=${summarizeValue(field?.id)}`,
        `placeholder=${summarizeValue(field?.placeholder)}`,
        `section=${summarizeValue(field?.sectionLabel)}`,
        `nearby=${summarizeOptions(field?.nearbyLabels)}`,
        `options=${summarizeOptions(field?.options)}`,
        `context=${summarizeValue(field?.context, { maxLength: 120 })}`,
      ].join(" ");
    }

    function formatMappingSummary(field, mapping, { source = "ai" } = {}) {
      return [
        `[映射:${compactText(source) || "ai"}]`,
        compactText(field?.fieldId) || "(no-field-id)",
        `${summarizeValue(field?.label)} -> ${
          compactText(mapping?.resumePath) || "(unmapped)"
        }`,
        `transform=${formatTransform(mapping?.transform)}`,
        `reason=${summarizeValue(mapping?.reason, { maxLength: 120 })}`,
      ].join(" ");
    }

    function formatValueSummary(field, mapping, rawValue, finalValue) {
      return [
        "[取值]",
        compactText(field?.fieldId) || "(no-field-id)",
        compactText(mapping?.resumePath) || "(unmapped)",
        `raw=${summarizeLoggedValue(rawValue, field, mapping)}`,
        `final=${summarizeLoggedValue(finalValue, field, mapping)}`,
      ].join(" ");
    }

    function formatSkipSummary(field, mapping, detail, rawValue, finalValue) {
      return [
        "[跳过]",
        compactText(field?.fieldId) || "(no-field-id)",
        `${summarizeValue(field?.label)} -> ${
          compactText(mapping?.resumePath) || "(unmapped)"
        }`,
        `raw=${summarizeLoggedValue(rawValue, field, mapping)}`,
        `final=${summarizeLoggedValue(finalValue, field, mapping)}`,
        `detail=${summarizeValue(detail)}`,
      ].join(" ");
    }

    function formatFillSummary({
      field,
      mapping,
      rawValue,
      finalValue,
      fillResult,
    }) {
      const status = fillResult?.filled ? "成功" : "失败";
      return [
        `[填充:${status}]`,
        compactText(field?.fieldId) || "(no-field-id)",
        `${summarizeValue(field?.label)} -> ${
          compactText(mapping?.resumePath) || "(unmapped)"
        }`,
        `raw=${summarizeLoggedValue(rawValue, field, mapping)}`,
        `final=${summarizeLoggedValue(finalValue, field, mapping)}`,
        `detail=${summarizeValue(fillResult?.message)}`,
      ].join(" ");
    }

    return {
      formatFieldSummary,
      formatMappingSummary,
      formatValueSummary,
      formatSkipSummary,
      formatFillSummary,
      formatTransform,
      isSensitiveField,
      summarizeValue,
      summarizeOptions,
      truncateText,
    };
  }
);
