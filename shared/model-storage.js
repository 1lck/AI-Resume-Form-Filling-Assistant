(function initResumeModelStorage(root) {
  "use strict";

  const keys = Object.freeze({
    models: "aiModels",
    builtinOverride: "builtinModelOverride",
    activeModelId: "activeModelId",
  });

  const legacyKeys = Object.freeze([
    keys.models,
    keys.builtinOverride,
    keys.activeModelId,
    "baseUrl",
    "apiKey",
    "model",
  ]);

  const DEFAULT_MODEL = Object.freeze({
    id: "builtin-deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "",
    model: "deepseek-chat",
    builtin: true,
  });

  function getStorage(storageOverride) {
    const storage = storageOverride || root?.chrome?.storage;
    if (!storage?.local?.get || !storage?.local?.set) {
      throw new Error("扩展本地存储不可用");
    }
    return storage;
  }

  function hasOwn(data, key) {
    return Object.prototype.hasOwnProperty.call(data || {}, key);
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function normalizeModel(model, fallbackId = "") {
    if (!model || typeof model !== "object") return null;

    const id = text(model.id) || fallbackId;
    if (!id) return null;

    return {
      id,
      name: text(model.name) || "自定义模型",
      baseUrl: text(model.baseUrl),
      apiKey: text(model.apiKey),
      model: text(model.model),
      builtin: Boolean(model.builtin),
    };
  }

  function normalizeModels(value) {
    if (!Array.isArray(value)) return [];

    const seen = new Set();
    return value
      .map((model) => normalizeModel(model))
      .filter((model) => {
        if (!model || seen.has(model.id)) return false;
        seen.add(model.id);
        return model.id !== DEFAULT_MODEL.id;
      });
  }

  function buildBuiltinModel(override) {
    const normalized = normalizeModel({
      ...DEFAULT_MODEL,
      ...(override && typeof override === "object" ? override : {}),
      id: DEFAULT_MODEL.id,
      builtin: true,
    });

    return normalized || { ...DEFAULT_MODEL };
  }

  function validateBaseUrl(value) {
    let parsed;
    try {
      parsed = new URL(text(value));
    } catch (_) {
      throw new Error("Base URL 不是有效地址");
    }

    const isLocalDevelopmentHost = ["localhost", "127.0.0.1", "::1"].includes(
      parsed.hostname
    );
    if (
      parsed.protocol !== "https:" &&
      !(parsed.protocol === "http:" && isLocalDevelopmentHost)
    ) {
      throw new Error("Base URL 必须使用 HTTPS（本机开发地址可使用 HTTP）");
    }
    return true;
  }

  async function removeIfAvailable(area, values) {
    if (!area?.remove) return;
    try {
      await area.remove(values);
    } catch (error) {
      console.warn("[model-storage] 清理旧版模型配置失败", error);
    }
  }

  async function loadModelState(storageOverride) {
    const storage = getStorage(storageOverride);
    const localData = await storage.local.get([
      keys.models,
      keys.builtinOverride,
      keys.activeModelId,
    ]);

    let models = normalizeModels(localData[keys.models]);
    let builtinOverride =
      localData[keys.builtinOverride] &&
      typeof localData[keys.builtinOverride] === "object"
        ? localData[keys.builtinOverride]
        : null;
    let activeModelId = text(localData[keys.activeModelId]);

    if (!hasOwn(localData, keys.models)) {
      const syncData = storage.sync?.get
        ? await storage.sync.get([...legacyKeys])
        : {};

      models = normalizeModels(syncData[keys.models]);
      builtinOverride =
        syncData[keys.builtinOverride] &&
        typeof syncData[keys.builtinOverride] === "object"
          ? syncData[keys.builtinOverride]
          : null;
      activeModelId = text(syncData[keys.activeModelId]);

      if (models.length === 0 && syncData.apiKey) {
        models = [
          normalizeModel({
            id: `custom-${Date.now()}`,
            name: "自定义模型",
            baseUrl: syncData.baseUrl || DEFAULT_MODEL.baseUrl,
            apiKey: syncData.apiKey,
            model: syncData.model || DEFAULT_MODEL.model,
            builtin: false,
          }),
        ].filter(Boolean);
      }

      await storage.local.set({
        [keys.models]: models,
        [keys.builtinOverride]: builtinOverride || null,
        [keys.activeModelId]: activeModelId || DEFAULT_MODEL.id,
      });
      await removeIfAvailable(storage.sync, legacyKeys);

      activeModelId = activeModelId || DEFAULT_MODEL.id;
    } else if (!activeModelId) {
      activeModelId = DEFAULT_MODEL.id;
      await storage.local.set({ [keys.activeModelId]: activeModelId });
    }

    return {
      models,
      builtinOverride,
      activeModelId,
    };
  }

  async function saveModelState(
    { models = [], builtinOverride = null } = {},
    storageOverride
  ) {
    const storage = getStorage(storageOverride);
    await storage.local.set({
      [keys.models]: normalizeModels(models),
      [keys.builtinOverride]:
        builtinOverride && typeof builtinOverride === "object"
          ? builtinOverride
          : null,
    });
  }

  async function saveActiveModelId(modelId, storageOverride) {
    const storage = getStorage(storageOverride);
    await storage.local.set({
      [keys.activeModelId]: text(modelId) || DEFAULT_MODEL.id,
    });
  }

  async function getModelConfig(modelId, storageOverride) {
    const state = await loadModelState(storageOverride);
    const builtin = buildBuiltinModel(state.builtinOverride);
    const model =
      [builtin, ...state.models].find((item) => item.id === text(modelId)) ||
      builtin;

    return {
      baseUrl: model.baseUrl,
      apiKey: model.apiKey,
      model: model.model,
    };
  }

  root.ResumeModelStorage = Object.freeze({
    DEFAULT_MODEL,
    keys,
    buildBuiltinModel,
    getModelConfig,
    loadModelState,
    normalizeModel,
    normalizeModels,
    saveActiveModelId,
    saveModelState,
    validateBaseUrl,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
