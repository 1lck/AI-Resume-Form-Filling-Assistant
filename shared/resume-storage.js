(function initResumeStorage(root) {
  "use strict";

  const keys = Object.freeze({
    // 多模板存储
    templates: "resumeTemplates",
    activeTemplateId: "activeResumeTemplateId",
    // 旧版单模板 key（仅用于一次性迁移，迁移完成后清理）
    profile: "resumeProfile",
    schemaVersion: "resumeSchemaVersion",
    rawText: "resumeImportRawText",
    legacyProfile: "resumeStructured",
    legacyRawText: "resumeRawText",
  });

  const DEFAULT_TEMPLATE_ID = "tpl-default";
  const DEFAULT_TEMPLATE_NAME = "默认简历";

  const legacyResumeKeys = [keys.profile, keys.schemaVersion, keys.rawText];
  const legacyOldKeys = [keys.legacyProfile, keys.legacyRawText];
  const allLegacyKeys = [...legacyResumeKeys, ...legacyOldKeys];

  function hasOwn(data, key) {
    return Object.prototype.hasOwnProperty.call(data || {}, key);
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function makeId() {
    return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function clone(value) {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function getStorage(storageOverride) {
    const storage = storageOverride || root?.chrome?.storage;
    if (!storage?.local?.get || !storage?.local?.set) {
      throw new Error("扩展本地存储不可用");
    }
    return storage;
  }

  function isMeaningfulProfile(value) {
    return Boolean(
      value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        hasMeaningfulValue(value)
    );
  }

  function hasMeaningfulValue(value) {
    if (value == null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.some(hasMeaningfulValue);
    if (typeof value === "object") {
      return Object.values(value).some(hasMeaningfulValue);
    }
    return Boolean(value);
  }

  function pickStoredValue(candidates, { preferMeaningful = false } = {}) {
    let fallback = { found: false, value: undefined };
    for (const candidate of candidates) {
      if (hasOwn(candidate.data, candidate.key)) {
        const entry = { found: true, value: candidate.data[candidate.key] };
        if (!preferMeaningful || isMeaningfulProfile(entry.value)) return entry;
        fallback = entry;
      }
    }
    return fallback;
  }

  function normalizeTemplate(value, fallbackId) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const id = text(value.id) || fallbackId;
    if (!id) return null;

    const profile =
      value.profile &&
      typeof value.profile === "object" &&
      !Array.isArray(value.profile)
        ? value.profile
        : {};

    return {
      id,
      name: text(value.name) || DEFAULT_TEMPLATE_NAME,
      profile,
      rawText: text(value.rawText),
      schemaVersion: value.schemaVersion,
      createdAt: text(value.createdAt) || nowIso(),
      updatedAt: text(value.updatedAt) || nowIso(),
    };
  }

  function normalizeTemplateMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const seen = new Set();
    const result = [];
    for (const [id, template] of Object.entries(value)) {
      const normalized = normalizeTemplate(template, id);
      if (!normalized || seen.has(normalized.id)) continue;
      seen.add(normalized.id);
      result.push(normalized);
    }
    return result;
  }

  function toTemplateMap(templates) {
    const map = {};
    for (const template of templates || []) {
      map[template.id] = template;
    }
    return map;
  }

  function buildEmptyTemplate(id, name) {
    return {
      id: id || makeId(),
      name: text(name) || DEFAULT_TEMPLATE_NAME,
      profile: {},
      rawText: "",
      schemaVersion: undefined,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  async function removeIfAvailable(area, keysToRemove) {
    if (!area?.remove) return;
    try {
      await area.remove(keysToRemove);
    } catch (error) {
      console.warn("[resume-storage] 清理旧版简历数据失败", error);
    }
  }

  async function loadLegacyResumeData(storage) {
    const localData = await storage.local.get(allLegacyKeys);
    const needsSyncFallback =
      !isMeaningfulProfile(localData[keys.profile]) ||
      !hasOwn(localData, keys.rawText) ||
      !hasOwn(localData, keys.schemaVersion);
    const syncData =
      needsSyncFallback && storage.sync?.get
        ? await storage.sync.get(allLegacyKeys)
        : {};

    const profileEntry = pickStoredValue(
      [
        { data: localData, key: keys.profile },
        { data: localData, key: keys.legacyProfile },
        { data: syncData, key: keys.profile },
        { data: syncData, key: keys.legacyProfile },
      ],
      { preferMeaningful: true }
    );
    const rawTextEntry = pickStoredValue([
      { data: localData, key: keys.rawText },
      { data: localData, key: keys.legacyRawText },
      { data: syncData, key: keys.rawText },
      { data: syncData, key: keys.legacyRawText },
    ]);
    const schemaVersionEntry = pickStoredValue([
      { data: localData, key: keys.schemaVersion },
      { data: syncData, key: keys.schemaVersion },
    ]);

    return {
      profile:
        profileEntry.found &&
        profileEntry.value &&
        typeof profileEntry.value === "object"
          ? profileEntry.value
          : {},
      rawText: rawTextEntry.found ? String(rawTextEntry.value || "") : "",
      schemaVersion: schemaVersionEntry.found
        ? schemaVersionEntry.value
        : undefined,
    };
  }

  function persistTemplates(storage, templates, activeTemplateId) {
    return storage.local.set({
      [keys.templates]: toTemplateMap(templates),
      [keys.activeTemplateId]: activeTemplateId,
    });
  }

  async function loadTemplateState(storageOverride) {
    const storage = getStorage(storageOverride);
    const localData = await storage.local.get([
      keys.templates,
      keys.activeTemplateId,
      ...allLegacyKeys,
    ]);

    let templates = normalizeTemplateMap(localData[keys.templates]);
    let activeTemplateId = text(localData[keys.activeTemplateId]);

    // 旧版单模板 → 迁移为默认模板
    if (!hasOwn(localData, keys.templates)) {
      const legacy = await loadLegacyResumeData(storage);
      const migrated = buildEmptyTemplate(DEFAULT_TEMPLATE_ID, DEFAULT_TEMPLATE_NAME);
      migrated.profile = legacy.profile;
      migrated.rawText = legacy.rawText;
      migrated.schemaVersion = legacy.schemaVersion;
      templates = [migrated];
      activeTemplateId = DEFAULT_TEMPLATE_ID;
      await persistTemplates(storage, templates, activeTemplateId);
    }

    // 保证至少有一个模板
    if (templates.length === 0) {
      templates = [buildEmptyTemplate(DEFAULT_TEMPLATE_ID, DEFAULT_TEMPLATE_NAME)];
      activeTemplateId = DEFAULT_TEMPLATE_ID;
      await persistTemplates(storage, templates, activeTemplateId);
    }

    // 保证 active 指向存在的模板
    if (!templates.some((template) => template.id === activeTemplateId)) {
      activeTemplateId = templates[0].id;
      await storage.local.set({ [keys.activeTemplateId]: activeTemplateId });
    }

    // 清理旧 key
    await removeIfAvailable(storage.local, allLegacyKeys);
    await removeIfAvailable(storage.sync, allLegacyKeys);

    return { templates, activeTemplateId };
  }

  async function saveTemplateContent(id, content, storageOverride) {
    const storage = getStorage(storageOverride);
    const targetId = text(id);
    if (!targetId) return null;

    const state = await loadTemplateState(storage);
    const index = state.templates.findIndex(
      (template) => template.id === targetId
    );
    if (index === -1) {
      console.warn("[resume-storage] 保存内容时未找到模板:", targetId);
      return null;
    }

    const next = { ...state.templates[index] };
    if (content && typeof content === "object") {
      if (hasOwn(content, "profile")) {
        next.profile =
          content.profile &&
          typeof content.profile === "object" &&
          !Array.isArray(content.profile)
            ? content.profile
            : {};
      }
      if (hasOwn(content, "rawText")) {
        next.rawText = text(content.rawText);
      }
      if (hasOwn(content, "schemaVersion")) {
        next.schemaVersion = content.schemaVersion;
      }
    }
    next.updatedAt = nowIso();

    state.templates[index] = next;
    await persistTemplates(storage, state.templates, state.activeTemplateId);
    return next;
  }

  async function createTemplate(name, storageOverride) {
    const storage = getStorage(storageOverride);
    const state = await loadTemplateState(storage);
    const template = buildEmptyTemplate(makeId(), name || "新简历模板");
    await persistTemplates(storage, [...state.templates, template], state.activeTemplateId);
    return template;
  }

  async function duplicateTemplate(id, storageOverride) {
    const storage = getStorage(storageOverride);
    const state = await loadTemplateState(storage);
    const source = state.templates.find(
      (template) => template.id === text(id)
    );
    if (!source) throw new Error("要复制的模板不存在");

    const duplicate = buildEmptyTemplate(makeId(), `${source.name} 副本`);
    duplicate.profile = clone(source.profile || {});
    duplicate.rawText = source.rawText || "";
    duplicate.schemaVersion = source.schemaVersion;

    await persistTemplates(
      storage,
      [...state.templates, duplicate],
      state.activeTemplateId
    );
    return duplicate;
  }

  async function renameTemplate(id, name, storageOverride) {
    const storage = getStorage(storageOverride);
    const state = await loadTemplateState(storage);
    const targetId = text(id);
    const nextName = text(name);
    if (!nextName) throw new Error("模板名称不能为空");

    const templates = state.templates.map((template) =>
      template.id === targetId
        ? { ...template, name: nextName, updatedAt: nowIso() }
        : template
    );

    await persistTemplates(storage, templates, state.activeTemplateId);
    return templates.find((template) => template.id === targetId) || null;
  }

  async function deleteTemplate(id, storageOverride) {
    const storage = getStorage(storageOverride);
    const state = await loadTemplateState(storage);
    const targetId = text(id);

    let templates = state.templates.filter(
      (template) => template.id !== targetId
    );
    if (templates.length === 0) {
      templates = [buildEmptyTemplate(DEFAULT_TEMPLATE_ID, DEFAULT_TEMPLATE_NAME)];
    }

    let activeTemplateId = state.activeTemplateId;
    if (
      activeTemplateId === targetId ||
      !templates.some((template) => template.id === activeTemplateId)
    ) {
      activeTemplateId = templates[0].id;
    }

    await persistTemplates(storage, templates, activeTemplateId);
    return activeTemplateId;
  }

  async function setActiveTemplateId(id, storageOverride) {
    const storage = getStorage(storageOverride);
    const state = await loadTemplateState(storage);
    const targetId = text(id);
    if (!state.templates.some((template) => template.id === targetId)) {
      return state.activeTemplateId;
    }
    await storage.local.set({ [keys.activeTemplateId]: targetId });
    return targetId;
  }

  async function exportTemplateData(storageOverride) {
    const state = await loadTemplateState(storageOverride);
    return {
      app: "ai-resume-form-filling-assistant",
      kind: "resume-templates",
      version: 1,
      exportedAt: nowIso(),
      activeTemplateId: state.activeTemplateId,
      templates: state.templates,
    };
  }

  async function importTemplateData(data, storageOverride) {
    const storage = getStorage(storageOverride);

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("导入文件格式不正确：缺少 templates");
    }

    const rawTemplates = Array.isArray(data.templates)
      ? data.templates
      : data.templates && typeof data.templates === "object"
        ? Object.values(data.templates)
        : null;

    if (!rawTemplates) {
      throw new Error("导入文件格式不正确：缺少 templates");
    }

    let templates = rawTemplates
      .map((template, index) =>
        normalizeTemplate(
          template,
          typeof template?.id === "string" && template.id
            ? template.id
            : `tpl-import-${index}`
        )
      )
      .filter(Boolean);

    const seen = new Set();
    templates = templates.filter((template) => {
      if (seen.has(template.id)) return false;
      seen.add(template.id);
      return true;
    });

    if (templates.length === 0) {
      templates = [buildEmptyTemplate(DEFAULT_TEMPLATE_ID, DEFAULT_TEMPLATE_NAME)];
    }

    let activeTemplateId = text(data.activeTemplateId);
    if (!templates.some((template) => template.id === activeTemplateId)) {
      activeTemplateId = templates[0].id;
    }

    await persistTemplates(storage, templates, activeTemplateId);
    await removeIfAvailable(storage.local, allLegacyKeys);
    await removeIfAvailable(storage.sync, allLegacyKeys);

    return { templates, activeTemplateId };
  }

  root.ResumeStorage = Object.freeze({
    keys,
    DEFAULT_TEMPLATE_ID,
    loadTemplateState,
    saveTemplateContent,
    createTemplate,
    duplicateTemplate,
    renameTemplate,
    deleteTemplate,
    setActiveTemplateId,
    exportTemplateData,
    importTemplateData,
  });
})(typeof window !== "undefined" ? window : globalThis);
