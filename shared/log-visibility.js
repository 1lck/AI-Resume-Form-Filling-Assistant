(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.ResumeLogVisibility = api;
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function () {
    "use strict";

    function compactText(value) {
      return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function isVerboseStructuredDiagnostic(message) {
      const text = compactText(message);
      return (
        text.startsWith("[扫描]") ||
        text.startsWith("[缓存]") ||
        text.startsWith("[映射:") ||
        text.startsWith("[取值]") ||
        text.startsWith("[跳过]") ||
        text.startsWith("[日期]") ||
        text.startsWith("[填充:成功]")
      );
    }

    function shouldRenderLogInUi(level, message) {
      const text = compactText(message);
      if (!text) return false;
      if (text.startsWith("[填充:失败]")) return true;
      if (isVerboseStructuredDiagnostic(text)) return false;
      return true;
    }

    return {
      isVerboseStructuredDiagnostic,
      shouldRenderLogInUi,
    };
  }
);
