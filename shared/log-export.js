(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.ResumeLogExport = api;
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function () {
    "use strict";

    const DB_NAME = "resume-log-export-db";
    const STORE_NAME = "handles";
    const PROJECT_ROOT_KEY = "project-root";
    const LOGS_DIR_NAME = "debug-logs";
    const MAX_LOG_FILES = 50;

    function compactText(value) {
      return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function sanitizeSegment(value, fallback = "unknown") {
      const text = compactText(value)
        .toLowerCase()
        .replace(/https?:\/\//g, "")
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      return text || fallback;
    }

    function formatFileTimestamp(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return "1970-01-01_00-00-00";
      }

      const pad = (num) => String(num).padStart(2, "0");
      return [
        date.getUTCFullYear(),
        "-",
        pad(date.getUTCMonth() + 1),
        "-",
        pad(date.getUTCDate()),
        "_",
        pad(date.getUTCHours()),
        "-",
        pad(date.getUTCMinutes()),
        "-",
        pad(date.getUTCSeconds()),
      ].join("");
    }

    function getHostFromUrl(url) {
      try {
        return new URL(String(url || "")).host || "unknown-host";
      } catch (_) {
        return "unknown-host";
      }
    }

    function sanitizeUrlForExport(value) {
      try {
        const url = new URL(String(value || ""));
        url.search = "";
        url.hash = "";
        return url.toString();
      } catch (_) {
        return "";
      }
    }

    function buildLogFileName(session) {
      const timestamp = formatFileTimestamp(session?.startedAt || Date.now());
      const host = sanitizeSegment(getHostFromUrl(session?.url || session?.tab?.url), "unknown-host");
      const title = sanitizeSegment(session?.title || session?.tab?.title, "resume-fill");
      const status = sanitizeSegment(session?.status, "unknown");
      return `${timestamp}_${host}_${title}-${status}.json`;
    }

    function createLogExportPayload(session) {
      const safeLogs = Array.isArray(session?.logs)
        ? session.logs.map((entry) => ({
            level: compactText(entry?.level) || "info",
            message: compactText(entry?.message),
            timestamp: entry?.timestamp || null,
          }))
        : [];

      return {
        sessionId: compactText(session?.id) || null,
        status: compactText(session?.status) || "unknown",
        startedAt: session?.startedAt || null,
        endedAt: session?.endedAt || null,
        exportedAt: new Date().toISOString(),
        errorMessage: session?.errorMessage || "",
        tab: {
          id: session?.tab?.id ?? null,
          url: sanitizeUrlForExport(session?.tab?.url),
          title: session?.tab?.title || "",
        },
        stats: {
          fieldCount: Number(session?.stats?.fieldCount || 0),
          mappedCount: Number(session?.stats?.mappedCount || 0),
          filledCount: Number(session?.stats?.filledCount || 0),
        },
        logs: safeLogs,
      };
    }

    function supportsDirectoryPicker() {
      return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
    }

    function openDb() {
      return new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
          reject(new Error("当前环境不支持 IndexedDB，无法保存目录授权"));
          return;
        }

        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error || new Error("打开目录授权数据库失败"));
      });
    }

    async function withStore(mode, handler) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);

        let result;
        try {
          result = handler(store);
        } catch (error) {
          reject(error);
          return;
        }

        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error("访问目录授权数据库失败"));
        };
      });
    }

    async function saveProjectRootHandle(handle) {
      await withStore("readwrite", (store) => {
        store.put(handle, PROJECT_ROOT_KEY);
      });
    }

    async function loadProjectRootHandle() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(PROJECT_ROOT_KEY);
        request.onsuccess = () => {
          db.close();
          resolve(request.result || null);
        };
        request.onerror = () => {
          db.close();
          reject(request.error || new Error("读取目录授权失败"));
        };
      });
    }

    async function clearProjectRootHandle() {
      await withStore("readwrite", (store) => {
        store.delete(PROJECT_ROOT_KEY);
      });
    }

    async function getPermissionState(handle, { request = false, mode = "readwrite" } = {}) {
      if (!handle || typeof handle.queryPermission !== "function") {
        return "prompt";
      }

      let state = await handle.queryPermission({ mode });
      if (state !== "granted" && request && typeof handle.requestPermission === "function") {
        state = await handle.requestPermission({ mode });
      }
      return state;
    }

    async function ensureLogsDirectoryHandle(rootHandle) {
      if (!rootHandle || typeof rootHandle.getDirectoryHandle !== "function") {
        throw new Error("未配置项目目录");
      }

      return rootHandle.getDirectoryHandle(LOGS_DIR_NAME, { create: true });
    }

    async function writeSessionLogFile(rootHandle, session) {
      const dirHandle = await ensureLogsDirectoryHandle(rootHandle);
      const fileName = buildLogFileName(session);
      const payload = createLogExportPayload(session);
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();

      try {
        await writable.write(JSON.stringify(payload, null, 2));
      } finally {
        await writable.close();
      }

      await pruneLogFiles(dirHandle);

      return {
        fileName,
        relativePath: `${LOGS_DIR_NAME}/${fileName}`,
      };
    }

    async function pruneLogFiles(dirHandle, maxFiles = MAX_LOG_FILES) {
      if (!dirHandle?.entries) return;

      const files = [];
      for await (const [name, entry] of dirHandle.entries()) {
        if (entry?.kind === "file" && name.endsWith(".json")) {
          files.push(name);
        }
      }

      files.sort();
      const staleFiles = files.slice(0, Math.max(0, files.length - maxFiles));
      for (const name of staleFiles) {
        await dirHandle.removeEntry(name);
      }
    }

    return {
      LOGS_DIR_NAME,
      buildLogFileName,
      createLogExportPayload,
      sanitizeUrlForExport,
      supportsDirectoryPicker,
      saveProjectRootHandle,
      loadProjectRootHandle,
      clearProjectRootHandle,
      getPermissionState,
      ensureLogsDirectoryHandle,
      writeSessionLogFile,
    };
  }
);
