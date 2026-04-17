(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.ResumeFieldText = api;
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function () {
    "use strict";

    function normalizeFieldText(text) {
      return String(text || "")
        .replace(/\s+/g, " ")
        .replace(/[\r\n]+/g, " ")
        .replace(/[＊*]+\s*$/g, "")
        .trim();
    }

    function isMeaningfulFieldText(text) {
      const normalized = normalizeFieldText(text);
      if (!normalized) return false;
      if (normalized.length <= 1) return false;
      if (/^[+()\-.\s\d/]+$/.test(normalized)) return false;
      return true;
    }

    function scoreFieldTextCandidate(text) {
      const normalized = normalizeFieldText(text);
      if (!isMeaningfulFieldText(normalized)) return Number.NEGATIVE_INFINITY;

      let score = 0;
      const length = normalized.length;

      if (length >= 2 && length <= 16) score += 12;
      else if (length <= 32) score += 8;
      else if (length <= 60) score += 3;
      else score -= 8;

      if (/[：:？?]$/.test(normalized)) score += 4;
      if (/(姓名|名字|邮箱|邮件|手机|电话|联系方式|证件|身份证|学历|学位|学校|专业|毕业|培养|项目|经历|描述|亮点|成绩|职位|公司|时间|日期)/.test(normalized)) {
        score += 10;
      }

      const labelSeparatorCount = (normalized.match(/[：:]/g) || []).length;
      if (labelSeparatorCount >= 2) {
        score -= 8;
      }

      if (/年\s*月\s*至\s*年\s*月/.test(normalized)) {
        score -= 10;
      }

      if (/(姓名|邮箱|手机|学历|学习形式|性别|民族|工作时间|工作地点|工作职责|部门)[：:]/.test(normalized)) {
        const fieldKeywordCount =
          (
            normalized.match(
              /(姓名|邮箱|手机|学历|学习形式|性别|民族|工作时间|工作地点|工作职责|部门)[：:]/g
            ) || []
          ).length;
        if (fieldKeywordCount >= 2) {
          score -= 8;
        }
      }

      if (/^\+?\d[\d\s\-()]{3,}$/.test(normalized)) score -= 15;
      if (/^[\u4e00-\u9fa5a-zA-Z]+(?:\s*-\s*[\u4e00-\u9fa5a-zA-Z]+)+$/.test(normalized)) score -= 4;
      if (/(本科|硕士|博士|大专|高中|统招全日制|中国 - 居民身份证|中国大陆居民|男|女|是|否)$/.test(normalized)) {
        score -= 6;
      }

      return score;
    }

    function selectBestFieldTextCandidate(candidates) {
      let bestText = "";
      let bestScore = Number.NEGATIVE_INFINITY;

      for (const candidate of Array.isArray(candidates) ? candidates : []) {
        const normalized = normalizeFieldText(candidate);
        const score = scoreFieldTextCandidate(normalized);
        if (score > bestScore) {
          bestText = normalized;
          bestScore = score;
        }
      }

      return Number.isFinite(bestScore) ? bestText : "";
    }

    return {
      normalizeFieldText,
      isMeaningfulFieldText,
      scoreFieldTextCandidate,
      selectBestFieldTextCandidate,
    };
  }
);
