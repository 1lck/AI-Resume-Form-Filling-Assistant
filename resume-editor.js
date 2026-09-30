const resumeNavEl = document.getElementById("resumeNav");
const resumeFormHost = document.getElementById("resumeFormHost");
const saveResumeBtn = document.getElementById("saveResumeBtn");
const reloadResumeBtn = document.getElementById("reloadResumeBtn");
const resumeImportTextEl = document.getElementById("resumeImportText");
const importResumeBtn = document.getElementById("importResumeBtn");
const uploadPdfBtn = document.getElementById("uploadPdfBtn");
const resumePdfFileEl = document.getElementById("resumePdfFile");
const pageStatusEl = document.getElementById("pageStatus");

const resumeTemplateSelect = document.getElementById("resumeTemplateSelect");
const newTemplateBtn = document.getElementById("newTemplateBtn");
const duplicateTemplateBtn = document.getElementById("duplicateTemplateBtn");
const renameTemplateBtn = document.getElementById("renameTemplateBtn");
const deleteTemplateBtn = document.getElementById("deleteTemplateBtn");
const exportTemplatesBtn = document.getElementById("exportTemplatesBtn");
const importTemplatesBtn = document.getElementById("importTemplatesBtn");
const importTemplatesFileEl = document.getElementById("importTemplatesFile");
const exportResumeJsonBtn = document.getElementById("exportResumeJsonBtn");
const importResumeJsonBtn = document.getElementById("importResumeJsonBtn");
const importResumeJsonFileEl = document.getElementById("importResumeJsonFile");

const templateNameModal = document.getElementById("templateNameModal");
const templateNameModalTitle = document.getElementById("templateNameModalTitle");
const templateNameInput = document.getElementById("templateNameInput");
const templateNameStatus = document.getElementById("templateNameStatus");
const saveTemplateNameBtn = document.getElementById("saveTemplateNameBtn");
const closeTemplateNameBtn = document.getElementById("closeTemplateNameBtn");
const closeTemplateNameBackdrop = document.getElementById("closeTemplateNameBackdrop");

const pullSectionsBtn = document.getElementById("pullSectionsBtn");
const pullSectionsModal = document.getElementById("pullSectionsModal");
const pullSourceTemplateSelect = document.getElementById("pullSourceTemplateSelect");
const pullSectionsList = document.getElementById("pullSectionsList");
const pullSectionsSelectAllBtn = document.getElementById("pullSectionsSelectAllBtn");
const pullSectionsSelectNoneBtn = document.getElementById("pullSectionsSelectNoneBtn");
const pullSectionsStatus = document.getElementById("pullSectionsStatus");
const confirmPullSectionsBtn = document.getElementById("confirmPullSectionsBtn");
const closePullSectionsBtn = document.getElementById("closePullSectionsBtn");
const closePullSectionsBackdrop = document.getElementById("closePullSectionsBackdrop");

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

const RESUME_TEMPLATES_KEY = resumeStorage.keys.templates;
const RESUME_ACTIVE_TEMPLATE_KEY = resumeStorage.keys.activeTemplateId;
const RESUME_LEGACY_PROFILE_KEY = resumeStorage.keys.profile;
const RESUME_LEGACY_RAW_TEXT_KEY = resumeStorage.keys.rawText;

const BUILTIN_MODEL = modelStorage.DEFAULT_MODEL;

let isImporting = false;
let isResumeDirty = false;
let resumeProfile = schema.createEmptyResumeProfile();
let templates = [];
let activeTemplateId = null;
let isLoadingResume = false;
let templateNameMode = null;
const collapsedResumeSections = new Set();

document.addEventListener("DOMContentLoaded", async () => {
  initResumeEditorEvents();
  initTemplateEvents();
  await initModels();
  await loadResumeProfile();
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

function initTemplateEvents() {
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
  exportResumeJsonBtn.addEventListener("click", handleExportResumeJson);
  importResumeJsonBtn.addEventListener("click", () => {
    importResumeJsonFileEl.value = "";
    importResumeJsonFileEl.click();
  });
  importResumeJsonFileEl.addEventListener("change", handleImportResumeJson);

  closeTemplateNameBtn.addEventListener("click", closeTemplateNameModal);
  closeTemplateNameBackdrop.addEventListener("click", closeTemplateNameModal);
  saveTemplateNameBtn.addEventListener("click", handleSaveTemplateName);
  templateNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleSaveTemplateName();
    }
  });

  pullSectionsBtn.addEventListener("click", openPullSectionsModal);
  closePullSectionsBtn.addEventListener("click", closePullSectionsModal);
  closePullSectionsBackdrop.addEventListener("click", closePullSectionsModal);
  pullSourceTemplateSelect.addEventListener("change", renderPullSectionsList);
  pullSectionsSelectAllBtn.addEventListener("click", () => setAllPullSectionCheckboxes(true));
  pullSectionsSelectNoneBtn.addEventListener("click", () => setAllPullSectionCheckboxes(false));
  confirmPullSectionsBtn.addEventListener("click", handleConfirmPullSections);
}

function renderTemplateSelectors() {
  resumeTemplateSelect.innerHTML = templates
    .map(
      (template) =>
        `<option value="${escapeHtml(template.id)}">${escapeHtml(
          template.name
        )}</option>`
    )
    .join("");
  resumeTemplateSelect.value = activeTemplateId;
}

async function switchActiveTemplate(id) {
  if (!id || id === activeTemplateId) return;

  if (isResumeDirty) {
    await persistResumeProfile({ silent: true });
  }

  await resumeStorage.setActiveTemplateId(id);
  await loadResumeProfile();
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
      updatePageStatus("success", "已重命名模板");
    } else {
      if (isResumeDirty) {
        await persistResumeProfile({ silent: true });
      }
      const template = await resumeStorage.createTemplate(name);
      await resumeStorage.setActiveTemplateId(template.id);
      await loadResumeProfile();
      updatePageStatus("success", `已新建模板：${template.name}`);
    }
    closeTemplateNameModal();
  } catch (error) {
    templateNameStatus.textContent = error.message;
    templateNameStatus.className = "config-status error";
  } finally {
    saveTemplateNameBtn.disabled = false;
  }
}

function openPullSectionsModal() {
  const otherTemplates = templates.filter((template) => template.id !== activeTemplateId);

  pullSectionsStatus.textContent = "";
  pullSectionsStatus.className = "config-status";

  if (otherTemplates.length === 0) {
    pullSourceTemplateSelect.innerHTML = "";
    pullSourceTemplateSelect.disabled = true;
    pullSectionsList.innerHTML = "";
    confirmPullSectionsBtn.disabled = true;
    pullSectionsStatus.textContent = "没有其他模板可以拉取，请先新建或复制一个模板。";
    pullSectionsStatus.className = "config-status error";
    pullSectionsModal.classList.add("open");
    return;
  }

  pullSourceTemplateSelect.disabled = false;
  confirmPullSectionsBtn.disabled = false;
  pullSourceTemplateSelect.innerHTML = otherTemplates
    .map(
      (template) =>
        `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>`
    )
    .join("");

  renderPullSectionsList();
  pullSectionsModal.classList.add("open");
}

function closePullSectionsModal() {
  pullSectionsModal.classList.remove("open");
}

function buildPullItemSummary(section, item) {
  const parts = [];
  for (const field of section.fields) {
    const value = item?.[field.key];
    const text = typeof value === "string" ? value.trim() : value == null ? "" : String(value);
    if (text) parts.push(text);
    if (parts.length >= 2) break;
  }
  return parts.length ? parts.join(" · ") : "（未命名条目）";
}

function renderPullSectionsList() {
  const sourceId = pullSourceTemplateSelect.value;
  const sourceTemplate = templates.find((template) => template.id === sourceId);
  const sourceProfile = schema.normalizeResumeProfile(sourceTemplate?.profile || {});
  const stats = buildResumeSectionStats(sourceProfile);

  pullSectionsList.innerHTML = schema.sections
    .map((section) => {
      if (section.type === "list") {
        const items = Array.isArray(sourceProfile[section.key]) ? sourceProfile[section.key] : [];
        const entries = items
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => hasMeaningfulResumeValue(item));

        const rows = entries.length
          ? entries
              .map(
                ({ item, index }) => `
                  <label class="pull-section-row pull-section-item-row">
                    <input
                      type="checkbox"
                      data-section-key="${escapeHtml(section.key)}"
                      data-item-index="${index}"
                    />
                    <span class="pull-section-row-label">${escapeHtml(
                      buildPullItemSummary(section, item)
                    )}</span>
                  </label>
                `
              )
              .join("")
          : `<div class="pull-section-empty">源模板该模块暂无内容</div>`;

        return `
          <div class="pull-section-block">
            <div class="pull-section-block-title">
              <span>${escapeHtml(section.label)}</span>
              <span class="pull-section-row-hint">源模板 ${entries.length} 条</span>
            </div>
            ${rows}
          </div>
        `;
      }

      const sectionStats = stats.get(section.key);
      const hint = `源模板已填 ${sectionStats?.filledFields || 0}/${sectionStats?.totalFields || 0} 项`;
      return `
        <div class="pull-section-block">
          <label class="pull-section-row">
            <input type="checkbox" data-section-key="${escapeHtml(section.key)}" />
            <span class="pull-section-row-label">${escapeHtml(section.label)}</span>
            <span class="pull-section-row-hint">${escapeHtml(hint)}</span>
          </label>
        </div>
      `;
    })
    .join("");
}

function setAllPullSectionCheckboxes(checked) {
  pullSectionsList.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = checked;
  });
}

async function handleConfirmPullSections() {
  const sourceId = pullSourceTemplateSelect.value;
  const sourceTemplate = templates.find((template) => template.id === sourceId);
  if (!sourceTemplate) {
    pullSectionsStatus.textContent = "请选择一个来源模板";
    pullSectionsStatus.className = "config-status error";
    return;
  }

  const checkedBoxes = Array.from(
    pullSectionsList.querySelectorAll('input[type="checkbox"]:checked')
  );

  if (checkedBoxes.length === 0) {
    pullSectionsStatus.textContent = "请至少勾选一个模块或条目";
    pullSectionsStatus.className = "config-status error";
    return;
  }

  const groupKeys = [];
  const listIndicesByKey = new Map();

  for (const checkbox of checkedBoxes) {
    const key = checkbox.dataset.sectionKey;
    if (checkbox.dataset.itemIndex == null) {
      groupKeys.push(key);
    } else {
      if (!listIndicesByKey.has(key)) listIndicesByKey.set(key, []);
      listIndicesByKey.get(key).push(Number(checkbox.dataset.itemIndex));
    }
  }

  confirmPullSectionsBtn.disabled = true;
  try {
    if (isResumeDirty) {
      await persistResumeProfile({ silent: true });
    }

    const sourceProfile = schema.normalizeResumeProfile(sourceTemplate.profile || {});
    const nextProfile = schema.clone(resumeProfile);
    const summaryParts = [];
    const overflowParts = [];

    for (const key of groupKeys) {
      nextProfile[key] = schema.clone(sourceProfile[key]);
      summaryParts.push(schema.getSectionDefinition(key)?.label || key);
    }

    for (const [key, indices] of listIndicesByKey.entries()) {
      const sectionDef = schema.getSectionDefinition(key);
      const label = sectionDef?.label || key;
      const maxSlots = Math.max(1, Number(sectionDef?.slots) || 1);
      const initialItems = Math.min(maxSlots, Math.max(1, Number(sectionDef?.initialItems) || 1));

      const existingItems = Array.isArray(nextProfile[key]) ? nextProfile[key] : [];
      const keptExisting = existingItems.filter((item) => hasMeaningfulResumeValue(item));
      const incoming = indices.map((index) => schema.clone(sourceProfile[key][index]));

      const availableSlots = Math.max(0, maxSlots - keptExisting.length);
      const accepted = incoming.slice(0, availableSlots);
      const dropped = incoming.length - accepted.length;

      const merged = [...keptExisting, ...accepted];
      while (merged.length < initialItems) {
        merged.push(schema.createEmptyListItem(key));
      }
      nextProfile[key] = merged;

      summaryParts.push(`${label}（追加 ${accepted.length} 条）`);
      if (dropped > 0) {
        overflowParts.push(`${label} 有 ${dropped} 条因超出上限（最多 ${maxSlots} 条）未添加`);
      }
    }

    resumeProfile = nextProfile;
    await resumeStorage.saveTemplateContent(activeTemplateId, {
      profile: resumeProfile,
      schemaVersion: schema.version,
      rawText: resumeImportTextEl.value.trim(),
    });

    resetCollapsedResumeSections();
    renderResumeEditor(resumeProfile);
    isResumeDirty = false;
    saveResumeBtn.disabled = true;

    let message = `已从「${sourceTemplate.name}」拉取并保存：${summaryParts.join("、")}。`;
    if (overflowParts.length) {
      message += ` 注意：${overflowParts.join("；")}。`;
    }
    updatePageStatus(overflowParts.length ? "warning" : "success", message);
    closePullSectionsModal();
  } catch (error) {
    pullSectionsStatus.textContent = `拉取失败：${error.message}`;
    pullSectionsStatus.className = "config-status error";
  } finally {
    confirmPullSectionsBtn.disabled = false;
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
  updatePageStatus("success", `已导出 ${payload.templates.length} 个简历模板`);
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
    updatePageStatus("success", `已导入 ${result.templates.length} 个简历模板`);
  } catch (error) {
    updatePageStatus("error", `导入失败：${error.message}`);
  } finally {
    importTemplatesFileEl.value = "";
  }
}

async function handleExportResumeJson() {
  await persistResumeProfile({ silent: true });
  const payload = await resumeStorage.exportActiveTemplateData();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `标准简历-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  updatePageStatus("success", "已导出当前标准简历 JSON");
}

async function handleImportResumeJson() {
  const file = importResumeJsonFileEl.files?.[0];
  if (!file) return;
  if (!window.confirm("导入会覆盖当前模板内容，确定继续吗？")) return;
  try {
    const data = JSON.parse(await readFileAsText(file));
    await resumeStorage.importActiveTemplateData(data);
    await loadResumeProfile();
    updatePageStatus("success", "已导入当前标准简历 JSON");
  } catch (error) {
    updatePageStatus("error", `简历 JSON 导入失败：${error.message}`);
  } finally {
    importResumeJsonFileEl.value = "";
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
    updatePageStatus("success", `已复制为模板：${template.name}`);
  } catch (error) {
    updatePageStatus("error", `复制失败：${error.message}`);
  }
}

async function handleDeleteTemplate() {
  if (templates.length <= 1) {
    updatePageStatus("warning", "至少保留一个模板");
    return;
  }

  const current = templates.find((template) => template.id === activeTemplateId);
  if (!window.confirm(`确定删除模板「${current?.name || ""}」吗？此操作不可恢复。`)) {
    return;
  }

  activeTemplateId = await resumeStorage.deleteTemplate(activeTemplateId);
  await loadResumeProfile();
  updatePageStatus("success", "已删除模板");
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

function isModelConfigured(model) {
  return Boolean(model?.baseUrl && model?.apiKey && model?.model);
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
    updatePageStatus(
      "info",
      `已加载「${active?.name || "未命名"}」。当前共填写 ${countFilledSummaryItems(
        resumeProfile
      )} 个有效字段。`
    );
  } finally {
    isLoadingResume = false;
  }
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
  await resumeStorage.saveTemplateContent(activeTemplateId, {
    profile: nextProfile,
    schemaVersion: schema.version,
    rawText: resumeImportTextEl.value.trim(),
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
    await resumeStorage.saveTemplateContent(activeTemplateId, { rawText: text });

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
