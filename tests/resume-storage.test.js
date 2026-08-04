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

  await resumeStorage.saveResumeData(
    { profile, schemaVersion: 7, rawText: longText },
    fake.storage
  );

  assert.equal(fake.state.local.resumeImportRawText, longText);
  assert.deepEqual(fake.state.local.resumeProfile, profile);
  assert.equal(fake.state.local.resumeSchemaVersion, 7);
  assert.equal(fake.calls.syncSet.length, 0);
  assert.equal("resumeImportRawText" in fake.state.sync, false);
});

test("legacy synchronized resume data is migrated to local storage", async () => {
  const resumeStorage = loadResumeStorage();
  const profile = { personal: { name: "旧版用户" } };
  const fake = createStorage({
    sync: {
      resumeStructured: profile,
      resumeRawText: "旧版原始简历",
      resumeSchemaVersion: 3,
    },
  });

  const loaded = await resumeStorage.loadResumeData(fake.storage);

  assert.deepEqual(loaded.profile, profile);
  assert.equal(loaded.rawText, "旧版原始简历");
  assert.equal(loaded.schemaVersion, 3);
  assert.deepEqual(fake.state.local.resumeProfile, profile);
  assert.equal(fake.state.local.resumeImportRawText, "旧版原始简历");
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

  const loaded = await resumeStorage.loadResumeData(fake.storage);

  assert.deepEqual(loaded.profile, profile);
  assert.equal(loaded.rawText, "同步原始简历");
  assert.equal(loaded.schemaVersion, 6);
  assert.deepEqual(fake.state.local.resumeProfile, profile);
  assert.equal(fake.state.local.resumeImportRawText, "同步原始简历");
  assert.equal("resumeProfile" in fake.state.sync, false);
  assert.equal("resumeImportRawText" in fake.state.sync, false);
});

test("complete local resume data is preferred without reading sync storage", async () => {
  const resumeStorage = loadResumeStorage();
  const localProfile = { personal: { name: "本地用户" } };
  const fake = createStorage({
    local: {
      resumeProfile: localProfile,
      resumeImportRawText: "本地文本",
      resumeSchemaVersion: 4,
    },
    sync: {
      resumeProfile: { personal: { name: "过期同步用户" } },
      resumeImportRawText: "过期同步文本",
    },
  });

  const loaded = await resumeStorage.loadResumeData(fake.storage);

  assert.deepEqual(loaded.profile, localProfile);
  assert.equal(loaded.rawText, "本地文本");
  assert.equal(fake.calls.syncGet, 0);
});

test("an empty partial local profile does not hide legacy synchronized data", async () => {
  const resumeStorage = loadResumeStorage();
  const legacyProfile = { personal: { fullName: "旧版用户" } };
  const fake = createStorage({
    local: {
      resumeProfile: {},
      resumeImportRawText: "",
      resumeSchemaVersion: 4,
    },
    sync: {
      resumeProfile: legacyProfile,
      resumeImportRawText: "旧版文本",
      resumeSchemaVersion: 3,
    },
  });

  const loaded = await resumeStorage.loadResumeData(fake.storage);

  assert.deepEqual(loaded.profile, legacyProfile);
  assert.deepEqual(fake.state.local.resumeProfile, legacyProfile);
});

test("PDF text staging also avoids sync item quota", async () => {
  const resumeStorage = loadResumeStorage();
  const fake = createStorage();
  const longText = "PDF内容".repeat(15000);

  await resumeStorage.saveRawText(longText, fake.storage);

  assert.equal(fake.state.local.resumeImportRawText, longText);
  assert.equal(fake.calls.syncSet.length, 0);
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
    assert.match(source, /resumeStorage\.saveResumeData\(/);
    assert.match(source, /resumeStorage\.saveRawText\(/);
    assert.match(source, /resumeStorage\.loadResumeData\(/);
    assert.doesNotMatch(
      source,
      /chrome\.storage\.sync\.set\(\s*\{\s*\[RESUME_(?:PROFILE|IMPORT_RAW_TEXT)_KEY\]/
    );
  }
});
