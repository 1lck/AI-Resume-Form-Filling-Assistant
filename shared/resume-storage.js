(function initResumeStorage(root) {
  "use strict";

  const keys = Object.freeze({
    profile: "resumeProfile",
    schemaVersion: "resumeSchemaVersion",
    rawText: "resumeImportRawText",
    legacyProfile: "resumeStructured",
    legacyRawText: "resumeRawText",
  });

  const resumeKeys = [keys.profile, keys.schemaVersion, keys.rawText];
  const legacyKeys = [keys.legacyProfile, keys.legacyRawText];
  const allKeys = [...resumeKeys, ...legacyKeys];

  function hasOwn(data, key) {
    return Object.prototype.hasOwnProperty.call(data || {}, key);
  }

  function pickStoredValue(candidates) {
    for (const candidate of candidates) {
      if (hasOwn(candidate.data, candidate.key)) {
        return {
          found: true,
          value: candidate.data[candidate.key],
          area: candidate.area,
          key: candidate.key,
        };
      }
    }

    return { found: false, value: undefined, area: "", key: "" };
  }

  function getStorage(storageOverride) {
    const storage = storageOverride || root?.chrome?.storage;
    if (!storage?.local?.get || !storage?.local?.set) {
      throw new Error("扩展本地存储不可用");
    }
    return storage;
  }

  async function removeIfAvailable(area, keysToRemove) {
    if (!area?.remove) return;
    try {
      await area.remove(keysToRemove);
    } catch (error) {
      console.warn("[resume-storage] 清理旧版同步简历数据失败", error);
    }
  }

  async function cleanupLegacyData(storageOverride, keysToRemove = allKeys) {
    const storage = getStorage(storageOverride);
    await removeIfAvailable(storage.sync, keysToRemove);
  }

  async function loadResumeData(storageOverride) {
    const storage = getStorage(storageOverride);
    const localData = await storage.local.get(allKeys);

    const localHasProfile =
      hasOwn(localData, keys.profile) || hasOwn(localData, keys.legacyProfile);
    const localHasRawText =
      hasOwn(localData, keys.rawText) || hasOwn(localData, keys.legacyRawText);
    const localHasSchemaVersion = hasOwn(localData, keys.schemaVersion);
    const needsSyncFallback =
      !localHasProfile || !localHasRawText || !localHasSchemaVersion;
    const syncData =
      needsSyncFallback && storage.sync?.get
        ? await storage.sync.get(allKeys)
        : {};

    const profileEntry = pickStoredValue([
      { data: localData, key: keys.profile, area: "local" },
      { data: localData, key: keys.legacyProfile, area: "local-legacy" },
      { data: syncData, key: keys.profile, area: "sync" },
      { data: syncData, key: keys.legacyProfile, area: "sync-legacy" },
    ]);
    const rawTextEntry = pickStoredValue([
      { data: localData, key: keys.rawText, area: "local" },
      { data: localData, key: keys.legacyRawText, area: "local-legacy" },
      { data: syncData, key: keys.rawText, area: "sync" },
      { data: syncData, key: keys.legacyRawText, area: "sync-legacy" },
    ]);
    const schemaVersionEntry = pickStoredValue([
      { data: localData, key: keys.schemaVersion, area: "local" },
      { data: syncData, key: keys.schemaVersion, area: "sync" },
    ]);

    const migration = {};
    if (!hasOwn(localData, keys.profile) && profileEntry.found) {
      migration[keys.profile] = profileEntry.value;
    }
    if (!hasOwn(localData, keys.rawText) && rawTextEntry.found) {
      migration[keys.rawText] = rawTextEntry.value;
    }
    if (!hasOwn(localData, keys.schemaVersion) && schemaVersionEntry.found) {
      migration[keys.schemaVersion] = schemaVersionEntry.value;
    }

    if (Object.keys(migration).length > 0) {
      await storage.local.set(migration);
      await removeIfAvailable(storage.local, legacyKeys);
      await cleanupLegacyData(storage);
    }

    return {
      profile:
        profileEntry.found && profileEntry.value && typeof profileEntry.value === "object"
          ? profileEntry.value
          : {},
      rawText: rawTextEntry.found ? String(rawTextEntry.value || "") : "",
      schemaVersion: schemaVersionEntry.found ? schemaVersionEntry.value : undefined,
    };
  }

  async function saveResumeData(
    { profile, schemaVersion, rawText },
    storageOverride
  ) {
    const storage = getStorage(storageOverride);
    await storage.local.set({
      [keys.profile]: profile && typeof profile === "object" ? profile : {},
      [keys.schemaVersion]: schemaVersion,
      [keys.rawText]: String(rawText || ""),
    });
    await removeIfAvailable(storage.local, legacyKeys);
    await cleanupLegacyData(storage);
  }

  async function saveRawText(rawText, storageOverride) {
    const storage = getStorage(storageOverride);
    await storage.local.set({ [keys.rawText]: String(rawText || "") });
    await removeIfAvailable(storage.local, [keys.legacyRawText]);
    await cleanupLegacyData(storage, [keys.rawText, keys.legacyRawText]);
  }

  root.ResumeStorage = Object.freeze({
    keys,
    loadResumeData,
    saveResumeData,
    saveRawText,
    cleanupLegacyData,
  });
})(typeof window !== "undefined" ? window : globalThis);
