const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadCacheKeyHelpers() {
  const source = fs.readFileSync(
    path.join(__dirname, "../content.js"),
    "utf8"
  );

  const start = source.indexOf("function createMappingCacheSignature(fields) {");
  const end = source.indexOf("async function loadMappingCacheEntry(cacheKey, meta = {})");
  if (start === -1 || end === -1) {
    throw new Error("Failed to locate cache key helpers in content.js");
  }

  const snippet = `
    const location = { origin: "https://zhaopin.meituan.com", pathname: "/web/personal-center/resume-detail", host: "zhaopin.meituan.com" };
    ${source.slice(start, end)}
    module.exports = {
      createMappingCacheSignature,
      createMappingCacheKey,
      createMappingCacheKeyFromSignature,
      createStableCacheFieldSignature,
      normalizeCacheText,
      describeMappingCacheLookup,
      summarizeCacheSignatureDifference,
    };
  `;

  const context = {
    module: { exports: {} },
    exports: {},
  };

  vm.createContext(context);
  vm.runInContext(snippet, context);
  return context.module.exports;
}

test("createMappingCacheKey stays stable across empty and filled page states", () => {
  const helpers = loadCacheKeyHelpers();

  const emptyStateKey = helpers.createMappingCacheKey([
    {
      kind: "text",
      label: "请填写公司名称",
      placeholder: "",
      inputType: "text",
      options: [],
      context: "请选择请填写公司名称",
      sectionKey: "work",
      sectionLabel: "工作经历",
      nearbyLabels: ["公司名称", "部门名称", "职位名称*请填写职位名称"],
    },
  ]);

  const filledStateKey = helpers.createMappingCacheKey([
    {
      kind: "text",
      label: "公司名称",
      placeholder: "",
      inputType: "text",
      options: [],
      context: "全灵",
      sectionKey: "work",
      sectionLabel: "工作经历",
      nearbyLabels: ["部门名称", "职位名称", "工作类型*实习"],
    },
  ]);

  assert.equal(emptyStateKey, filledStateKey);
});

test("normalizeCacheText strips prompt-like wrappers and volatile filled values", () => {
  const helpers = loadCacheKeyHelpers();

  assert.equal(helpers.normalizeCacheText("请填写公司名称"), "公司名称");
  assert.equal(helpers.normalizeCacheText("请选择请填写学历"), "学历");
  assert.equal(helpers.normalizeCacheText("公司名称*全灵"), "公司名称");
  assert.equal(helpers.normalizeCacheText("工作类型*实习"), "工作类型");
});

test("describeMappingCacheLookup explains same-page cache misses", () => {
  const helpers = loadCacheKeyHelpers();

  const previousSignature = helpers.createMappingCacheSignature([
    {
      kind: "text",
      label: "公司名称",
      placeholder: "",
      inputType: "text",
      options: [],
      sectionKey: "work",
      sectionLabel: "工作经历",
    },
  ]);

  const currentSignature = helpers.createMappingCacheSignature([
    {
      kind: "text",
      label: "公司简称",
      placeholder: "",
      inputType: "text",
      options: [],
      sectionKey: "work",
      sectionLabel: "工作经历",
    },
  ]);

  const previousKey = helpers.createMappingCacheKeyFromSignature(previousSignature);
  const currentKey = helpers.createMappingCacheKeyFromSignature(currentSignature);

  const result = helpers.describeMappingCacheLookup(
    {
      [previousKey]: {
        host: "zhaopin.meituan.com",
        path: "/web/personal-center/resume-detail",
        updatedAt: 1,
        signature: previousSignature,
      },
    },
    currentKey,
    {
      host: "zhaopin.meituan.com",
      path: "/web/personal-center/resume-detail",
      signature: currentSignature,
    }
  );

  assert.equal(result.hit, false);
  assert.match(result.reason, /同页面已有1条缓存/);
  assert.match(result.reason, /字段签名已变化/);
  assert.match(result.reason, /label 公司名称 -> 公司简称/);
});
