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

    const MONTH_NAME_PATTERN =
      "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
    const MONTH_NAME_INDEX = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };

    // 宽松解析各种站点/简历里常见的日期写法，统一成 { year, month, day }；解析不出来的部分为 0。
    // 支持：2024 / 2024-3 / 2024-03-05 / 2024/03/05 / 2024.03 / 2024年3月5日 / 20240305 / Mar 2024。
    function parseDateParts(value) {
      const empty = { year: 0, month: 0, day: 0 };
      const text = String(value ?? "").trim().toLowerCase();
      if (!text) return empty;

      const english = text.match(new RegExp(`^${MONTH_NAME_PATTERN}\\s*(\\d{1,2})?,?\\s*(\\d{4})$`));
      if (english) {
        return {
          year: Number(english[3]),
          month: MONTH_NAME_INDEX[english[1]],
          day: Number(english[2] || 0),
        };
      }

      const compact = text.match(/^(\d{4})(\d{2})(\d{2})?$/);
      const match =
        compact ||
        text
          .replace(/\s+/g, "")
          // 年月日之间必须有分隔符或“月”，避免把 2024-115 这类串硬拆成 2024-11-05。
          .match(/^(\d{4})(?:[-/.年](\d{1,2})(?:月(\d{1,2})?|[-/.](\d{1,2}))?)?[-/.年月日]?$/);
      if (!match) return empty;

      const year = Number(match[1]);
      const month = Number(match[2] || 0);
      const day = Number(match[3] || match[4] || 0);
      if (month > 12) return empty;
      if (!month && day) return empty;
      if (day && day > new Date(year, month, 0).getDate()) return empty;

      return { year, month, day };
    }

    function formatDateParts({ year, month, day }, precision = "day") {
      if (!year) return "";
      const y = String(year);
      if (precision === "year" || !month) return y;
      const m = String(month).padStart(2, "0");
      if (precision === "month" || !day) return `${y}-${m}`;
      return `${y}-${m}-${String(day).padStart(2, "0")}`;
    }

    // 把日期文本裁剪/补齐到指定精度：month -> YYYY-MM，day -> YYYY-MM-DD（缺失部分补 01）。
    // 解析失败返回空字符串。
    function toDatePrecision(value, precision) {
      const parts = parseDateParts(value);
      if (!parts.year) return "";

      if (precision === "month") {
        return formatDateParts({ ...parts, month: parts.month || 1 }, "month");
      }

      return formatDateParts(
        { year: parts.year, month: parts.month || 1, day: parts.day || 1 },
        "day"
      );
    }

    const DATE_FIELD_KEYWORDS =
      /(时间|日期|年月|年份|月份|生日|出生|入学|毕业|入职|离职|起止|date|month|year|calendar|birthday)/;
    // 标签里带这些词时，即使出现“毕业/入学”等字眼也不是日期控件，例如“毕业院校”“入学方式”。
    const NON_DATE_FIELD_KEYWORDS =
      /(院校|学校|专业|学历|学位|院系|地点|城市|地区|地址|方式|类型|性质|去向|原因|单位|公司|名称)/;

    function isReadonlyDateLikeRuntime(runtime) {
      if (!runtime?.readOnly) return false;
      if (runtime?.inputType && runtime.inputType !== "text") return false;

      // 只看字段自己的 label/placeholder：context 和 nearbyLabels 会混入同一块里其它字段的文字
      // （比如教育经历里的“开始时间”），拿来判定会把旁边的只读下拉框也误判成日期。
      const ownText = [runtime?.label, runtime?.placeholder]
        .map((item) => normalizeText(item))
        .filter(Boolean)
        .join(" ");

      if (ownText && NON_DATE_FIELD_KEYWORDS.test(ownText) && !/(时间|日期)/.test(ownText)) {
        return false;
      }
      if (ownText && DATE_FIELD_KEYWORDS.test(ownText)) {
        return true;
      }

      return Boolean(runtime?.hasCalendarIcon);
    }

    function prefersMonthPrecision(runtime) {
      const text = collectRuntimeText(runtime);
      return /(入学|毕业|在校|出生|年月|月份)/.test(text);
    }

    function normalizeValueForRuntime(runtime, rawValue) {
      const text = String(rawValue ?? "").trim();
      if (!text) return "";

      if (!isReadonlyDateLikeRuntime(runtime)) {
        return text;
      }

      if (prefersMonthPrecision(runtime)) {
        return toDatePrecision(text, "month") || text;
      }

      return text;
    }

    function matchesWrittenValue(runtime, actualValue, desiredValue) {
      const actual = String(actualValue ?? "").trim();
      const desired = String(desiredValue ?? "").trim();
      if (!actual || !desired) return false;
      if (actual === desired) return true;

      if (isReadonlyDateLikeRuntime(runtime)) {
        // 站点选完后常显示成 2024/03/15、2024年03月 等格式，按年月日逐项比较。
        const actualParts = parseDateParts(actual);
        const desiredParts = parseDateParts(desired);
        if (!actualParts.year || !desiredParts.year) return false;
        if (actualParts.year !== desiredParts.year) return false;
        if (desiredParts.month && actualParts.month !== desiredParts.month) return false;
        if (desiredParts.day && actualParts.day !== desiredParts.day) return false;
        return true;
      }

      return false;
    }

    return {
      parseDateParts,
      formatDateParts,
      toDatePrecision,
      isReadonlyDateLikeRuntime,
      normalizeValueForRuntime,
      matchesWrittenValue,
    };
  }
);
