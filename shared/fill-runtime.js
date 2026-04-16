(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.ResumeFillRuntime = api;
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function () {
    "use strict";

    function normalizeText(value) {
      return String(value || "")
        .trim()
        .toLowerCase();
    }

    function collectRuntimeText(runtime) {
      const parts = [
        runtime?.label,
        runtime?.placeholder,
        runtime?.context,
        ...(Array.isArray(runtime?.nearbyLabels) ? runtime.nearbyLabels : []),
      ];

      return parts.map((item) => normalizeText(item)).filter(Boolean).join(" ");
    }

    function isReadonlyDateLikeRuntime(runtime) {
      if (!runtime?.readOnly) return false;
      if (runtime?.inputType && runtime.inputType !== "text") return false;

      const text = collectRuntimeText(runtime);
      if (!text) return Boolean(runtime?.hasCalendarIcon);

      const hasDateKeyword =
        /(入学|毕业|在校|开始|结束|时间|日期|date|month|calendar)/.test(text);

      return hasDateKeyword || Boolean(runtime?.hasCalendarIcon);
    }

    function prefersMonthPrecision(runtime) {
      const text = collectRuntimeText(runtime);
      return /(入学|毕业|在校|开始|结束|出生|年月|月份|月)/.test(text);
    }

    function normalizeValueForRuntime(runtime, rawValue) {
      const text = String(rawValue ?? "").trim();
      if (!text) return "";

      if (!isReadonlyDateLikeRuntime(runtime)) {
        return text;
      }

      if (prefersMonthPrecision(runtime)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.slice(0, 7);
        if (/^\d{4}-\d{2}$/.test(text)) return text;
        if (/^\d{4}$/.test(text)) return `${text}-01`;
      }

      return text;
    }

    function matchesWrittenValue(runtime, actualValue, desiredValue) {
      const actual = String(actualValue ?? "").trim();
      const desired = String(desiredValue ?? "").trim();
      if (!actual || !desired) return false;

      if (isReadonlyDateLikeRuntime(runtime)) {
        if (actual === desired) return true;
        if (/^\d{4}-\d{2}$/.test(desired) && actual.startsWith(desired)) return true;
      }

      return actual === desired;
    }

    return {
      isReadonlyDateLikeRuntime,
      normalizeValueForRuntime,
      matchesWrittenValue,
    };
  }
);
