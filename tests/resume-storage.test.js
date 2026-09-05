const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadResumeStorage() {
  const source = fs.readFileSync(
    path.join(__dirname, "../shared/resume-storage.js"),
    "utf8"
  );
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.ResumeStorage;
}

function createStorage({ local = {}, sync = {} } = {}) {
  const state = { local: { ...local }, sync: { ...sync } };
  const calls = {
    localGet: 0,
    localSet: [],
    localRemove: [],
    syncGet: 0,
    syncSet: [],
    syncRemove: [],
  };

  function createArea(name) {
    return {
      async get(keys) {
        calls[`${name}Get`] += 1;
        const result = {};
        for (const key of keys) {
          if (Object.prototype.hasOwnProperty.call(state[name], key)) {
            result[key] = state[name][key];
          }
        }
        return result;
      },
      async set(values) {
        calls[`${name}Set`].push(values);
        Object.assign(state[name], values);
      },
      async remove(keys) {
        calls[`${name}Remove`].push(keys);
        for (const key of keys) delete state[name][key];
      },
    };
  }

  return {
    storage: { local: createArea("local"), sync: createArea("sync") },
    state,
    calls,
  };
}

test("large resume data is saved only to local storage", async () => {
  const resumeStorage = loadResumeStorage();
  const fake = createStorage();
  const longText = "长简历内容".repeat(12000);
  const profile = { personal: { name: "测试用户" }, detail: longText };

  const state = await resumeStorage.loadTemplateState(fake.storage);
  const id = state.activeTemplateId;

  await resumeStorage.saveTemplateContent(
    id,
    { profile, schemaVersion: 7, rawText: longText },
    fake.storage
  );

  const saved = fake.state.local.resumeTemplates[id];
  assert.deepEqual(saved.profile, profile);
  assert.equal(saved.rawText, longText);
  assert.equal(saved.schemaVersion, 7);
  assert.equal(fake.calls.syncSet.length, 0);
  assert.equal("resumeTemplates" in fake.state.sync, false);
});

test("legacy synchronized resume data is migrated into the default template", async () => {
  const resumeStorage = loadResumeStorage();
  const profile = { personal: { name: "旧版用户" } };
  const fake = createStorage({
    sync: {
      resumeStructured: profile,
      resumeRawText: "旧版原始简历",
      resumeSchemaVersion: 3,
    },
  });

  const state = await resumeStorage.loadTemplateState(fake.storage);

  assert.equal(state.activeTemplateId, resumeStorage.DEFAULT_TEMPLATE_ID);
  const saved = fake.state.local.resumeTemplates[resumeStorage.DEFAULT_TEMPLATE_ID];
  assert.deepEqual(saved.profile, profile);
  assert.equal(saved.rawText, "旧版原始简历");
  assert.equal(saved.schemaVersion, 3);
  assert.equal("resumeStructured" in fake.state.sync, false);
  assert.equal("resumeRawText" in fake.state.sync, false);
});

test("current synchronized resume data is migrated without data loss", async () => {
  const resumeStorage = loadResumeStorage();
  const profile = { personal: { name: "同步用户" } };
  const fake = createStorage({
    sync: {
      resumeProfile: profile,
      resumeImportRawText: "同步原始简历",
      resumeSchemaVersion: 6,
    },
  });

  const state = await resumeStorage.loadTemplateState(fake.storage);
  const saved = fake.state.local.resumeTemplates[state.activeTemplateId];

  assert.deepEqual(saved.profile, profile);
  assert.equal(saved.rawText, "同步原始简历");
  assert.equal(saved.schemaVersion, 6);
  assert.equal("resumeProfile" in fake.state.sync, false);
  assert.equal("resumeImportRawText" in fake.state.sync, false);
});

test("complete local templates are preferred without reading sync storage", async () => {
  const resumeStorage = loadResumeStorage();
  const localProfile = { personal: { name: "本地用户" } };
  const fake = createStorage({
    local: {
      resumeTemplates: {
        "tpl-a": {
          id: "tpl-a",
          name: "本地简历",
          profile: localProfile,
          rawText: "本地文本",
          schemaVersion: 4,
        },
      },
      activeResumeTemplateId: "tpl-a",
    },
    sync: {
      resumeProfile: { personal: { name: "过期同步用户" } },
      resumeImportRawText: "过期同步文本",
    },
  });

  const state = await resumeStorage.loadTemplateState(fake.storage);

  assert.equal(state.activeTemplateId, "tpl-a");
  assert.deepEqual(state.templates[0].profile, localProfile);
  assert.equal(fake.calls.syncGet, 0);
});

test("PDF text staging updates only the active template rawText and avoids sync", async () => {
  const resumeStorage = loadResumeStorage();
  const fake = createStorage();
  const longText = "PDF内容".repeat(15000);

  const state = await resumeStorage.loadTemplateState(fake.storage);
  const id = state.activeTemplateId;

  await resumeStorage.saveTemplateContent(id, { rawText: longText }, fake.storage);

  assert.equal(fake.state.local.resumeTemplates[id].rawText, longText);
  assert.equal(fake.calls.syncSet.length, 0);
});

test("multi-template CRUD: create, duplicate, rename, delete and switch active", async () => {
  const resumeStorage = loadResumeStorage();
  const fake = createStorage();

  const a = await resumeStorage.createTemplate("测开", fake.storage);
  const b = await resumeStorage.createTemplate("游戏开发", fake.storage);
  assert.ok(a.id && b.id);
  assert.notEqual(a.id, b.id);
  assert.equal(a.name, "测开");
  assert.equal(b.name, "游戏开发");

  const state1 = await resumeStorage.loadTemplateState(fake.storage);
  const names1 = state1.templates.map((template) => template.name);
  assert.ok(names1.includes("测开"));
  assert.ok(names1.includes("游戏开发"));

  const dup = await resumeStorage.duplicateTemplate(a.id, fake.storage);
  assert.equal(dup.name, "测开 副本");
  assert.deepEqual(dup.profile, a.profile);
  assert.notEqual(dup.id, a.id);

  await resumeStorage.renameTemplate(b.id, "客户端开发", fake.storage);
  const state2 = await resumeStorage.loadTemplateState(fake.storage);
  const renamed = state2.templates.find((template) => template.id === b.id);
  assert.equal(renamed.name, "客户端开发");

  await resumeStorage.setActiveTemplateId(b.id, fake.storage);
  const activeAfterDelete = await resumeStorage.deleteTemplate(b.id, fake.storage);
  assert.notEqual(activeAfterDelete, b.id);

  const state3 = await resumeStorage.loadTemplateState(fake.storage);
  assert.equal(state3.templates.some((template) => template.id === b.id), false);
  assert.ok(state3.templates.length >= 1);
});

test("export and import round-trips all templates and the active id", async () => {
  const resumeStorage = loadResumeStorage();
  const fake = createStorage();

  await resumeStorage.createTemplate("测开", fake.storage);
  const b = await resumeStorage.createTemplate("游戏开发", fake.storage);
  await resumeStorage.setActiveTemplateId(b.id, fake.storage);
  await resumeStorage.saveTemplateContent(
    b.id,
    { profile: { personal: { fullName: "张三" } }, rawText: "原文", schemaVersion: 4 },
    fake.storage
  );

  const payload = await resumeStorage.exportTemplateData(fake.storage);
  assert.equal(payload.kind, "resume-templates");
  assert.equal(payload.activeTemplateId, b.id);
  assert.ok(payload.templates.some((template) => template.name === "测开"));
  assert.ok(
    payload.templates.some(
      (template) =>
        template.name === "游戏开发" &&
        template.profile.personal.fullName === "张三"
    )
  );

  const fake2 = createStorage();
  const result = await resumeStorage.importTemplateData(payload, fake2.storage);
  assert.equal(result.activeTemplateId, b.id);
  const restored = result.templates.find((template) => template.id === b.id);
  assert.equal(restored.name, "游戏开发");
  assert.equal(restored.profile.personal.fullName, "张三");
});

test("import rejects malformed data and falls back to a default template", async () => {
  const resumeStorage = loadResumeStorage();
  const fake = createStorage();

  await assert.rejects(
    () => resumeStorage.importTemplateData({}, fake.storage),
    /templates/
  );

  const result = await resumeStorage.importTemplateData(
    { templates: [] },
    fake.storage
  );
  assert.equal(result.templates.length, 1);
  assert.equal(result.activeTemplateId, result.templates[0].id);
});

test("both resume entry points use the shared local storage helper", () => {
  const popupHtml = fs.readFileSync(path.join(__dirname, "../popup.html"), "utf8");
  const editorHtml = fs.readFileSync(
    path.join(__dirname, "../resume-editor.html"),
    "utf8"
  );
  const popupSource = fs.readFileSync(path.join(__dirname, "../popup.js"), "utf8");
  const editorSource = fs.readFileSync(
    path.join(__dirname, "../resume-editor.js"),
    "utf8"
  );

  assert.ok(
    popupHtml.indexOf("shared/resume-storage.js") < popupHtml.indexOf("popup.js")
  );
  assert.ok(
    editorHtml.indexOf("shared/resume-storage.js") <
      editorHtml.indexOf("resume-editor.js")
  );

  for (const source of [popupSource, editorSource]) {
    assert.match(source, /resumeStorage\.saveTemplateContent\(/);
    assert.match(source, /resumeStorage\.loadTemplateState\(/);
    assert.doesNotMatch(
      source,
      /chrome\.storage\.sync\.set\(\s*\{\s*\[RESUME_(?:PROFILE|IMPORT_RAW_TEXT)_KEY\]/
    );
  }
});
