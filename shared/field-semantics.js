(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.ResumeFieldSemantics = api;
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function () {
    "use strict";

    const SECTION_RULES = [
      {
        key: "personal",
        label: "基本信息",
        keywords: ["基本信息", "个人信息", "联系方式", "姓名", "邮箱", "手机", "电话", "证件"],
      },
      {
        key: "education",
        label: "教育经历",
        keywords: [
          "教育经历",
          "学校名称",
          "学校",
          "学历类型",
          "培养方式",
          "学历",
          "学位",
          "学院",
          "专业",
          "实验室",
          "领域方向",
          "导师",
          "学号",
          "班级",
          "学制",
          "毕业",
          "论文",
          "gpa",
        ],
      },
      {
        key: "internship",
        label: "实习经历",
        keywords: [
          "实习经历",
          "实习",
          "实习公司",
          "实习岗位",
          "实习部门",
          "实习城市",
          "实习生",
        ],
      },
      {
        key: "work",
        label: "工作经历",
        keywords: [
          "工作经历",
          "工作",
          "公司名称",
          "职位名称",
          "所属部门",
          "工作职责",
          "工作成绩",
        ],
      },
      {
        key: "project",
        label: "项目经历",
        keywords: ["项目经历", "项目名称", "项目角色", "项目链接", "项目说明", "项目亮点", "项目描述"],
      },
      {
        key: "campus",
        label: "校园经历",
        keywords: [
          "校园经历",
          "学生组织",
          "社团",
          "班干部",
          "校园活动",
          "志愿服务",
          "科研助理",
          "组织名称",
        ],
      },
      {
        key: "certificate",
        label: "证书与认证",
        keywords: ["证书", "认证", "发证", "等级考试", "资格证"],
      },
      {
        key: "language",
        label: "语言能力",
        keywords: ["语言能力", "语言", "外语", "雅思", "托福", "cet", "四六级"],
      },
    ];

    function normalizeSemanticText(text) {
      return String(text || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[()（）[\]【】{}<>]/g, "")
        .replace(/[.,，/\\\-_:：;+*"'`“”‘’]/g, "");
    }

    function inferSectionFromTexts(texts) {
      const list = Array.isArray(texts) ? texts.filter(Boolean) : [];
      if (list.length === 0) {
        return {
          key: "",
          label: "",
          evidence: "",
          score: 0,
        };
      }

      let best = {
        key: "",
        label: "",
        evidence: "",
        score: 0,
      };

      for (const rule of SECTION_RULES) {
        let score = 0;
        const matched = [];

        for (const text of list) {
          const normalizedText = normalizeSemanticText(text);
          if (!normalizedText) continue;

          for (const keyword of rule.keywords) {
            const normalizedKeyword = normalizeSemanticText(keyword);
            if (!normalizedKeyword || !normalizedText.includes(normalizedKeyword)) {
              continue;
            }

            score += normalizedText === normalizedKeyword ? 8 : 4;
            matched.push(keyword);
          }
        }

        if (rule.key === "internship" && matched.some((item) => String(item).includes("实习"))) {
          score += 6;
        }

        if (rule.key === "campus" && matched.some((item) => /学生组织|社团|志愿服务|科研助理/.test(item))) {
          score += 5;
        }

        if (score > best.score) {
          best = {
            key: rule.key,
            label: rule.label,
            evidence: Array.from(new Set(matched)).slice(0, 3).join(" / "),
            score,
          };
        }
      }

      if (best.score < 4) {
        return {
          key: "",
          label: "",
          evidence: "",
          score: 0,
        };
      }

      return best;
    }

    return {
      inferSectionFromTexts,
      normalizeSemanticText,
    };
  }
);
