const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadModelStorage() {
  const source = fs.readFileSync(
    path.join(__dirname, "../shared/model-storage.js"),
    "utf8"
  );
  const context = { window: {}, console, URL };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.ResumeModelStorage;
}

function createStorage({ local = {}, sync = {} } = {}) {
  const state = { local: { ...local }, sync: { ...sync } };
  const calls = { syncRemove: [] };

  function createArea(name) {
    return {
      async get(keys) {
        return Object.fromEntries(
          keys
            .filter((key) => Object.prototype.hasOwnProperty.call(state[name], key))
            .map((key) => [key, state[name][key]])
        );
      },
      async set(values) {
        Object.assign(state[name], values);
      },
      async remove(keys) {
        if (name === "sync") calls.syncRemove.push(keys);
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

test("model credentials are saved only in local storage", async () => {
  const storage = loadModelStorage();
  const fake = createStorage();

  await storage.saveModelState(
    {
      models: [
        {
          id: "custom-test",
          name: "Test",
          baseUrl: "https://example.com/v1",
          apiKey: "secret",
          model: "test-model",
        },
      ],
    },
    fake.storage
  );

  assert.equal(fake.state.local.aiModels[0].apiKey, "secret");
  assert.equal("aiModels" in fake.state.sync, false);
});

test("legacy synchronized model configuration is migrated and removed", async () => {
  const storage = loadModelStorage();
  const fake = createStorage({
    sync: {
      baseUrl: "https://example.com/v1",
      apiKey: "legacy-secret",
      model: "legacy-model",
    },
  });

  const state = await storage.loadModelState(fake.storage);

  assert.equal(state.models.length, 1);
  assert.equal(state.models[0].apiKey, "legacy-secret");
  assert.equal(fake.state.local.aiModels[0].model, "legacy-model");
  assert.ok(fake.calls.syncRemove.length > 0);
  assert.equal("apiKey" in fake.state.sync, false);
});

test("model ids and records are normalized before use", () => {
  const storage = loadModelStorage();
  const models = storage.normalizeModels([
    { id: "a", name: " A ", baseUrl: " https://example.com ", apiKey: " k ", model: " m " },
    { id: "a", name: "duplicate" },
    { id: "builtin-deepseek", name: "spoof" },
    null,
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(models)), [
    {
      id: "a",
      name: "A",
      baseUrl: "https://example.com",
      apiKey: "k",
      model: "m",
      builtin: false,
    },
  ]);
});

test("only HTTPS and local development API URLs are accepted", () => {
  const storage = loadModelStorage();
  assert.equal(storage.validateBaseUrl("https://api.example.com/v1"), true);
  assert.equal(storage.validateBaseUrl("http://localhost:8787/v1"), true);
  assert.throws(
    () => storage.validateBaseUrl("http://api.example.com/v1"),
    /HTTPS/
  );
});
