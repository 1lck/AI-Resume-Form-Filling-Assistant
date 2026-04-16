const resumeNavEl = document.getElementById("resumeNav");
const resumeFormHost = document.getElementById("resumeFormHost");
const saveResumeBtn = document.getElementById("saveResumeBtn");
const reloadResumeBtn = document.getElementById("reloadResumeBtn");
const resumeImportTextEl = document.getElementById("resumeImportText");
const importResumeBtn = document.getElementById("importResumeBtn");
const uploadPdfBtn = document.getElementById("uploadPdfBtn");
const resumePdfFileEl = document.getElementById("resumePdfFile");
const pageStatusEl = document.getElementById("pageStatus");

const schema = window.ResumeSchema;
if (!schema) {
  throw new Error("Resume schema is not available");
}

const RESUME_PROFILE_KEY = "resumeProfile";
const RESUME_SCHEMA_VERSION_KEY = "resumeSchemaVersion";
const RESUME_IMPORT_RAW_TEXT_KEY = "resumeImportRawText";

const BUILTIN_MODEL = {
  id: "builtin-deepseek",
  name: "DeepSeek",
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: "",
  model: "deepseek-chat",
  builtin: true,
};

let isImporting = false;
let isResumeDirty = false;
let resumeProfile = schema.createEmptyResumeProfile();
const collapsedResumeSections = new Set();

document.addEventListener("DOMContentLoaded", async () => {
  initResumeEditorEvents();
  await initModels();
  await loadResumeProfile();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;
  if (
    !changes[RESUME_PROFILE_KEY] &&
    !changes[RESUME_IMPORT_RAW_TEXT_KEY] &&
    !changes.resumeStructured &&
    !changes.resumeRawText
  ) {
    return;
  }

  if (isResumeDirty || isImporting) {
    return;
  }

  loadResumeProfile().catch((error) => {
    console.error("[resume-editor] 同步简历配置失败:", error);
  });
});

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

async function initModels() {
  const data = await chrome.storage.sync.get([
    "aiModels",
    "activeModelId",
    "baseUrl",
    "apiKey",
    "model",
  ]);

  if (!data.aiModels && data.apiKey) {
    const customModel = {
      id: `custom-${Date.now()}`,
      name: "自定义模型",
      baseUrl: data.baseUrl || BUILTIN_MODEL.baseUrl,
      apiKey: data.apiKey,
      model: data.model || BUILTIN_MODEL.model,
      builtin: false,
    };

    await chrome.storage.sync.set({
      aiModels: [customModel],
      activeModelId: customModel.id,
    });
    return;
  }

  if (!data.aiModels) {
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
  return models.find((model) => model.id === activeId) || BUILTIN_MODEL;
}

function isModelConfigured(model) {
  return Boolean(model?.baseUrl && model?.apiKey && model?.model);
}

function resetCollapsedResumeSections() {
  collapsedResumeSections.clear();
  schema.sections.forEach((section) => collapsedResumeSections.add(section.key));
}

async function loadResumeProfile() {
  const data = await chrome.storage.sync.get([
    RESUME_PROFILE_KEY,
    RESUME_IMPORT_RAW_TEXT_KEY,
    "resumeStructured",
    "resumeRawText",
  ]);

  const sourceProfile =
    data[RESUME_PROFILE_KEY] && typeof data[RESUME_PROFILE_KEY] === "object"
      ? data[RESUME_PROFILE_KEY]
      : data.resumeStructured || {};

  resumeProfile = schema.normalizeResumeProfile(sourceProfile);
  resumeImportTextEl.value = data[RESUME_IMPORT_RAW_TEXT_KEY] || data.resumeRawText || "";
  resetCollapsedResumeSections();
  renderResumeEditor(resumeProfile);
  isResumeDirty = false;
  saveResumeBtn.disabled = true;
  updatePageStatus(
    "info",
    `已加载标准简历。当前共填写 ${countFilledSummaryItems(resumeProfile)} 个有效字段。`
  );
}

function renderResumeEditor(profile) {
  const sectionStats = buildResumeSectionStats(profile);

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
    control.type = field.input || "text";
  }

  control.dataset.resumePath = path;
  control.value = value == null ? "" : String(value);
  if (field.placeholder) {
    control.placeholder = field.placeholder;
  }

  control.addEventListener("input", markResumeDirty);
  control.addEventListener("change", markResumeDirty);
  return control;
}

function markResumeDirty() {
  isResumeDirty = true;
  saveResumeBtn.disabled = false;
  updatePageStatus("warning", "有未保存的修改，记得点击“保存标准简历”。");
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

function countFilledSummaryItems(profile) {
  return schema.getCatalogWithValues(profile).filter((field) => field.hasValue).length;
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
  await chrome.storage.sync.set({
    [RESUME_PROFILE_KEY]: nextProfile,
    [RESUME_SCHEMA_VERSION_KEY]: schema.version,
    [RESUME_IMPORT_RAW_TEXT_KEY]: resumeImportTextEl.value.trim(),
  });

  isResumeDirty = false;
  saveResumeBtn.disabled = true;
  updatePageStatus("success", "标准简历已保存，侧边栏自动填充会立即使用这份数据。");

  if (!silent) {
    document.title = "简历配置 - AI 简历填表助手";
  }
}

saveResumeBtn.addEventListener("click", async () => {
  await persistResumeProfile();
});

reloadResumeBtn.addEventListener("click", async () => {
  await loadResumeProfile();
  updatePageStatus("info", "已从扩展存储重新加载标准简历。");
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
    updatePageStatus("error", "请选择 PDF 文件。");
    return;
  }

  uploadPdfBtn.disabled = true;
  importResumeBtn.disabled = true;
  updatePageStatus("info", `正在提取 PDF 文本：${file.name}`);

  try {
    const text = await extractTextFromPdf(file);
    if (!text) {
      throw new Error("未提取到文本：如果是扫描版 PDF，请先转为可复制文字或使用 OCR");
    }

    resumeImportTextEl.value = text;
    await chrome.storage.sync.set({ [RESUME_IMPORT_RAW_TEXT_KEY]: text });

    updatePageStatus("success", "PDF 文本提取完成，开始导入到标准简历...");
    await importResumeToSchema(text);
  } catch (error) {
    updatePageStatus("error", `PDF 导入失败：${error.message}`);
  } finally {
    uploadPdfBtn.disabled = false;
    importResumeBtn.disabled = false;
  }
});

async function importResumeToSchema(rawText) {
  if (isImporting) return;

  const text = String(rawText || "").trim();
  if (!text) {
    updatePageStatus("warning", "请先粘贴原始简历文本，或上传 PDF。");
    return;
  }

  const activeModel = await getActiveModel();
  if (!isModelConfigured(activeModel)) {
    updatePageStatus("error", "请先在侧边栏的模型设置中配置可用模型。");
    return;
  }

  isImporting = true;
  importResumeBtn.disabled = true;
  uploadPdfBtn.disabled = true;
  importResumeBtn.textContent = "导入中...";
  updatePageStatus("info", "正在调用 AI 导入到标准简历...");

  try {
    const config = pickConfig(activeModel);
    const prompt = buildResumeImportPrompt(limitTextForPrompt(text));
    const aiText = await callAI(config, prompt, "resume_import");
    const parsed = parseJsonFromAiText(aiText);
    const normalized = schema.normalizeResumeProfile(parsed);

    resumeProfile = normalized;
    await chrome.storage.sync.set({
      [RESUME_PROFILE_KEY]: normalized,
      [RESUME_SCHEMA_VERSION_KEY]: schema.version,
      [RESUME_IMPORT_RAW_TEXT_KEY]: text,
    });

    resetCollapsedResumeSections();
    renderResumeEditor(normalized);
    isResumeDirty = false;
    saveResumeBtn.disabled = true;

    updatePageStatus("success", "导入完成：已预填到标准简历，请检查后保存。");
  } catch (error) {
    updatePageStatus("error", `导入失败：${error.message}`);
  } finally {
    isImporting = false;
    importResumeBtn.disabled = false;
    uploadPdfBtn.disabled = false;
    importResumeBtn.textContent = "AI 导入到标准简历";
  }
}

function buildResumeImportPrompt(rawText) {
  const optionRules = schema
    .getFieldCatalog()
    .filter((field) => Array.isArray(field.options) && field.options.length > 0)
    .map(
      (field) =>
        `- ${field.path}: ${field.options.filter(Boolean).join(" | ")}`
    )
    .join("\n");

  return [
    "请把下面的原始简历内容提取到固定 JSON 模板中。",
    "要求：",
    "1. 只输出 JSON，不要解释。",
    "2. 只能使用模板中已有字段，不要新增字段。",
    "3. 没有信息的字段保持空字符串。",
    "4. 列表字段按时间从近到远填写前几个槽位，剩余槽位留空。",
    "5. 日期尽量输出为 YYYY-MM-DD；若只能确认到月份，可输出 YYYY-MM。",
    "6. 下列枚举字段只能使用给定选项值：",
    optionRules,
    "",
    "固定 JSON 模板：",
    schema.createImportTemplateString(),
    "",
    "原始简历内容：",
    rawText,
  ].join("\n");
}

function limitTextForPrompt(text) {
  const maxChars = 60000;
  if (text.length <= maxChars) return text;

  updatePageStatus(
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
    updatePageStatus("info", `正在解析 PDF (${pageNo}/${total})...`);
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
    throw new Error("PDF 解析库未加载，请刷新页面后重试");
  }
  return lib;
}

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
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response) {
          reject(new Error("AI 响应为空"));
          return;
        }

        if (response.success) {
          resolve(response.data);
          return;
        }

        reject(new Error(response.error || "AI 调用失败"));
      }
    );
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

function updatePageStatus(type, text) {
  if (!pageStatusEl) return;
  pageStatusEl.textContent = text;
  pageStatusEl.style.borderColor =
    type === "error"
      ? "rgba(239,68,68,0.28)"
      : type === "success"
        ? "rgba(16,185,129,0.28)"
        : type === "warning"
          ? "rgba(245,158,11,0.28)"
          : "var(--border)";
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
