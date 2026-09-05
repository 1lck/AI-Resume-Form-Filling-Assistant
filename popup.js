// Side panel logic: standardized resume editor + AI field mapping + deterministic fill.

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

const tabsEl = document.getElementById("tabs");
const tabFillEl = document.getElementById("tab-fill");
const tabResumeEl = document.getElementById("tab-resume");
const openResumeEditorBtn = document.getElementById("openResumeEditorBtn");
const resumeSummaryGridEl = document.getElementById("resumeSummaryGrid");

const fieldCountEl = document.getElementById("fieldCount");
const mappedCountEl = document.getElementById("mappedCount");
const filledCountEl = document.getElementById("filledCount");

const startFillBtn = document.getElementById("startFillBtn");
const startFillBtnText = document.getElementById("startFillBtnText");
const startIncrementalFillBtn = document.getElementById("startIncrementalFillBtn");
const startIncrementalFillBtnText = document.getElementById(
  "startIncrementalFillBtnText"
);
const startSelectionFillBtn = document.getElementById("startSelectionFillBtn");
const startSelectionFillBtnText = document.getElementById(
  "startSelectionFillBtnText"
);
const clearMappingCacheBtn = document.getElementById("clearMappingCacheBtn");
const fillTipEl = document.getElementById("fillTip");

const resumeNavEl = document.getElementById("resumeNav");
const resumeFormHost = document.getElementById("resumeFormHost");
const saveResumeBtn = document.getElementById("saveResumeBtn");
const reloadResumeBtn = document.getElementById("reloadResumeBtn");
const resumeImportTextEl = document.getElementById("resumeImportText");
const importResumeBtn = document.getElementById("importResumeBtn");
const uploadPdfBtn = document.getElementById("uploadPdfBtn");
const resumePdfFileEl = document.getElementById("resumePdfFile");

const fillTemplateSelect = document.getElementById("fillTemplateSelect");
const resumeTemplateSelect = document.getElementById("resumeTemplateSelect");
const newTemplateBtn = document.getElementById("newTemplateBtn");
const duplicateTemplateBtn = document.getElementById("duplicateTemplateBtn");
const renameTemplateBtn = document.getElementById("renameTemplateBtn");
const deleteTemplateBtn = document.getElementById("deleteTemplateBtn");
const exportTemplatesBtn = document.getElementById("exportTemplatesBtn");
const importTemplatesBtn = document.getElementById("importTemplatesBtn");
const importTemplatesFileEl = document.getElementById("importTemplatesFile");

const templateNameModal = document.getElementById("templateNameModal");
const templateNameModalTitle = document.getElementById("templateNameModalTitle");
const templateNameInput = document.getElementById("templateNameInput");
const templateNameStatus = document.getElementById("templateNameStatus");
const saveTemplateNameBtn = document.getElementById("saveTemplateNameBtn");
const closeTemplateNameBtn = document.getElementById("closeTemplateNameBtn");
const closeTemplateNameBackdrop = document.getElementById("closeTemplateNameBackdrop");

const logContent = document.getElementById("logContent");
const clearLogBtn = document.getElementById("clearLog");
const selectLogDirectoryBtn = document.getElementById("selectLogDirectoryBtn");
const logExportStatusEl = document.getElementById("logExportStatus");

const settingsModal = document.getElementById("settingsModal");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const closeSettingsBackdrop = document.getElementById("closeSettingsBackdrop");
const modelList = document.getElementById("modelList");
const addModelBtn = document.getElementById("addModelBtn");

const editModelModal = document.getElementById("editModelModal");
const closeEditBtn = document.getElementById("closeEditBtn");
const closeEditBackdrop = document.getElementById("closeEditBackdrop");
const editModalTitle = document.getElementById("editModalTitle");
const editNameInput = document.getElementById("editName");
const editBaseUrlInput = document.getElementById("editBaseUrl");
const editApiKeyInput = document.getElementById("editApiKey");
const editModelInput = document.getElementById("editModel");
const editStatus = document.getElementById("editStatus");
const saveModelBtn = document.getElementById("saveModelBtn");
const toggleEditApiKeyBtn = document.getElementById("toggleEditApiKey");

const schema = window.ResumeSchema;
if (!schema) {
  throw new Error("Resume schema is not available");
}

const resumeStorage = window.ResumeStorage;
if (!resumeStorage) {
  throw new Error("Resume storage is not available");
}

const modelStorage = window.ResumeModelStorage;
if (!modelStorage) {
  throw new Error("Model storage is not available");
}

const aiClient = window.ResumeAiClient;
if (!aiClient) {
  throw new Error("AI client is not available");
}

const resumePrompts = window.ResumePrompts;
if (!resumePrompts) {
  throw new Error("Resume prompts are not available");
}

const logExport = window.ResumeLogExport;
if (!logExport) {
  throw new Error("Resume log export is not available");
}

const logVisibility = window.ResumeLogVisibility;
if (!logVisibility) {
  throw new Error("Resume log visibility is not available");
}

const contentBridge = window.ResumeContentBridge;
if (!contentBridge) {
  throw new Error("Resume content bridge is not available");
}

const RESUME_TEMPLATES_KEY = resumeStorage.keys.templates;
const RESUME_ACTIVE_TEMPLATE_KEY = resumeStorage.keys.activeTemplateId;
const RESUME_LEGACY_PROFILE_KEY = resumeStorage.keys.profile;
const RESUME_LEGACY_RAW_TEXT_KEY = resumeStorage.keys.rawText;
const MAPPING_CACHE_KEY = "fieldMappingCacheV3";

const BUILTIN_MODEL = modelStorage.DEFAULT_MODEL;

let editingModelId = null;
let isFilling = false;
let isImporting = false;
let isResumeDirty = false;
let resumeProfile = schema.createEmptyResumeProfile();
let templates = [];
let activeTemplateId = null;
let isLoadingResume = false;
let templateNameMode = null;
const collapsedResumeSections = new Set();
let logProjectRootHandle = null;
let activeFillSession = null;

const FILL_ACTIONS = {
  overwritePage: {
    triggerText: "开始填充",
    runningText: "填充中...",
    statusText: "映射中...",
    startLog: "开始识别页面字段，准备进行 AI 字段映射...",
    doneLog: "填充完成",
    fillMode: "overwrite",
    scope: "page",
  },
  incrementalPage: {
    triggerText: "增量填入",
    runningText: "增量中...",
    statusText: "增量映射中...",
    startLog: "开始增量填入：已有内容的字段会自动跳过。",
    doneLog: "增量填入完成",
    fillMode: "incremental",
    scope: "page",
  },
  selection: {
    triggerText: "选区填入",
    runningText: "等待选区...",
    statusText: "等待选区...",
    startLog: "准备选区填入：请回到网页并拖拽框选要填写的区域。",
    doneLog: "选区填入完成",
    fillMode: "overwrite",
    scope: "selection",
  },
};

document.addEventListener("DOMContentLoaded", async () => {
  initTabs();
  initModalEvents();
  initLogExportEvents();
  initResumeEditorEvents();
  initTemplateEvents();
  await initModels();
  await refreshLogExportStatus();
  await loadResumeProfile();
  updateStartFillAvailability();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" && areaName !== "sync") return;
  if (
    !changes[RESUME_TEMPLATES_KEY] &&
    !changes[RESUME_ACTIVE_TEMPLATE_KEY] &&
    !changes[RESUME_LEGACY_PROFILE_KEY] &&
    !changes[RESUME_LEGACY_RAW_TEXT_KEY]
  ) {
    return;
  }

  if (isResumeDirty || isImporting || isFilling) {
    return;
  }

  loadResumeProfile().catch((error) => {
    console.error("[popup] 同步简历配置失败:", error);
  });
});

function initTabs() {
  tabsEl.addEventListener("click", (event) => {
    const tabBtn = event.target.closest(".tab");
    if (!tabBtn) return;
    switchTab(tabBtn.dataset.tab);
  });
}

if (openResumeEditorBtn) {
  openResumeEditorBtn.addEventListener("click", async () => {
    const url = chrome.runtime.getURL("resume-editor.html");
    await chrome.tabs.create({ url });
  });
}

function switchTab(tabKey) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabKey);
  });
  tabFillEl.classList.toggle("active", tabKey === "fill");
  tabResumeEl.classList.toggle("active", tabKey === "resume");
}

function initModalEvents() {
  openSettingsBtn.addEventListener("click", openModal);
  closeSettingsBtn.addEventListener("click", closeModal);
  closeSettingsBackdrop.addEventListener("click", closeModal);
  addModelBtn.addEventListener("click", () => openEditModal());
  closeEditBtn.addEventListener("click", closeEditModal);
  closeEditBackdrop.addEventListener("click", closeEditModal);

  toggleEditApiKeyBtn.addEventListener("click", () => {
    const nextType = editApiKeyInput.type === "password" ? "text" : "password";
    editApiKeyInput.type = nextType;
    toggleEditApiKeyBtn.style.opacity = nextType === "text" ? "1" : "0.6";
  });
}

function initLogExportEvents() {
  selectLogDirectoryBtn.addEventListener("click", async () => {
    if (!logExport.supportsDirectoryPicker()) {
      addLog("error", "当前浏览器不支持项目目录写入");
      return;
    }

    selectLogDirectoryBtn.disabled = true;
    try {
      const rootHandle = await window.showDirectoryPicker({
        id: "resume-log-project-root",
        mode: "readwrite",
      });

      const permission = await logExport.getPermissionState(rootHandle, {
        request: true,
      });
      if (permission !== "granted") {
        throw new Error("目录写入权限未授予");
      }

      await logExport.ensureLogsDirectoryHandle(rootHandle);
      await logExport.saveProjectRootHandle(rootHandle);
      logProjectRootHandle = rootHandle;
      await refreshLogExportStatus();
      addLog(
        "success",
        `诊断日志将自动保存到 ${rootHandle.name}/${logExport.LOGS_DIR_NAME}/`
      );
    } catch (error) {
      if (error?.name === "AbortError") {
        addLog("info", "已取消选择项目目录");
      } else {
        addLog("error", `设置日志目录失败：${error.message}`);
      }
    } finally {
      selectLogDirectoryBtn.disabled = false;
    }
  });
}

async function refreshLogExportStatus() {
  if (!logExport.supportsDirectoryPicker()) {
    logProjectRootHandle = null;
    selectLogDirectoryBtn.disabled = true;
    selectLogDirectoryBtn.textContent = "不支持目录写入";
    logExportStatusEl.textContent =
      "当前浏览器不支持项目目录自动写入。你仍然可以在侧边栏里查看运行日志。";
    return;
  }

  selectLogDirectoryBtn.disabled = false;

  let handle = null;
  try {
    handle = await logExport.loadProjectRootHandle();
  } catch (error) {
    logProjectRootHandle = null;
    selectLogDirectoryBtn.textContent = "选择项目目录";
    logExportStatusEl.textContent = `读取日志目录配置失败：${error.message}`;
    return;
  }

  if (!handle) {
    logProjectRootHandle = null;
    selectLogDirectoryBtn.textContent = "选择项目目录";
    logExportStatusEl.textContent =
      "未配置自动导出。点击“选择项目目录”后，填充诊断日志会自动保存到所选目录下的 debug-logs/。";
    return;
  }

  const permission = await logExport.getPermissionState(handle);
  if (permission !== "granted") {
    logProjectRootHandle = null;
    selectLogDirectoryBtn.textContent = "重新选择项目目录";
    logExportStatusEl.textContent =
      "之前记住的项目目录权限已失效。点击“重新选择项目目录”后，将继续自动保存到 debug-logs/。";
    return;
  }

  logProjectRootHandle = handle;
  selectLogDirectoryBtn.textContent = "重新选择项目目录";
  logExportStatusEl.textContent = `已配置自动导出：${handle.name}/${logExport.LOGS_DIR_NAME}/`;
}

function createFillSession(tab) {
  return {
    id: `fill-${Date.now()}`,
    startedAt: new Date().toISOString(),
    endedAt: null,
    status: "running",
    errorMessage: "",
    tab: {
      id: tab?.id ?? null,
      url: tab?.url || "",
      title: tab?.title || "",
    },
    stats: {
      fieldCount: 0,
      mappedCount: 0,
      filledCount: 0,
    },
    logs: [],
  };
}

function beginFillSession(tab) {
  activeFillSession = createFillSession(tab);
}

function recordSessionLog(level, message, timestamp) {
  if (!activeFillSession) return;
  activeFillSession.logs.push({
    level,
    message,
    timestamp,
  });
}

function recordFillSessionStats(fieldCount, mappedCount, filledCount) {
  if (!activeFillSession) return;
  activeFillSession.stats = {
    fieldCount: Number(fieldCount || 0),
    mappedCount: Number(mappedCount || 0),
    filledCount: Number(filledCount || 0),
  };
}

function getCurrentFillStats() {
  return {
    fieldCount: Number(fieldCountEl.textContent || 0),
    mappedCount: Number(mappedCountEl.textContent || 0),
    filledCount: Number(filledCountEl.textContent || 0),
  };
}

async function finalizeFillSession({ status, stats, errorMessage = "" } = {}) {
  if (!activeFillSession) return;

  const session = activeFillSession;
  activeFillSession = null;
  session.endedAt = new Date().toISOString();
  session.status = status || "unknown";
  session.errorMessage = errorMessage;
  session.stats = {
    ...session.stats,
    ...(stats || {}),
  };

  if (!logProjectRootHandle) {
    return;
  }

  try {
    const permission = await logExport.getPermissionState(logProjectRootHandle);
    if (permission !== "granted") {
      logProjectRootHandle = null;
      addLog(
        "warning",
        "项目目录授权已失效，本次未自动保存日志。请重新点击“选择项目目录”。"
      );
      await refreshLogExportStatus();
      return;
    }

    const saved = await logExport.writeSessionLogFile(logProjectRootHandle, session);
    addLog("info", `诊断日志已自动保存到 ${saved.relativePath}`);
  } catch (error) {
    addLog("error", `诊断日志保存失败：${error.message}`);
  }
}

function openModal() {
  settingsModal.classList.add("open");
  renderModelList();
}

function closeModal() {
  settingsModal.classList.remove("open");
}

function openEditModal(modelId = null) {
  editingModelId = modelId;
  editModelModal.classList.add("open");

  if (modelId) {
    editModalTitle.textContent = "编辑模型";
    loadModelForEdit(modelId);
    return;
  }

  editModalTitle.textContent = "添加模型";
  editNameInput.value = "DeepSeek";
  editBaseUrlInput.value = "https://api.deepseek.com/v1";
  editApiKeyInput.value = "";
  editModelInput.value = "deepseek-chat";
}

function closeEditModal() {
  editModelModal.classList.remove("open");
  editingModelId = null;
}

async function initModels() {
  await modelStorage.loadModelState();
}

async function getAllModels() {
  const state = await modelStorage.loadModelState();
  return [modelStorage.buildBuiltinModel(state.builtinOverride), ...state.models];
}

async function getActiveModel() {
  const state = await modelStorage.loadModelState();
  const models = await getAllModels();
  const activeId = state.activeModelId || BUILTIN_MODEL.id;
  return models.find((model) => model.id === activeId) || BUILTIN_MODEL;
}

async function renderModelList() {
  const models = await getAllModels();
  const state = await modelStorage.loadModelState();
  const activeId = state.activeModelId || BUILTIN_MODEL.id;

  modelList.innerHTML = models
    .map(
      (model) => `
        <div class="model-item ${model.id === activeId ? "active" : ""}" data-model-id="${escapeHtml(model.id)}">
          <input type="radio" name="activeModel" class="model-radio" value="${escapeHtml(model.id)}" ${
            model.id === activeId ? "checked" : ""
          }>
          <div class="model-info">
            <div class="model-name">
              ${escapeHtml(model.name)}
              ${model.builtin ? '<span class="model-badge">内置</span>' : ""}
            </div>
            <div class="model-meta">${escapeHtml(model.model)}</div>
          </div>
          <div class="model-actions">
              <button class="icon-btn edit-model-btn" data-model-id="${escapeHtml(model.id)}">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
            ${
              model.builtin
                ? ""
                : `<button class="icon-btn delete-model-btn" data-model-id="${escapeHtml(model.id)}">
                     <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                   </button>`
            }
          </div>
        </div>
      `
    )
    .join("");

  document.querySelectorAll(".model-item").forEach((item) => {
    item.addEventListener("click", async (event) => {
      if (
        event.target.closest(".edit-model-btn") ||
        event.target.closest(".delete-model-btn")
      ) {
        return;
      }

      const modelId = item.dataset.modelId;
      const model = models.find((entry) => entry.id === modelId);
      await modelStorage.saveActiveModelId(modelId);
      addLog("success", `已切换模型：${model?.name || modelId}`);
      closeModal();
    });
  });

  document.querySelectorAll(".model-radio").forEach((radio) => {
    radio.addEventListener("change", async (event) => {
      event.stopPropagation();
      await modelStorage.saveActiveModelId(event.target.value);
      renderModelList();
    });
  });

  document.querySelectorAll(".edit-model-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openEditModal(event.currentTarget.dataset.modelId);
    });
  });

  document.querySelectorAll(".delete-model-btn").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const modelId = event.currentTarget.dataset.modelId;
      if (!confirm("确定要删除这个模型吗？")) return;

      const state = await modelStorage.loadModelState();
      const modelsWithoutCurrent = state.models.filter(
        (model) => model.id !== modelId
      );

      await modelStorage.saveModelState({
        models: modelsWithoutCurrent,
        builtinOverride: state.builtinOverride,
      });
      if (state.activeModelId === modelId) {
        await modelStorage.saveActiveModelId(BUILTIN_MODEL.id);
      }
      renderModelList();
    });
  });
}

async function loadModelForEdit(modelId) {
  const models = await getAllModels();
  const model = models.find((item) => item.id === modelId);
  if (!model) return;

  editNameInput.value = model.name;
  editBaseUrlInput.value = model.baseUrl;
  editApiKeyInput.value = model.apiKey;
  editModelInput.value = model.model;
}

saveModelBtn.addEventListener("click", async () => {
  const name = editNameInput.value.trim();
  const baseUrl = editBaseUrlInput.value.trim();
  const apiKey = editApiKeyInput.value.trim();
  const model = editModelInput.value.trim();

  if (!name || !baseUrl || !apiKey || !model) {
    showEditStatus("error", "请填写所有配置项");
    return;
  }

  saveModelBtn.disabled = true;
  saveModelBtn.textContent = "保存中...";

  try {
    modelStorage.validateBaseUrl(baseUrl);
    const state = await modelStorage.loadModelState();
    const models = [...state.models];

    if (editingModelId === BUILTIN_MODEL.id) {
      await modelStorage.saveModelState({
        models,
        builtinOverride: { name, baseUrl, apiKey, model },
      });
    } else if (editingModelId) {
      const index = models.findIndex((item) => item.id === editingModelId);
      if (index !== -1) {
        models[index] = { ...models[index], name, baseUrl, apiKey, model };
      }
      await modelStorage.saveModelState({
        models,
        builtinOverride: state.builtinOverride,
      });
    } else {
      models.push({
        id: `custom-${Date.now()}`,
        name,
        baseUrl,
        apiKey,
        model,
        builtin: false,
      });
      await modelStorage.saveModelState({
        models,
        builtinOverride: state.builtinOverride,
      });
    }

    showEditStatus("success", "保存成功");
    setTimeout(() => {
      closeEditModal();
      renderModelList();
    }, 300);
  } catch (error) {
    console.error("[popup] 保存模型配置失败:", error);
    showEditStatus("error", `保存失败：${error.message}`);
  } finally {
    setTimeout(() => {
      saveModelBtn.disabled = false;
      saveModelBtn.textContent = "保存";
    }, 300);
  }
});

function showEditStatus(type, message) {
  editStatus.textContent = message;
  editStatus.className = `config-status ${type}`;
  setTimeout(() => {
    editStatus.textContent = "";
    editStatus.className = "config-status";
  }, 3000);
}

function isModelConfigured(model) {
  return Boolean(model?.baseUrl && model?.apiKey && model?.model);
}

function initResumeEditorEvents() {
  resumeNavEl.addEventListener("click", (event) => {
    const navBtn = event.target.closest("[data-resume-nav]");
    if (!navBtn) return;
    openResumeSection(navBtn.dataset.resumeNav, { scrollIntoView: true });
  });

  resumeFormHost.addEventListener("click", (event) => {
    const toggleBtn = event.target.closest("[data-section-toggle]");
    if (toggleBtn) {
      toggleResumeSection(toggleBtn.dataset.sectionToggle);
      return;
    }

    const addBtn = event.target.closest("[data-section-add]");
    if (addBtn) {
      addResumeListItem(addBtn.dataset.sectionAdd);
      return;
    }

    const removeBtn = event.target.closest("[data-section-remove]");
    if (removeBtn) {
      removeResumeListItem(
        removeBtn.dataset.sectionRemove,
        Number(removeBtn.dataset.itemIndex)
      );
    }
  });
}

function initTemplateEvents() {
  fillTemplateSelect.addEventListener("change", () => {
    switchActiveTemplate(fillTemplateSelect.value);
  });

  resumeTemplateSelect.addEventListener("change", () => {
    switchActiveTemplate(resumeTemplateSelect.value);
  });

  newTemplateBtn.addEventListener("click", () => openTemplateNameModal("create"));
  duplicateTemplateBtn.addEventListener("click", handleDuplicateTemplate);
  renameTemplateBtn.addEventListener("click", () => openTemplateNameModal("rename"));
  deleteTemplateBtn.addEventListener("click", handleDeleteTemplate);

  exportTemplatesBtn.addEventListener("click", handleExportTemplates);
  importTemplatesBtn.addEventListener("click", () => {
    importTemplatesFileEl.value = "";
    importTemplatesFileEl.click();
  });
  importTemplatesFileEl.addEventListener("change", handleImportTemplates);

  closeTemplateNameBtn.addEventListener("click", closeTemplateNameModal);
  closeTemplateNameBackdrop.addEventListener("click", closeTemplateNameModal);
  saveTemplateNameBtn.addEventListener("click", handleSaveTemplateName);
  templateNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleSaveTemplateName();
    }
  });
}

function renderTemplateSelectors() {
  const options = templates
    .map(
      (template) =>
        `<option value="${escapeHtml(template.id)}">${escapeHtml(
          template.name
        )}</option>`
    )
    .join("");

  fillTemplateSelect.innerHTML = options;
  resumeTemplateSelect.innerHTML = options;
  fillTemplateSelect.value = activeTemplateId;
  resumeTemplateSelect.value = activeTemplateId;
}

async function switchActiveTemplate(id) {
  if (!id || id === activeTemplateId) return;

  if (isResumeDirty) {
    await persistResumeProfile({ silent: true });
  }

  await resumeStorage.setActiveTemplateId(id);
  await loadResumeProfile();
  updateStartFillAvailability();
}

function openTemplateNameModal(mode) {
  templateNameMode = mode;

  if (mode === "rename") {
    const current = templates.find((template) => template.id === activeTemplateId);
    templateNameInput.value = current?.name || "";
    templateNameModalTitle.textContent = "重命名模板";
  } else {
    templateNameInput.value = "";
    templateNameModalTitle.textContent = "新建模板";
  }

  templateNameStatus.textContent = "";
  templateNameStatus.className = "config-status";
  templateNameModal.classList.add("open");
  setTimeout(() => templateNameInput.focus(), 50);
}

function closeTemplateNameModal() {
  templateNameModal.classList.remove("open");
  templateNameMode = null;
}

async function handleSaveTemplateName() {
  const name = templateNameInput.value.trim();
  if (!name) {
    templateNameStatus.textContent = "名称不能为空";
    templateNameStatus.className = "config-status error";
    return;
  }

  saveTemplateNameBtn.disabled = true;
  try {
    if (templateNameMode === "rename") {
      await resumeStorage.renameTemplate(activeTemplateId, name);
      templates = templates.map((template) =>
        template.id === activeTemplateId ? { ...template, name } : template
      );
      renderTemplateSelectors();
      addLog("success", "已重命名模板");
    } else {
      if (isResumeDirty) {
        await persistResumeProfile({ silent: true });
      }
      const template = await resumeStorage.createTemplate(name);
      await resumeStorage.setActiveTemplateId(template.id);
      await loadResumeProfile();
      updateStartFillAvailability();
      addLog("success", `已新建模板：${template.name}`);
    }
    closeTemplateNameModal();
  } catch (error) {
    templateNameStatus.textContent = error.message;
    templateNameStatus.className = "config-status error";
  } finally {
    saveTemplateNameBtn.disabled = false;
  }
}

async function handleExportTemplates() {
  const payload = await resumeStorage.exportTemplateData();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `简历模板备份-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  addLog("success", `已导出 ${payload.templates.length} 个简历模板`);
}

async function handleImportTemplates() {
  const file = importTemplatesFileEl.files?.[0];
  if (!file) return;

  if (!window.confirm("导入会覆盖当前所有简历模板，确定继续吗？")) {
    importTemplatesFileEl.value = "";
    return;
  }

  try {
    const text = await readFileAsText(file);
    const data = JSON.parse(text);
    const result = await resumeStorage.importTemplateData(data);
    await loadResumeProfile();
    updateStartFillAvailability();
    addLog("success", `已导入 ${result.templates.length} 个简历模板`);
  } catch (error) {
    addLog("error", `导入失败：${error.message}`);
  } finally {
    importTemplatesFileEl.value = "";
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsText(file);
  });
}

async function handleDuplicateTemplate() {
  if (isResumeDirty) {
    await persistResumeProfile({ silent: true });
  }

  try {
    const template = await resumeStorage.duplicateTemplate(activeTemplateId);
    await resumeStorage.setActiveTemplateId(template.id);
    await loadResumeProfile();
    updateStartFillAvailability();
    addLog("success", `已复制为模板：${template.name}`);
  } catch (error) {
    addLog("error", `复制失败：${error.message}`);
  }
}

async function handleDeleteTemplate() {
  if (templates.length <= 1) {
    addLog("warning", "至少保留一个模板");
    return;
  }

  const current = templates.find((template) => template.id === activeTemplateId);
  if (!window.confirm(`确定删除模板「${current?.name || ""}」吗？此操作不可恢复。`)) {
    return;
  }

  activeTemplateId = await resumeStorage.deleteTemplate(activeTemplateId);
  await loadResumeProfile();
  updateStartFillAvailability();
  addLog("success", "已删除模板");
}

function resetCollapsedResumeSections() {
  collapsedResumeSections.clear();
  schema.sections.forEach((section) => collapsedResumeSections.add(section.key));
}

async function loadResumeProfile() {
  if (isLoadingResume) return;
  isLoadingResume = true;

  try {
    const state = await resumeStorage.loadTemplateState();
    templates = state.templates;
    activeTemplateId = state.activeTemplateId;
    renderTemplateSelectors();

    const active = state.templates.find(
      (template) => template.id === state.activeTemplateId
    );
    resumeProfile = schema.normalizeResumeProfile(active?.profile || {});
    resumeImportTextEl.value = active?.rawText || "";
    resetCollapsedResumeSections();
    renderResumeEditor(resumeProfile);
    isResumeDirty = false;
    saveResumeBtn.disabled = true;
  } finally {
    isLoadingResume = false;
  }
}

function renderResumeEditor(profile) {
  const sectionStats = buildResumeSectionStats(profile);

  renderResumeSummary(sectionStats);
  renderResumeNav(sectionStats);
  resumeFormHost.innerHTML = "";

  for (const section of schema.sections) {
    const itemCount =
      section.type === "list" && Array.isArray(profile[section.key])
        ? profile[section.key].length
        : 0;
    const isCollapsed = collapsedResumeSections.has(section.key);
    const stats = sectionStats.get(section.key) || {
      totalFields: 0,
      filledFields: 0,
      itemCount,
      filledItems: 0,
    };
    const sectionEl = document.createElement("section");
    sectionEl.className = `resume-section${isCollapsed ? " is-collapsed" : ""}`;
    sectionEl.dataset.sectionKey = section.key;
    sectionEl.id = `resume-section-${section.key}`;

    const headEl = document.createElement("div");
    headEl.className = "resume-section-head";
    headEl.innerHTML = `
      <div class="resume-section-head-main">
        <button
          type="button"
          class="resume-section-toggle"
          data-section-toggle="${escapeHtml(section.key)}"
          aria-expanded="${isCollapsed ? "false" : "true"}"
        >
          <span class="resume-section-toggle-icon">▸</span>
          <span class="resume-section-heading">
            <span class="resume-section-title">${escapeHtml(section.label)}</span>
            <span class="resume-section-summary">${escapeHtml(
              createResumeSectionSummary(section, stats)
            )}</span>
          </span>
        </button>
        ${
          section.type === "list"
            ? `
              <div class="resume-section-actions">
                <button
                  type="button"
                  class="btn btn-outline btn-sm resume-section-action"
                  data-section-add="${escapeHtml(section.key)}"
                  ${itemCount >= section.slots ? "disabled" : ""}
                >
                  新增一条
                </button>
              </div>
            `
            : ""
        }
      </div>
      ${
        section.note
          ? `<div class="resume-section-note">${escapeHtml(section.note)}</div>`
          : ""
      }
    `;

    const bodyEl = document.createElement("div");
    bodyEl.className = "resume-section-body";

    if (section.type === "group") {
      bodyEl.appendChild(renderFieldGrid(section.fields, profile, section.key));
    } else {
      const items = Array.isArray(profile[section.key]) ? profile[section.key] : [];
      for (let slotIndex = 0; slotIndex < items.length; slotIndex += 1) {
        const slotEl = document.createElement("div");
        slotEl.className = "resume-slot";

        const slotHead = document.createElement("div");
        slotHead.className = "resume-slot-head";
        slotHead.innerHTML = `
          <div class="resume-slot-head-main">
            <div>
              <div class="resume-slot-title">${escapeHtml(
                `${section.itemLabel} ${slotIndex + 1}`
              )}</div>
              <div class="resume-slot-subtitle">${escapeHtml(
                `映射路径：${section.key}.${slotIndex}.*`
              )}</div>
            </div>
            ${
              items.length > Math.max(1, Number(section.initialItems) || 1)
                ? `
                  <button
                    type="button"
                    class="btn-text resume-slot-remove"
                    data-section-remove="${escapeHtml(section.key)}"
                    data-item-index="${slotIndex}"
                  >
                    删除
                  </button>
                `
                : ""
            }
          </div>
        `;

        slotEl.appendChild(slotHead);
        slotEl.appendChild(
          renderFieldGrid(section.fields, profile, `${section.key}.${slotIndex}`)
        );
        bodyEl.appendChild(slotEl);
      }
    }

    sectionEl.appendChild(headEl);
    sectionEl.appendChild(bodyEl);
    resumeFormHost.appendChild(sectionEl);
  }
}

function renderResumeSummary(sectionStats) {
  if (!resumeSummaryGridEl) return;

  resumeSummaryGridEl.innerHTML = "";

  for (const section of schema.sections) {
    const stats = sectionStats.get(section.key) || {
      totalFields: 0,
      filledFields: 0,
      itemCount: 0,
      filledItems: 0,
    };

    const card = document.createElement("div");
    card.className = "resume-summary-card";
    card.innerHTML = `
      <div class="resume-summary-title">${escapeHtml(section.label)}</div>
      <div class="resume-summary-meta">${escapeHtml(
        createResumeSectionSummary(section, stats)
      )}</div>
    `;
    resumeSummaryGridEl.appendChild(card);
  }
}

function renderResumeNav(sectionStats) {
  resumeNavEl.innerHTML = "";

  for (const section of schema.sections) {
    const stats = sectionStats.get(section.key) || {
      totalFields: 0,
      filledFields: 0,
      itemCount: 0,
      filledItems: 0,
    };
    const hasValue =
      section.type === "list" ? stats.filledItems > 0 : stats.filledFields > 0;
    const isCollapsed = collapsedResumeSections.has(section.key);
    const buttonEl = document.createElement("button");
    buttonEl.type = "button";
    buttonEl.className = `resume-nav-btn${hasValue ? " has-value" : ""}${
      isCollapsed ? "" : " is-expanded"
    }`;
    buttonEl.dataset.resumeNav = section.key;
    buttonEl.innerHTML = `
      <span class="resume-nav-label">${escapeHtml(section.label)}</span>
      <span class="resume-nav-meta">${escapeHtml(
        createResumeNavSummary(section, stats)
      )}</span>
    `;
    resumeNavEl.appendChild(buttonEl);
  }
}

function renderFieldGrid(fields, profile, prefix) {
  const gridEl = document.createElement("div");
  gridEl.className = "resume-fields-grid";

  for (const field of fields) {
    const path = `${prefix}.${field.key}`;
    const fieldEl = document.createElement("div");
    fieldEl.className = "resume-field";

    const labelEl = document.createElement("label");
    labelEl.className = "resume-field-label";
    labelEl.textContent = field.label;

    const control = createFieldControl(field, schema.getValueByPath(profile, path), path);
    fieldEl.appendChild(labelEl);
    fieldEl.appendChild(control);
    gridEl.appendChild(fieldEl);
  }

  return gridEl;
}

function createFieldControl(field, value, path) {
  let control;

  if (field.input === "textarea") {
    control = document.createElement("textarea");
    control.className = "resume-textarea";
  } else if (field.input === "select") {
    control = document.createElement("select");
    control.className = "resume-select";
    for (const optionValue of field.options || []) {
      const optionEl = document.createElement("option");
      optionEl.value = optionValue;
      optionEl.textContent = optionValue || "请选择";
      control.appendChild(optionEl);
    }
  } else {
    control = document.createElement("input");
    control.className = "resume-input";
    control.type = field.input === "date" ? "text" : field.input || "text";
  }

  control.dataset.resumePath = path;
  control.value = value == null ? "" : String(value);
  if (field.placeholder || field.input === "date") {
    control.placeholder = field.placeholder || "YYYY-MM 或 YYYY-MM-DD";
  }

  control.addEventListener("input", markResumeDirty);
  control.addEventListener("change", markResumeDirty);
  return control;
}

function markResumeDirty() {
  isResumeDirty = true;
  saveResumeBtn.disabled = false;
}

function hasMeaningfulResumeValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return true;
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some((item) => hasMeaningfulResumeValue(item));
  if (typeof value === "object") {
    return Object.values(value).some((item) => hasMeaningfulResumeValue(item));
  }
  return false;
}

function buildResumeSectionStats(profile) {
  const statsBySection = new Map();
  const catalog = schema.getCatalogWithValues(profile);

  for (const section of schema.sections) {
    const items = Array.isArray(profile[section.key]) ? profile[section.key] : [];
    statsBySection.set(section.key, {
      totalFields: 0,
      filledFields: 0,
      itemCount: items.length,
      filledItems: items.filter((item) => hasMeaningfulResumeValue(item)).length,
    });
  }

  for (const field of catalog) {
    const stats = statsBySection.get(field.sectionKey);
    if (!stats) continue;
    stats.totalFields += 1;
    if (field.hasValue) {
      stats.filledFields += 1;
    }
  }

  return statsBySection;
}

function createResumeSectionSummary(section, stats) {
  if (section.type === "list") {
    return `已添加 ${stats.itemCount} / ${section.slots} 条，已填写 ${stats.filledItems} 条`;
  }

  return `已填写 ${stats.filledFields} / ${stats.totalFields} 项`;
}

function createResumeNavSummary(section, stats) {
  if (section.type === "list") {
    return `${stats.filledItems}/${stats.itemCount} 条`;
  }

  return `${stats.filledFields}/${stats.totalFields} 项`;
}

function collectResumeProfileFromForm() {
  const nextProfile = schema.createEmptyResumeProfile();
  const controls = resumeFormHost.querySelectorAll("[data-resume-path]");

  controls.forEach((control) => {
    schema.setValueByPath(
      nextProfile,
      control.dataset.resumePath,
      String(control.value || "").trim()
    );
  });

  return schema.normalizeResumeProfile(nextProfile);
}

function syncResumeProfileFromForm() {
  resumeProfile = collectResumeProfileFromForm();
  return resumeProfile;
}

function applyResumeSectionState(sectionKey) {
  const sectionEl = resumeFormHost.querySelector(`[data-section-key="${sectionKey}"]`);
  const navBtn = resumeNavEl.querySelector(`[data-resume-nav="${sectionKey}"]`);
  const isCollapsed = collapsedResumeSections.has(sectionKey);

  if (sectionEl) {
    sectionEl.classList.toggle("is-collapsed", isCollapsed);
    const toggleBtn = sectionEl.querySelector("[data-section-toggle]");
    if (toggleBtn) {
      toggleBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    }
  }

  if (navBtn) {
    navBtn.classList.toggle("is-expanded", !isCollapsed);
  }
}

function toggleResumeSection(sectionKey) {
  if (!sectionKey) return;

  if (collapsedResumeSections.has(sectionKey)) {
    collapsedResumeSections.delete(sectionKey);
  } else {
    collapsedResumeSections.add(sectionKey);
  }

  applyResumeSectionState(sectionKey);
}

function openResumeSection(sectionKey, { scrollIntoView = false } = {}) {
  if (!sectionKey) return;

  collapsedResumeSections.delete(sectionKey);
  applyResumeSectionState(sectionKey);

  if (scrollIntoView) {
    const sectionEl = document.getElementById(`resume-section-${sectionKey}`);
    sectionEl?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function focusResumeField(path) {
  const control = resumeFormHost.querySelector(`[data-resume-path="${path}"]`);
  if (!control) return;

  control.focus();
  if (typeof control.select === "function") {
    control.select();
  }
}

function addResumeListItem(sectionKey) {
  const section = schema.getSectionDefinition(sectionKey);
  if (!section || section.type !== "list") return;

  const nextProfile = syncResumeProfileFromForm();
  const items = Array.isArray(nextProfile[sectionKey]) ? [...nextProfile[sectionKey]] : [];
  if (items.length >= section.slots) return;

  items.push(schema.createEmptyListItem(sectionKey));
  resumeProfile = schema.normalizeResumeProfile({
    ...nextProfile,
    [sectionKey]: items,
  });

  collapsedResumeSections.delete(sectionKey);
  renderResumeEditor(resumeProfile);
  markResumeDirty();

  const nextPath = `${sectionKey}.${items.length - 1}.${section.fields[0]?.key || ""}`;
  openResumeSection(sectionKey, { scrollIntoView: true });
  if (section.fields[0]?.key) {
    focusResumeField(nextPath);
  }
}

function removeResumeListItem(sectionKey, itemIndex) {
  const section = schema.getSectionDefinition(sectionKey);
  if (!section || section.type !== "list") return;

  const minItems = Math.max(1, Number(section.initialItems) || 1);
  const nextProfile = syncResumeProfileFromForm();
  const items = Array.isArray(nextProfile[sectionKey]) ? [...nextProfile[sectionKey]] : [];

  if (items.length <= minItems) return;
  if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= items.length) return;

  items.splice(itemIndex, 1);
  resumeProfile = schema.normalizeResumeProfile({
    ...nextProfile,
    [sectionKey]: items,
  });

  collapsedResumeSections.delete(sectionKey);
  renderResumeEditor(resumeProfile);
  markResumeDirty();
  openResumeSection(sectionKey);
}

async function persistResumeProfile({ silent = false } = {}) {
  const nextProfile = collectResumeProfileFromForm();

  resumeProfile = nextProfile;
  await resumeStorage.saveTemplateContent(activeTemplateId, {
    profile: nextProfile,
    schemaVersion: schema.version,
    rawText: resumeImportTextEl.value.trim(),
  });

  isResumeDirty = false;
  saveResumeBtn.disabled = true;
  updateStartFillAvailability();

  if (!silent) {
    addLog("success", "标准简历已保存");
  }
}

saveResumeBtn.addEventListener("click", async () => {
  await persistResumeProfile();
});

reloadResumeBtn.addEventListener("click", async () => {
  await loadResumeProfile();
  updateStartFillAvailability();
  addLog("info", "已从存储重新加载标准简历");
});

importResumeBtn.addEventListener("click", async () => {
  await importResumeToSchema(resumeImportTextEl.value.trim());
});

uploadPdfBtn.addEventListener("click", () => {
  resumePdfFileEl.value = "";
  resumePdfFileEl.click();
});

resumePdfFileEl.addEventListener("change", async () => {
  const file = resumePdfFileEl.files?.[0];
  if (!file) return;

  if (file.type && file.type !== "application/pdf") {
    addLog("error", "请选择 PDF 文件");
    return;
  }

  uploadPdfBtn.disabled = true;
  importResumeBtn.disabled = true;
  updateStatus("running", "解析 PDF 中...");
  addLog("info", `正在提取 PDF 文本：${file.name}`);

  try {
    const text = await extractTextFromPdf(file);
    if (!text) {
      throw new Error("未提取到文本：如果是扫描版 PDF，请先转为可复制文字或使用 OCR");
    }

    resumeImportTextEl.value = text;
    await resumeStorage.saveTemplateContent(activeTemplateId, { rawText: text });

    addLog("success", "PDF 文本提取完成，开始导入到标准简历...");
    await importResumeToSchema(text);
  } catch (error) {
    addLog("error", `PDF 导入失败：${error.message}`);
    updateStatus("error", "PDF 失败");
  } finally {
    uploadPdfBtn.disabled = false;
    importResumeBtn.disabled = false;
  }
});

async function importResumeToSchema(rawText) {
  if (isImporting) return;

  const text = String(rawText || "").trim();
  if (!text) {
    addLog("warning", "请先粘贴原始简历文本，或上传 PDF");
    return;
  }

  const activeModel = await getActiveModel();
  if (!isModelConfigured(activeModel)) {
    addLog("error", "请先在设置中配置模型");
    openModal();
    return;
  }

  isImporting = true;
  importResumeBtn.disabled = true;
  uploadPdfBtn.disabled = true;
  importResumeBtn.textContent = "导入中...";
  updateStatus("running", "导入中...");

  try {
    const prompt = resumePrompts.buildResumeImportPrompt(
      schema,
      limitTextForPrompt(text)
    );
    const aiText = await aiClient.callAI(activeModel.id, prompt, "resume_import");
    const parsed = parseJsonFromAiText(aiText);
    const normalized = schema.normalizeResumeProfile(parsed);

    resumeProfile = normalized;
    await resumeStorage.saveTemplateContent(activeTemplateId, {
      profile: normalized,
      schemaVersion: schema.version,
      rawText: text,
    });

    resetCollapsedResumeSections();
    renderResumeEditor(normalized);
    isResumeDirty = false;
    saveResumeBtn.disabled = true;
    updateStartFillAvailability();

    addLog("success", "导入完成：已预填到标准简历，请检查后使用");
    updateStatus("ready", "就绪");
  } catch (error) {
    addLog("error", `导入失败：${error.message}`);
    updateStatus("error", "导入失败");
  } finally {
    isImporting = false;
    importResumeBtn.disabled = false;
    uploadPdfBtn.disabled = false;
    importResumeBtn.textContent = "AI 导入到标准简历";
  }
}

function limitTextForPrompt(text) {
  const maxChars = 60000;
  if (text.length <= maxChars) return text;

  addLog(
    "warning",
    `文本过长（${text.length} 字），已截断前 ${maxChars} 字用于导入。`
  );
  return text.slice(0, maxChars);
}

async function extractTextFromPdf(file) {
  const pdfjs = getPdfJsLib();
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
      "libs/pdfjs/pdf.worker.min.js"
    );
  } catch (_) {
    // ignore
  }

  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  const total = pdf.numPages || 0;
  const parts = [];

  for (let pageNo = 1; pageNo <= total; pageNo += 1) {
    updateStatus("running", `解析 PDF (${pageNo}/${total})...`);
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();

    for (const item of content.items || []) {
      parts.push(item.str || "");
      parts.push(item.hasEOL ? "\n" : " ");
    }

    parts.push("\n\n");
  }

  return parts
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getPdfJsLib() {
  const lib = globalThis.pdfjsLib;
  if (!lib) {
    throw new Error("PDF 解析库未加载，请刷新扩展页面后重试");
  }
  return lib;
}

startFillBtn.addEventListener("click", async () => {
  await runFill("overwritePage");
});

startIncrementalFillBtn?.addEventListener("click", async () => {
  await runFill("incrementalPage");
});

startSelectionFillBtn?.addEventListener("click", async () => {
  await runFill("selection");
});

async function runFill(actionKey) {
  if (isFilling) return;

  const actionConfig = FILL_ACTIONS[actionKey];
  if (!actionConfig) {
    throw new Error(`未知填充动作：${actionKey}`);
  }

  if (isResumeDirty) {
    await persistResumeProfile({ silent: true });
  }

  if (!schema.hasAnyFilledField(resumeProfile)) {
    addLog("warning", "请先在“标准简历”里填写至少一个字段");
    switchTab("resume");
    return;
  }

  const activeModel = await getActiveModel();
  if (!isModelConfigured(activeModel)) {
    addLog("error", "请先在设置中配置模型");
    openModal();
    return;
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) {
    addLog("error", "无法获取当前标签页");
    return;
  }

  if (!tab.url) {
    addLog("error", "无法读取当前网页地址，请重新加载扩展后再试");
    updateStatus("error", "网页权限不可用");
    return;
  }

  if (!isSupportedWebPageUrl(tab.url)) {
    addLog("error", "请切换到要填写的网页（非系统页面）");
    updateStatus("error", "系统页面");
    return;
  }

  isFilling = true;
  updateFillActionButtons({ isRunning: true, runningActionKey: actionKey });
  fillTipEl.hidden = true;
  updateStatus("running", actionConfig.statusText);
  beginFillSession(tab);
  addLog("info", actionConfig.startLog);

  try {
    const injected = await ensureContentScriptInjected(tab.id);
    if (!injected) {
      throw new Error("当前页面仍在运行旧版插件脚本。这通常发生在刚重载扩展后；刷新当前页面一次后再重试即可");
    }

    const modelId = activeModel.id;
    const response = await sendTabMessage(tab.id, {
      action: "startFill",
      modelId,
      resumeProfile,
      fillMode: actionConfig.fillMode,
      scope: actionConfig.scope,
    });

    if (!response?.success) {
      if (response?.canceled) {
        addLog("info", response.message || "已取消本次操作");
        updateStatus("ready", "已取消");
        await finalizeFillSession({
          status: "canceled",
          stats: getCurrentFillStats(),
          errorMessage: response.message || "",
        });
        return;
      }
      throw new Error(response?.message || "填充失败");
    }

    updateFillStats(
      response.fieldCount || 0,
      response.mappedCount || 0,
      response.filledCount || 0
    );

    fillTipEl.textContent = buildFillTipText(actionKey, response.cacheHit);
    fillTipEl.hidden = false;

    addLog(
      "success",
      `${actionConfig.doneLog}：识别 ${response.fieldCount} 个字段，映射 ${response.mappedCount} 个，成功填充 ${response.filledCount} 个。`
    );
    updateStatus("ready", "完成");
    await finalizeFillSession({
      status: "success",
      stats: {
        fieldCount: response.fieldCount || 0,
        mappedCount: response.mappedCount || 0,
        filledCount: response.filledCount || 0,
      },
    });
  } catch (error) {
    addLog("error", `填充失败：${error.message}`);
    updateStatus("error", "失败");
    await finalizeFillSession({
      status: "error",
      stats: getCurrentFillStats(),
      errorMessage: error.message,
    });
  } finally {
    isFilling = false;
    updateStartFillAvailability();
  }
}

clearMappingCacheBtn.addEventListener("click", async () => {
  await chrome.storage.local.remove(MAPPING_CACHE_KEY);
  addLog("success", "字段映射缓存已清空");
  fillTipEl.hidden = true;
});

function updateFillStats(fieldCount, mappedCount, filledCount) {
  fieldCountEl.textContent = fieldCount;
  mappedCountEl.textContent = mappedCount;
  filledCountEl.textContent = filledCount;
  recordFillSessionStats(fieldCount, mappedCount, filledCount);
}

function updateStartFillAvailability() {
  const hasData = schema.hasAnyFilledField(resumeProfile);
  updateFillActionButtons({ hasData, isRunning: isFilling });
}

function updateFillActionButtons({
  hasData = schema.hasAnyFilledField(resumeProfile),
  isRunning = isFilling,
  runningActionKey = "",
} = {}) {
  const buttonMap = [
    {
      key: "overwritePage",
      button: startFillBtn,
      labelEl: startFillBtnText,
    },
    {
      key: "incrementalPage",
      button: startIncrementalFillBtn,
      labelEl: startIncrementalFillBtnText,
    },
    {
      key: "selection",
      button: startSelectionFillBtn,
      labelEl: startSelectionFillBtnText,
    },
  ];

  for (const item of buttonMap) {
    if (!item.button || !item.labelEl) continue;
    const config = FILL_ACTIONS[item.key];
    const isCurrent = runningActionKey === item.key;
    item.button.disabled = !hasData || isRunning;
    if (!hasData) {
      item.labelEl.textContent = "请先填写标准简历";
    } else if (isCurrent && isRunning) {
      item.labelEl.textContent = config.runningText;
    } else {
      item.labelEl.textContent = config.triggerText;
    }
  }
}

function buildFillTipText(actionKey, cacheHit) {
  const modeLabel =
    actionKey === "incrementalPage"
      ? "增量填入"
      : actionKey === "selection"
        ? "选区填入"
        : "本次填充";

  return cacheHit
    ? `${modeLabel}复用了本地字段映射缓存。`
    : `${modeLabel}已生成新的字段映射，并写入本地缓存。`;
}

function isSupportedWebPageUrl(url) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch (_) {
    return false;
  }
}

async function ensureContentScriptInjected(tabId) {
  let staleScriptDetected = false;

  try {
    const pong = await sendTabMessage(tabId, { action: "ping" });
    if (contentBridge.contentScriptHasDiagnosticsSupport(pong)) {
      return true;
    }

    if (pong?.success) {
      staleScriptDetected = true;
    }
  } catch (_) {
    // Ignore and inject below when there is no reachable content script.
  }

  if (staleScriptDetected) {
    return false;
  }

  return injectContentScript(tabId);
}

async function injectContentScript(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!isSupportedWebPageUrl(tab.url)) {
      return false;
    }

    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content.css"],
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        "shared/resume-schema.js",
        "shared/diagnostics.js",
        "shared/field-text.js",
        "shared/field-semantics.js",
        "shared/fill-runtime.js",
        "shared/content-bridge.js",
        "shared/ai-client.js",
        "content.js",
      ],
    });

    await new Promise((resolve) => setTimeout(resolve, 200));
    const pong = await sendTabMessage(tabId, { action: "ping" });
    return Boolean(contentBridge.contentScriptHasDiagnosticsSupport(pong));
  } catch (error) {
    console.error("[popup] 注入 content script 失败:", error);
    return false;
  }
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

function parseJsonFromAiText(text) {
  const trimmed = normalizeAiJsonInput(text);
  if (!trimmed) throw new Error("AI 返回为空");

  const direct = tryParseJsonVariants(trimmed);
  if (direct.ok) return direct.value;

  const noFences = trimmed
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const noFenceParsed = tryParseJsonVariants(noFences);
  if (noFenceParsed.ok) return noFenceParsed.value;

  for (const candidate of extractJsonCandidates(noFences)) {
    const parsed = tryParseJsonVariants(candidate);
    if (parsed.ok) return parsed.value;
  }

  throw new Error("无法解析 AI 返回的 JSON");
}

function normalizeAiJsonInput(text) {
  return String(text || "").replace(/^\uFEFF/, "").trim();
}

function tryParseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (_) {
    return { ok: false };
  }
}

function tryParseJsonVariants(text) {
  const candidates = [String(text || "").trim(), sanitizeLikelyJson(text)];
  const seen = new Set();

  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    const parsed = tryParseJson(normalized);
    if (parsed.ok) return parsed;
  }

  return { ok: false };
}

function sanitizeLikelyJson(text) {
  return String(text || "")
    .trim()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

function extractJsonCandidates(text) {
  const candidates = [extractLikelyJson(text), extractBalancedJson(text)];
  return Array.from(
    new Set(candidates.map((item) => String(item || "").trim()).filter(Boolean))
  );
}

function extractLikelyJson(text) {
  const firstObj = text.indexOf("{");
  const lastObj = text.lastIndexOf("}");
  const firstArr = text.indexOf("[");
  const lastArr = text.lastIndexOf("]");

  const objCandidate =
    firstObj !== -1 && lastObj !== -1 && lastObj > firstObj
      ? text.slice(firstObj, lastObj + 1)
      : null;
  const arrCandidate =
    firstArr !== -1 && lastArr !== -1 && lastArr > firstArr
      ? text.slice(firstArr, lastArr + 1)
      : null;

  if (objCandidate && arrCandidate) {
    return firstObj < firstArr ? objCandidate : arrCandidate;
  }
  return objCandidate || arrCandidate || text;
}

function extractBalancedJson(text) {
  const source = String(text || "");
  let start = -1;
  let inString = false;
  let isEscaped = false;
  const stack = [];

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (start === -1) {
      if (char === "{" || char === "[") {
        start = index;
        stack.push(char);
      }
      continue;
    }

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (char === "\\") {
        isEscaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }

    if (char === "}" || char === "]") {
      const last = stack[stack.length - 1];
      const matchesPair =
        (last === "{" && char === "}") || (last === "[" && char === "]");

      if (!matchesPair) return "";

      stack.pop();
      if (stack.length === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return "";
}

function updateStatus(type, text) {
  statusDot.className = `status-dot ${type}`;
  statusText.textContent = text;
}

function addLog(type, message) {
  const now = new Date();
  const time = now.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });

  recordSessionLog(type, message, now.toISOString());

  if (!logVisibility.shouldRenderLogInUi(type, message)) {
    return;
  }

  const item = document.createElement("div");
  item.className = `log-item log-${type}`;
  item.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-msg">${escapeHtml(message)}</span>
  `;
  logContent.appendChild(item);
  logContent.scrollTop = logContent.scrollHeight;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

clearLogBtn.addEventListener("click", () => {
  logContent.innerHTML = "";
  addLog("info", "日志已清空");
});

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case "log":
      addLog(message.level || "info", message.text || "");
      break;
    case "updateStats":
      updateFillStats(
        message.fieldCount ?? 0,
        message.mappedCount ?? 0,
        message.filledCount ?? 0
      );
      break;
    case "error":
      updateStatus("error", "错误");
      addLog("error", message.text || "未知错误");
      break;
    default:
      break;
  }
});
