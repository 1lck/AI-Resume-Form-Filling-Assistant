// 侧边栏 UI 逻辑：简历解析（DeepSeek）+ 自动填表（不提交）

// --- DOM ---
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

const fieldCountEl = document.getElementById("fieldCount");
const filledCountEl = document.getElementById("filledCount");

const tabsEl = document.getElementById("tabs");
const tabFillEl = document.getElementById("tab-fill");
const tabResumeEl = document.getElementById("tab-resume");

const startFillBtn = document.getElementById("startFillBtn");
const startFillBtnText = document.getElementById("startFillBtnText");
const fillTipEl = document.getElementById("fillTip");

const resultSectionEl = document.getElementById("resultSection");
const resultTableBodyEl = document.getElementById("resultTableBody");
const clearResultsBtn = document.getElementById("clearResultsBtn");
const savePageMemoryBtn = document.getElementById("savePageMemoryBtn");

const resumeTextEl = document.getElementById("resumeText");
const parseResumeBtn = document.getElementById("parseResumeBtn");
const saveResumeBtn = document.getElementById("saveResumeBtn");
const reloadResumeBtn = document.getElementById("reloadResumeBtn");
const resumeTableBodyEl = document.getElementById("resumeTableBody");
const uploadPdfBtn = document.getElementById("uploadPdfBtn");
const resumePdfFileEl = document.getElementById("resumePdfFile");
const reloadMemoryBtn = document.getElementById("reloadMemoryBtn");
const clearMemoryBtn = document.getElementById("clearMemoryBtn");
const memoryTableBodyEl = document.getElementById("memoryTableBody");

const logContent = document.getElementById("logContent");
const clearLogBtn = document.getElementById("clearLog");

// Settings Modal Elements
const settingsModal = document.getElementById("settingsModal");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const closeSettingsBackdrop = document.getElementById("closeSettingsBackdrop");
const modelList = document.getElementById("modelList");
const addModelBtn = document.getElementById("addModelBtn");

// Edit Model Modal Elements
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

let editingModelId = null;

// --- State ---
let isFilling = false;
let isParsingResume = false;
let resumeStructured = null;
let lastFillResults = null;

// Built-in default model (DeepSeek)
const BUILTIN_MODEL = {
  id: "builtin-deepseek",
  name: "DeepSeek",
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: "",
  model: "deepseek-chat",
  builtin: true,
};

document.addEventListener("DOMContentLoaded", async () => {
  initTabs();
  await initModels();
  await loadResumeFromStorage();
  await renderMemoryTable();
  updateStartFillAvailability();
});

// --- Tabs ---
function initTabs() {
  tabsEl.addEventListener("click", (e) => {
    const tabBtn = e.target.closest(".tab");
    if (!tabBtn) return;
    switchTab(tabBtn.dataset.tab);
  });
}

function switchTab(tabKey) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabKey);
  });
  tabFillEl.classList.toggle("active", tabKey === "fill");
  tabResumeEl.classList.toggle("active", tabKey === "resume");
}

// --- Modal Logic ---
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
  } else {
    editModalTitle.textContent = "添加模型";
    editNameInput.value = "DeepSeek";
    editBaseUrlInput.value = "https://api.deepseek.com/v1";
    editApiKeyInput.value = "";
    editModelInput.value = "deepseek-chat";
  }
}

function closeEditModal() {
  editModelModal.classList.remove("open");
  editingModelId = null;
}

openSettingsBtn.addEventListener("click", openModal);
closeSettingsBtn.addEventListener("click", closeModal);
closeSettingsBackdrop.addEventListener("click", closeModal);
addModelBtn.addEventListener("click", () => openEditModal());
closeEditBtn.addEventListener("click", closeEditModal);
closeEditBackdrop.addEventListener("click", closeEditModal);

toggleEditApiKeyBtn.addEventListener("click", () => {
  const type = editApiKeyInput.type === "password" ? "text" : "password";
  editApiKeyInput.type = type;
  toggleEditApiKeyBtn.style.opacity = type === "text" ? "1" : "0.6";
});

// --- Model Management ---
async function initModels() {
  const data = await chrome.storage.sync.get([
    "aiModels",
    "activeModelId",
    "baseUrl",
    "apiKey",
    "model",
  ]);

  // Migrate old config to new structure
  if (!data.aiModels && data.apiKey) {
    const customModel = {
      id: "custom-" + Date.now(),
      name: "自定义模型",
      baseUrl: data.baseUrl || "https://api.deepseek.com/v1",
      apiKey: data.apiKey,
      model: data.model || "deepseek-chat",
      builtin: false,
    };
    await chrome.storage.sync.set({
      aiModels: [customModel],
      activeModelId: customModel.id,
    });
  } else if (!data.aiModels) {
    await chrome.storage.sync.set({
      aiModels: [],
      activeModelId: BUILTIN_MODEL.id,
    });
  }
}

async function getAllModels() {
  const data = await chrome.storage.sync.get(["aiModels", "builtinModelOverride"]);
  const override = data.builtinModelOverride;
  const builtin =
    override && typeof override === "object"
      ? { ...BUILTIN_MODEL, ...override, id: BUILTIN_MODEL.id, builtin: true }
      : BUILTIN_MODEL;
  return [builtin, ...(data.aiModels || [])];
}

async function getActiveModel() {
  const data = await chrome.storage.sync.get(["activeModelId"]);
  const models = await getAllModels();
  const activeId = data.activeModelId || BUILTIN_MODEL.id;
  return models.find((m) => m.id === activeId) || BUILTIN_MODEL;
}

async function renderModelList() {
  const models = await getAllModels();
  const data = await chrome.storage.sync.get(["activeModelId"]);
  const activeId = data.activeModelId || BUILTIN_MODEL.id;

  modelList.innerHTML = models
    .map(
      (model) => `
      <div class="model-item ${
        model.id === activeId ? "active" : ""
      }" data-model-id="${model.id}">
        <input type="radio" name="activeModel" class="model-radio" value="${
          model.id
        }" ${model.id === activeId ? "checked" : ""}>
        <div class="model-info">
          <div class="model-name">
            ${model.name}
            ${model.builtin ? '<span class="model-badge">内置</span>' : ""}
          </div>
          <div class="model-meta">${model.model}</div>
        </div>
        <div class="model-actions">
          <button class="icon-btn edit-model-btn" data-model-id="${model.id}">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
          ${
            !model.builtin
              ? `<button class="icon-btn delete-model-btn" data-model-id="${model.id}">
                   <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                 </button>`
              : ""
          }
        </div>
      </div>
    `
    )
    .join("");

  document.querySelectorAll(".model-item").forEach((item) => {
    item.addEventListener("click", async (e) => {
      if (
        e.target.closest(".edit-model-btn") ||
        e.target.closest(".delete-model-btn")
      ) {
        return;
      }

      const modelId = item.dataset.modelId;
      const model = models.find((m) => m.id === modelId);

      await chrome.storage.sync.set({ activeModelId: modelId });
      addLog("success", `已使用 ${model.name} 模型`);
      closeModal();
    });
  });

  document.querySelectorAll(".model-radio").forEach((radio) => {
    radio.addEventListener("change", async (e) => {
      e.stopPropagation();
      await chrome.storage.sync.set({ activeModelId: e.target.value });
      renderModelList();
    });
  });

  document.querySelectorAll(".edit-model-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditModal(e.currentTarget.dataset.modelId);
    });
  });

  document.querySelectorAll(".delete-model-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const modelId = e.currentTarget.dataset.modelId;
      if (!confirm("确定要删除这个模型吗？")) return;

      const data = await chrome.storage.sync.get(["aiModels", "activeModelId"]);
      const models = (data.aiModels || []).filter((m) => m.id !== modelId);

      const updates = { aiModels: models };
      if (data.activeModelId === modelId) {
        updates.activeModelId = BUILTIN_MODEL.id;
      }

      await chrome.storage.sync.set(updates);
      renderModelList();
    });
  });
}

async function loadModelForEdit(modelId) {
  const models = await getAllModels();
  const model = models.find((m) => m.id === modelId);
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

  const data = await chrome.storage.sync.get(["aiModels"]);
  const models = data.aiModels || [];

  if (editingModelId === BUILTIN_MODEL.id) {
    await chrome.storage.sync.set({
      builtinModelOverride: { name, baseUrl, apiKey, model },
      activeModelId: BUILTIN_MODEL.id,
    });
  } else if (editingModelId) {
    const index = models.findIndex((m) => m.id === editingModelId);
    if (index !== -1) {
      models[index] = { ...models[index], name, baseUrl, apiKey, model };
    }
    await chrome.storage.sync.set({ aiModels: models });
  } else {
    models.push({
      id: "custom-" + Date.now(),
      name,
      baseUrl,
      apiKey,
      model,
      builtin: false,
    });
    await chrome.storage.sync.set({ aiModels: models });
  }

  setTimeout(() => {
    saveModelBtn.disabled = false;
    saveModelBtn.textContent = "保存";
    showEditStatus("success", "保存成功");
    setTimeout(() => {
      closeEditModal();
      renderModelList();
    }, 500);
  }, 300);
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

// --- Resume ---
async function loadResumeFromStorage() {
  const data = await chrome.storage.sync.get(["resumeRawText", "resumeStructured"]);
  resumeTextEl.value = data.resumeRawText || "";
  resumeStructured = data.resumeStructured || null;
  renderResumeTable(resumeStructured);
}

reloadResumeBtn.addEventListener("click", async () => {
  await loadResumeFromStorage();
  saveResumeBtn.disabled = true;
  addLog("info", "已从存储重新加载简历解析结果");
  updateStartFillAvailability();
});

reloadMemoryBtn.addEventListener("click", async () => {
  await renderMemoryTable();
  addLog("info", "已刷新记忆库");
});

clearMemoryBtn.addEventListener("click", async () => {
  if (!confirm("确定要清空记忆库吗？这会影响后续自动补全。")) return;
  await chrome.storage.sync.set({ fieldMemory: {} });
  await renderMemoryTable();
  addLog("success", "记忆库已清空");
});

parseResumeBtn.addEventListener("click", async () => {
  const raw = resumeTextEl.value.trim();
  await parseAndStoreResume(raw);
});

saveResumeBtn.addEventListener("click", async () => {
  if (!resumeStructured) return;

  const cloned = deepClone(resumeStructured);
  const inputs = resumeTableBodyEl.querySelectorAll("[data-pointer]");
  for (const input of inputs) {
    const pointer = input.dataset.pointer;
    const rawValue = input.value ?? "";
    setByJsonPointer(cloned, pointer, rawValue);
  }

  resumeStructured = cloned;
  await chrome.storage.sync.set({
    resumeRawText: resumeTextEl.value.trim(),
    resumeStructured: cloned,
    resumeUpdatedAt: Date.now(),
  });

  saveResumeBtn.disabled = true;
  updateStartFillAvailability();
  addLog("success", "简历已保存");
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
  parseResumeBtn.disabled = true;
  updateStatus("running", "解析PDF中...");
  addLog("info", `正在提取 PDF 文本：${file.name}`);

  try {
    const text = await extractTextFromPdf(file);
    if (!text) {
      throw new Error("未提取到文本：如果是扫描版 PDF，请先转为可复制文字或使用 OCR");
    }

    resumeTextEl.value = text;
    await chrome.storage.sync.set({ resumeRawText: text, resumeUpdatedAt: Date.now() });

    addLog("success", "PDF 文本提取完成，开始调用 AI 解析...");
    await parseAndStoreResume(text);
  } catch (e) {
    addLog("error", `PDF 解析失败：${e.message}`);
    updateStatus("error", "PDF失败");
  } finally {
    uploadPdfBtn.disabled = false;
    parseResumeBtn.disabled = false;
  }
});

async function parseAndStoreResume(raw) {
  if (isParsingResume) return;
  const text = String(raw || "").trim();
  if (!text) {
    addLog("warning", "请先粘贴简历文本（或上传 PDF）");
    return;
  }

  const activeModel = await getActiveModel();
  if (!isModelConfigured(activeModel)) {
    addLog("error", "请先在设置中配置 DeepSeek/API Key");
    openModal();
    return;
  }

  isParsingResume = true;
  parseResumeBtn.disabled = true;
  parseResumeBtn.textContent = "解析中...";
  updateStatus("running", "解析中...");

  try {
    const config = pickConfig(activeModel);
    const prompt = buildResumeParsePrompt(limitTextForPrompt(text));
    const aiText = await callAI(config, prompt, "resume_parse");
    const parsed = parseJsonFromAiText(aiText);

    resumeStructured = parsed;
    await chrome.storage.sync.set({
      resumeRawText: text,
      resumeStructured: parsed,
      resumeUpdatedAt: Date.now(),
    });

    renderResumeTable(parsed);
    saveResumeBtn.disabled = true;
    updateStartFillAvailability();

    addLog("success", "简历解析完成，可在表格中直接修改后点击“保存修改”");
    updateStatus("ready", "就绪");
  } catch (e) {
    addLog("error", `简历解析失败：${e.message}`);
    updateStatus("error", "解析失败");
  } finally {
    parseResumeBtn.disabled = false;
    parseResumeBtn.textContent = "AI 解析简历";
    isParsingResume = false;
  }
}

function limitTextForPrompt(text) {
  const maxChars = 60000;
  if (text.length <= maxChars) return text;
  addLog(
    "warning",
    `简历文本过长（${text.length} 字），已截断前 ${maxChars} 字用于解析；如信息缺失可删减后重试。`
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
  for (let pageNo = 1; pageNo <= total; pageNo++) {
    updateStatus("running", `解析PDF(${pageNo}/${total})...`);
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    for (const item of content.items || []) {
      parts.push(item.str || "");
      if (item.hasEOL) {
        parts.push("\n");
      } else {
        parts.push(" ");
      }
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

function renderResumeTable(value) {
  resumeTableBodyEl.innerHTML = "";

  if (!value || typeof value !== "object") {
    resumeTableBodyEl.innerHTML = `
      <tr><td class="empty-state" colspan="2">暂无解析结果，请先点击“AI 解析简历”。</td></tr>
    `;
    return;
  }

  const rows = flattenJson(value).sort((a, b) => a.pointer.localeCompare(b.pointer));
  if (rows.length === 0) {
    resumeTableBodyEl.innerHTML = `
      <tr><td class="empty-state" colspan="2">解析结果为空，请尝试补充简历文本后重新解析。</td></tr>
    `;
    return;
  }

  for (const row of rows) {
    const tr = document.createElement("tr");
    const fieldTd = document.createElement("td");
    fieldTd.textContent = row.label;

    const valueTd = document.createElement("td");
    const isLong = typeof row.value === "string" && row.value.length > 60;
    const input = document.createElement(isLong ? "textarea" : "input");
    input.className = isLong ? "table-textarea" : "table-input";
    if (!isLong) input.type = "text";
    input.value = row.value == null ? "" : String(row.value);
    input.dataset.pointer = row.pointer;
    input.addEventListener("input", () => {
      saveResumeBtn.disabled = false;
    });
    valueTd.appendChild(input);

    tr.appendChild(fieldTd);
    tr.appendChild(valueTd);
    resumeTableBodyEl.appendChild(tr);
  }
}

// --- Autofill ---
startFillBtn.addEventListener("click", async () => {
  if (isFilling) return;

  if (!resumeStructured) {
    addLog("warning", "请先在“简历配置”里解析并保存简历");
    switchTab("resume");
    return;
  }

  const activeModel = await getActiveModel();
  if (!isModelConfigured(activeModel)) {
    addLog("error", "请先在设置中配置 DeepSeek/API Key");
    openModal();
    return;
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) {
    addLog("error", "无法获取当前标签页");
    return;
  }
  const tab = tabs[0];

  if (
    !tab.url ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("edge://") ||
    tab.url.startsWith("about:")
  ) {
    addLog("error", "请切换到要填写的网页（非系统页面）");
    updateStatus("error", "系统页面");
    return;
  }

  isFilling = true;
  startFillBtn.disabled = true;
  startFillBtnText.textContent = "填充中...";
  fillTipEl.hidden = true;
  updateStatus("running", "填充中...");
  addLog("info", "正在识别字段并填充（不会自动提交）...");

  try {
    const memory = await loadFieldMemory();
    const injected = await ensureContentScriptInjected(tab.id);
    if (!injected) {
      throw new Error("无法连接到页面，请刷新页面后重试");
    }

    const config = pickConfig(activeModel);
    const response = await sendTabMessage(tab.id, {
      action: "startFill",
      config,
      resume: resumeStructured,
      memory,
    });

    if (!response?.success) {
      throw new Error(response?.message || "填充失败");
    }

    fieldCountEl.textContent = response.fieldCount ?? 0;
    filledCountEl.textContent = response.filledCount ?? 0;
    lastFillResults = response.items || [];
    renderFillResults(lastFillResults);

    fillTipEl.hidden = false;
    updateStatus("ready", "完成");
    addLog(
      "success",
      `填充完成：识别 ${response.fieldCount} 个字段，已填充 ${response.filledCount} 个。请检查后手动提交。`
    );
  } catch (e) {
    addLog("error", `填充失败：${e.message}`);
    updateStatus("error", "失败");
  } finally {
    isFilling = false;
    startFillBtn.disabled = !resumeStructured;
    startFillBtnText.textContent = resumeStructured ? "开始填充" : "请先解析简历";
  }
});

clearResultsBtn.addEventListener("click", () => {
  lastFillResults = null;
  resultTableBodyEl.innerHTML = "";
  resultSectionEl.hidden = true;
  fillTipEl.hidden = true;
  fieldCountEl.textContent = "0";
  filledCountEl.textContent = "0";
});

savePageMemoryBtn.addEventListener("click", async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) {
    addLog("error", "无法获取当前标签页");
    return;
  }

  const tab = tabs[0];
  if (
    !tab.url ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("edge://") ||
    tab.url.startsWith("about:")
  ) {
    addLog("error", "请切换到要保存记忆的网页（非系统页面）");
    updateStatus("error", "系统页面");
    return;
  }

  savePageMemoryBtn.disabled = true;
  updateStatus("running", "保存记忆...");
  addLog("info", "正在扫描当前页面并保存已填写字段到记忆库...");

  try {
    const injected = await ensureContentScriptInjected(tab.id);
    if (!injected) {
      throw new Error("无法连接到页面，请刷新页面后重试");
    }

    const snapshot = await sendTabMessage(tab.id, { action: "snapshotPageMemory" });
    if (!snapshot?.success) {
      throw new Error(snapshot?.message || "页面字段解析失败");
    }

    const saved = await upsertFieldMemoryBulk(snapshot.items || []);
    await renderMemoryTable();

    updateStatus("ready", "就绪");
    addLog("success", `记忆保存完成：新增/更新 ${saved} 条`);
  } catch (e) {
    updateStatus("error", "失败");
    addLog("error", `保存记忆失败：${e.message}`);
  } finally {
    savePageMemoryBtn.disabled = false;
  }
});

function renderFillResults(items) {
  resultTableBodyEl.innerHTML = "";

  if (!items || items.length === 0) {
    resultTableBodyEl.innerHTML = `
      <tr><td class="empty-state" colspan="4">没有可展示的匹配结果。</td></tr>
    `;
    resultSectionEl.hidden = false;
    return;
  }

  for (const item of items) {
    const tr = document.createElement("tr");

    const fieldTd = document.createElement("td");
    const baseLabel = item.fieldLabel || item.fieldId || "未知字段";
    fieldTd.textContent = item.filled === false ? `${baseLabel}（未填）` : baseLabel;

    const valueTd = document.createElement("td");
    const valueInput = document.createElement(
      typeof item.value === "string" && item.value.length > 60 ? "textarea" : "input"
    );
    valueInput.className =
      valueInput.tagName.toLowerCase() === "textarea"
        ? "table-textarea"
        : "table-input";
    if (valueInput.tagName.toLowerCase() === "input") valueInput.type = "text";
    valueInput.value = item.value == null ? "" : String(item.value);
    valueInput.dataset.fieldId = item.fieldId;
    valueTd.appendChild(valueInput);

    const reasonTd = document.createElement("td");
    reasonTd.textContent =
      item.reason || item.explanation || item.message || "";

    const actionTd = document.createElement("td");
    const actionWrap = document.createElement("div");
    actionWrap.className = "action-buttons";

    const refillBtn = document.createElement("button");
    refillBtn.className = "btn btn-outline btn-sm";
    refillBtn.textContent = "重填本字段";
    refillBtn.addEventListener("click", async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) return;
      const tabId = tabs[0].id;

      const newValue = valueInput.value;
      refillBtn.disabled = true;
      refillBtn.textContent = "重填中...";
      try {
        const resp = await sendTabMessage(tabId, {
          action: "refillField",
          fieldId: item.fieldId,
          value: newValue,
        });

        if (!resp?.success) {
          throw new Error(resp?.message || "重填失败");
        }
        addLog("success", `已重填：${item.fieldLabel || item.fieldId}`);
      } catch (e) {
        addLog("error", `重填失败：${e.message}`);
      } finally {
        refillBtn.disabled = false;
        refillBtn.textContent = "重填本字段";
      }
    });

    actionWrap.appendChild(refillBtn);
    actionTd.appendChild(actionWrap);

    tr.appendChild(fieldTd);
    tr.appendChild(valueTd);
    tr.appendChild(reasonTd);
    tr.appendChild(actionTd);
    resultTableBodyEl.appendChild(tr);
  }

  resultSectionEl.hidden = false;
}

function updateStartFillAvailability() {
  startFillBtn.disabled = !resumeStructured;
  startFillBtnText.textContent = resumeStructured ? "开始填充" : "请先解析简历";
}

// --- Field Memory ---
function normalizeMemoryKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

async function loadFieldMemory() {
  const data = await chrome.storage.sync.get(["fieldMemory"]);
  const memory = data.fieldMemory;
  if (!memory || typeof memory !== "object") return {};
  return memory;
}

async function upsertFieldMemoryBulk(items) {
  const memory = await loadFieldMemory();
  const now = Date.now();

  let count = 0;
  let seq = 0;

  for (const item of items || []) {
    const label = String(item?.label || "").trim();
    const rawKey = String(item?.key || label || "").trim();
    const key = normalizeMemoryKey(rawKey);
    const value = String(item?.value ?? "").trim();

    if (!key) continue;
    if (!value) continue;

    memory[key] = {
      label: label || key,
      value: String(item?.value ?? ""),
      updatedAt: now + seq,
    };
    seq += 1;
    count += 1;
  }

  // 限制数量，避免无限增长
  const entries = Object.entries(memory).map(([k, v]) => ({
    key: k,
    updatedAt: Number(v?.updatedAt || 0),
  }));
  entries.sort((a, b) => b.updatedAt - a.updatedAt);
  const keep = entries.slice(0, 200).map((e) => e.key);
  const next = {};
  for (const k of keep) next[k] = memory[k];

  await chrome.storage.sync.set({ fieldMemory: next });
  return count;
}

async function deleteFieldMemory(key) {
  const normalizedKey = normalizeMemoryKey(key);
  const memory = await loadFieldMemory();
  if (!memory[normalizedKey]) return;
  delete memory[normalizedKey];
  await chrome.storage.sync.set({ fieldMemory: memory });
}

async function renderMemoryTable() {
  const memory = await loadFieldMemory();
  const entries = Object.entries(memory).map(([key, entry]) => ({
    key,
    label: entry?.label || key,
    value: entry?.value || "",
    updatedAt: Number(entry?.updatedAt || 0),
  }));
  entries.sort((a, b) => b.updatedAt - a.updatedAt);

  memoryTableBodyEl.innerHTML = "";

  if (entries.length === 0) {
    memoryTableBodyEl.innerHTML = `
      <tr><td class="empty-state" colspan="3">暂无记忆数据。</td></tr>
    `;
    return;
  }

  for (const item of entries) {
    const tr = document.createElement("tr");

    const fieldTd = document.createElement("td");
    fieldTd.textContent = item.label;

    const valueTd = document.createElement("td");
    valueTd.className = "memory-value";
    valueTd.textContent = item.value;

    const actionTd = document.createElement("td");
    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-outline btn-sm";
    delBtn.textContent = "删除";
    delBtn.addEventListener("click", async () => {
      if (!confirm(`确定删除记忆项：${item.label} ？`)) return;
      await deleteFieldMemory(item.key);
      await renderMemoryTable();
      addLog("success", `已删除：${item.label}`);
    });
    actionTd.appendChild(delBtn);

    tr.appendChild(fieldTd);
    tr.appendChild(valueTd);
    tr.appendChild(actionTd);

    memoryTableBodyEl.appendChild(tr);
  }
}

// --- Content Script Injection / Messaging ---
async function ensureContentScriptInjected(tabId) {
  try {
    const pong = await sendTabMessage(tabId, { action: "ping" });
    if (pong?.success) return true;
  } catch (_) {
    // ignore and try inject
  }
  return injectContentScript(tabId);
}

async function injectContentScript(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (
      !tab.url ||
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("edge://") ||
      tab.url.startsWith("about:")
    ) {
      return false;
    }

    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content.css"],
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });

    await new Promise((resolve) => setTimeout(resolve, 200));
    const pong = await sendTabMessage(tabId, { action: "ping" });
    return Boolean(pong?.success);
  } catch (e) {
    console.error("[popup] 注入 content script 失败:", e);
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

// --- AI Call via Background ---
function pickConfig(activeModel) {
  return {
    baseUrl: activeModel.baseUrl,
    apiKey: activeModel.apiKey,
    model: activeModel.model,
  };
}

function callAI(config, prompt, mode) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: "callAI", config, prompt, mode },
      (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!resp) {
          reject(new Error("AI 响应为空"));
          return;
        }
        if (resp.success) {
          resolve(resp.data);
          return;
        }
        reject(new Error(resp.error || "AI 调用失败"));
      }
    );
  });
}

function buildResumeParsePrompt(rawText) {
  return `请从下面的中文简历文本中提取信息，并整理为结构化 JSON（只输出 JSON，不要输出其它文本，不要使用 Markdown 代码块）。\n\n要求：\n- 不要编造不存在的信息。\n- 适合用于自动填写网页表单。\n- 可以包含：基本信息、联系方式、教育经历、工作经历、项目经历、技能、证书、个人链接（如GitHub）、期望岗位/城市/薪资、自我介绍等。\n\n简历文本：\n${rawText}\n`;
}

function parseJsonFromAiText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("AI 返回为空");

  // 1) 直接尝试解析
  const direct = tryParseJson(trimmed);
  if (direct.ok) return direct.value;

  // 2) 去掉代码块标记
  const noFences = trimmed
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const noFencesParsed = tryParseJson(noFences);
  if (noFencesParsed.ok) return noFencesParsed.value;

  // 3) 提取第一个 JSON 对象/数组
  const extracted = extractLikelyJson(noFences);
  const extractedParsed = tryParseJson(extracted);
  if (extractedParsed.ok) return extractedParsed.value;

  throw new Error("无法解析 AI 返回的 JSON，请尝试重新解析或补充简历文本");
}

function tryParseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (_) {
    return { ok: false };
  }
}

function extractLikelyJson(text) {
  const firstObj = text.indexOf("{");
  const lastObj = text.lastIndexOf("}");
  const firstArr = text.indexOf("[");
  const lastArr = text.lastIndexOf("]");

  // 选择更可能的 JSON 片段
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

function deepClone(obj) {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function flattenJson(value) {
  const out = [];
  walk(value, "", out);
  return out;

  function walk(node, pointer, acc) {
    if (node === null || typeof node !== "object") {
      acc.push({
        pointer: pointer || "/",
        label: pointerToLabel(pointer || "/"),
        value: node,
      });
      return;
    }

    if (Array.isArray(node)) {
      if (node.length === 0) {
        acc.push({
          pointer: pointer || "/",
          label: pointerToLabel(pointer || "/"),
          value: "",
        });
        return;
      }
      node.forEach((item, idx) => {
        walk(item, `${pointer}/${idx}`, acc);
      });
      return;
    }

    const keys = Object.keys(node);
    if (keys.length === 0) {
      acc.push({
        pointer: pointer || "/",
        label: pointerToLabel(pointer || "/"),
        value: "",
      });
      return;
    }

    keys.forEach((key) => {
      const seg = escapeJsonPointerSegment(key);
      walk(node[key], `${pointer}/${seg}`, acc);
    });
  }
}

function pointerToLabel(pointer) {
  if (!pointer || pointer === "/") return "(root)";
  const parts = pointer
    .split("/")
    .slice(1)
    .map((p) => unescapeJsonPointerSegment(p));
  return parts.join(" / ");
}

function escapeJsonPointerSegment(seg) {
  return String(seg).replace(/~/g, "~0").replace(/\//g, "~1");
}

function unescapeJsonPointerSegment(seg) {
  return String(seg).replace(/~1/g, "/").replace(/~0/g, "~");
}

function setByJsonPointer(obj, pointer, rawValue) {
  if (!pointer || pointer === "/") return;
  const segments = pointer
    .split("/")
    .slice(1)
    .map((p) => unescapeJsonPointerSegment(p));

  let current = obj;
  for (let i = 0; i < segments.length; i++) {
    const key = segments[i];
    const isLast = i === segments.length - 1;

    if (Array.isArray(current)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0) return;
      if (isLast) {
        current[index] = rawValue;
        return;
      }
      current = current[index];
      continue;
    }

    if (current && typeof current === "object") {
      if (isLast) {
        current[key] = rawValue;
        return;
      }
      current = current[key];
      continue;
    }

    return;
  }
}

// --- Logs / Status ---
function updateStatus(type, text) {
  statusDot.className = `status-dot ${type}`;
  statusText.textContent = text;
}

function addLog(type, message) {
  const time = new Date().toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const logItem = document.createElement("div");
  logItem.className = `log-item log-${type}`;
  logItem.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-msg">${escapeHtml(message)}</span>
  `;
  logContent.appendChild(logItem);
  logContent.scrollTop = logContent.scrollHeight;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

clearLogBtn.addEventListener("click", () => {
  logContent.innerHTML = "";
  addLog("info", "日志已清空");
});

// Message Listener（来自 content script）
chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case "log":
      addLog(message.level, message.text);
      break;
    case "updateStats":
      fieldCountEl.textContent = message.fieldCount ?? 0;
      filledCountEl.textContent = message.filledCount ?? 0;
      break;
    case "error":
      updateStatus("error", "错误");
      addLog("error", message.text);
      break;
  }
});
