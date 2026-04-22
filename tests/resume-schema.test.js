const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadResumeSchema() {
  const source = fs.readFileSync(
    path.join(__dirname, "../shared/resume-schema.js"),
    "utf8"
  );
  const context = {
    window: {},
    console,
    structuredClone: global.structuredClone,
  };

  vm.createContext(context);
  vm.runInContext(source, context);

  return context.window.ResumeSchema;
}

test("resume schema exposes campus recruiting education and experience fields", () => {
  const schema = loadResumeSchema();
  const catalog = schema.getFieldCatalog({ mode: "max" });
  const template = JSON.parse(schema.createImportTemplateString());

  assert.ok(catalog.some((field) => field.path === "educations.0.educationType"));
  assert.ok(catalog.some((field) => field.path === "educations.0.studyMode"));
  assert.ok(catalog.some((field) => field.path === "educations.0.laboratory"));
  assert.ok(catalog.some((field) => field.path === "educations.0.researchDirection"));
  assert.ok(catalog.some((field) => field.path === "educations.0.advisor"));
  assert.ok(catalog.some((field) => field.path === "internships.0.company"));
  assert.ok(catalog.some((field) => field.path === "campusExperiences.0.organization"));

  assert.ok(Array.isArray(template.internships));
  assert.ok(Array.isArray(template.campusExperiences));
  assert.equal("educationType" in template.educations[0], true);
  assert.equal("studyMode" in template.educations[0], true);
  assert.equal("laboratory" in template.educations[0], true);
  assert.equal("researchDirection" in template.educations[0], true);
  assert.equal("advisor" in template.educations[0], true);
});

test("resume schema normalizes campus recruiting resume data", () => {
  const schema = loadResumeSchema();
  const normalized = schema.normalizeResumeProfile({
    educations: [
      {
        school: "浙江大学",
        educationType: "统招全日制",
        studyMode: "联合培养",
        laboratory: "CAD&CG 国家重点实验室",
        researchDirection: ["AIGC", "多模态生成"],
        advisor: "王老师",
        studentId: 20231234,
        academicSystem: 3,
      },
    ],
    internships: [
      {
        company: "字节跳动",
        title: "后端开发实习生",
        description: ["负责推荐服务接口开发", "支持线上稳定性治理"],
      },
    ],
    campusExperiences: [
      {
        organization: "浙江大学 ACM 协会",
        category: "学生组织",
        role: "技术负责人",
        isCurrent: true,
      },
    ],
  });

  assert.equal(normalized.educations[0].educationType, "统招全日制");
  assert.equal(normalized.educations[0].studyMode, "联合培养");
  assert.equal(normalized.educations[0].laboratory, "CAD&CG 国家重点实验室");
  assert.equal(normalized.educations[0].researchDirection, "AIGC, 多模态生成");
  assert.equal(normalized.educations[0].advisor, "王老师");
  assert.equal(normalized.educations[0].studentId, "20231234");
  assert.equal(normalized.educations[0].academicSystem, "3");
  assert.equal(normalized.internships[0].company, "字节跳动");
  assert.equal(
    normalized.internships[0].description,
    "负责推荐服务接口开发, 支持线上稳定性治理"
  );
  assert.equal(normalized.campusExperiences[0].category, "学生组织");
  assert.equal(normalized.campusExperiences[0].isCurrent, "是");
});

test("resume schema preserves flexible date precision and legacy aliases", () => {
  const schema = loadResumeSchema();
  const normalized = schema.normalizeResumeProfile({
    personal: {
      birthYearMonth: "2001/06",
    },
    contactAndLocation: {
      nativePlace: "江西南昌",
    },
    identityAndAuthorization: {
      idCardNumber: "362202200106265976",
    },
    educations: [
      {
        learningModality: "全国普通高等院校全日制",
        schoolSystem: "2年及以上",
        timeRange: "2021年09月 至 2025年06月",
      },
    ],
  });

  assert.equal(normalized.personal.birthDate, "2001-06");
  assert.equal(normalized.contactAndLocation.hometownCity, "江西南昌");
  assert.equal(normalized.contactAndLocation.hometownProvince, "江西南昌");
  assert.equal(
    normalized.identityAndAuthorization.personalIdNumber,
    "362202200106265976"
  );
  assert.equal(normalized.identityAndAuthorization.personalIdType, "身份证");
  assert.equal(normalized.educations[0].studyMode, "统招");
  assert.equal(normalized.educations[0].academicSystem, "2年及以上");
  assert.equal(normalized.educations[0].startDate, "2021-09");
  assert.equal(normalized.educations[0].endDate, "2025-06");
});
