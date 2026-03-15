// Content Script：识别表单字段 -> 调用 AI 映射 -> 自动填写（不提交）
(function () {
  "use strict";

  if (window.__AI_RESUME_AUTOFILL_LOADED__) return;
  window.__AI_RESUME_AUTOFILL_LOADED__ = true;

  const EXT_TAG = "[简历填表助手]";

  /** @type {Map<string, any>} */
  const fieldRuntimeMap = new Map();
  let lastFieldCount = 0;
  let lastFilledCount = 0;
  let isWorking = false;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const action = message?.action;

    if (action === "ping") {
      sendResponse({ success: true });
      return;
    }

    if (action === "getStatus") {
      sendResponse({
        success: true,
        fieldCount: lastFieldCount,
        filledCount: lastFilledCount,
      });
      return;
    }

    if (action === "startFill") {
      handleStartFill(message.config, message.resume, message.memory)
        .then((res) => sendResponse(res))
        .catch((err) =>
          sendResponse({ success: false, message: err?.message || String(err) })
        );
      return true;
    }

    if (action === "refillField") {
      handleRefill(message.fieldId, message.value)
        .then((res) => sendResponse(res))
        .catch((err) =>
          sendResponse({ success: false, message: err?.message || String(err) })
        );
      return true;
    }

    if (action === "snapshotPageMemory") {
      handleSnapshotPageMemory()
        .then((res) => sendResponse(res))
        .catch((err) =>
          sendResponse({ success: false, message: err?.message || String(err) })
        );
      return true;
    }

    if (action === "getFieldValue") {
      sendResponse(handleGetFieldValue(message.fieldId));
      return;
    }
  });

  async function handleStartFill(config, resumeStructured, memory) {
    if (isWorking) {
      return { success: false, message: "正在执行中，请稍后再试" };
    }
    isWorking = true;

    try {
      if (!resumeStructured || typeof resumeStructured !== "object") {
        throw new Error("简历数据为空：请先在侧边栏解析并保存简历");
      }

      const memoryIndex = buildMemoryIndex(memory);

      sendLog("info", "开始扫描页面表单字段...");
      const scan = scanFields();
      lastFieldCount = scan.fields.length;
      fieldRuntimeMap.clear();
      for (const runtime of scan.runtime) {
        fieldRuntimeMap.set(runtime.fieldId, runtime);
      }

      sendStats(lastFieldCount, 0);
      if (lastFieldCount === 0) {
        return {
          success: false,
          message: "未识别到可填写的字段，请确认当前页面包含表单",
        };
      }

      sendLog(
        "info",
        `已识别 ${lastFieldCount} 个字段，正在调用 AI 生成映射...`
      );

      const payload = {
        url: location.href,
        title: document.title,
        fields: scan.fields,
        resume: resumeStructured,
      };
      const prompt = JSON.stringify(payload);
      const aiText = await callAI(config, prompt, "form_fill");
      const mapping = parseJsonFromAiText(aiText);
      const fills = Array.isArray(mapping?.fills) ? mapping.fills : [];

      const fillById = new Map();
      for (const item of fills) {
        if (!item || !item.fieldId) continue;
        fillById.set(String(item.fieldId), item);
      }

      sendLog("info", "开始写入字段（不会自动提交）...");
      let filledCount = 0;
      const results = [];

      for (const field of scan.fields) {
        const fill = fillById.get(field.fieldId);
        const value = fill?.value;
        const aiReason = fill?.reason || "";

        const runtime = fieldRuntimeMap.get(field.fieldId);
        let r = await fillOne(runtime, value);
        let finalValue = normalizeValueForPreview(value);
        let finalReason = aiReason;

        if (!r.filled) {
          const mem = findMemoryForField(field, memoryIndex);
          if (mem?.value) {
            const memValue = parseRefillValue(runtime?.kind, mem.value);
            const r2 = await fillOne(runtime, memValue);
            if (r2.filled) {
              r = r2;
              finalValue = normalizeValueForPreview(mem.value);
              finalReason = `记忆库补全：${mem.label || mem.key}`;
            }
          }
        }

        if (r.filled) filledCount += 1;

        results.push({
          fieldId: field.fieldId,
          fieldLabel: field.label || field.name || field.placeholder || field.kind,
          value: finalValue,
          reason: finalReason,
          filled: r.filled,
          message: r.message,
        });
      }

      lastFilledCount = filledCount;
      sendStats(lastFieldCount, lastFilledCount);
      sendLog(
        "success",
        `填充完成：已填充 ${lastFilledCount}/${lastFieldCount} 个字段。请检查后手动提交。`
      );

      return {
        success: true,
        fieldCount: lastFieldCount,
        filledCount: lastFilledCount,
        items: results,
      };
    } finally {
      isWorking = false;
    }
  }

  async function handleRefill(fieldId, rawValue) {
    if (!fieldId) return { success: false, message: "缺少 fieldId" };

    const runtime = fieldRuntimeMap.get(String(fieldId));
    if (!runtime) return { success: false, message: "找不到字段：可能需要重新填充" };

    const value = parseRefillValue(runtime.kind, rawValue);
    const r = await fillOne(runtime, value);
    if (!r.filled) return { success: false, message: r.message || "重填失败" };
    return { success: true };
  }

  async function handleSnapshotPageMemory() {
    const scan = scanFields();
    const metaById = new Map(scan.fields.map((f) => [String(f.fieldId), f]));

    const items = [];
    for (const runtime of scan.runtime) {
      if (!runtime) continue;
      if (runtime.kind === "file") continue;

      const meta = metaById.get(String(runtime.fieldId));
      const label = normalizeText(
        meta?.label || meta?.name || meta?.placeholder || meta?.id || ""
      );
      if (!label) continue;

      const key = normalizeMemoryKey(label);
      if (!key) continue;

      const v = readRuntimeValue(runtime);
      let valueStr = "";
      if (Array.isArray(v)) {
        const arr = v.map((x) => String(x).trim()).filter(Boolean);
        if (arr.length === 0) continue;
        valueStr = JSON.stringify(arr);
      } else {
        valueStr = String(v || "").trim();
        if (!valueStr) continue;
      }

      items.push({
        key,
        label,
        value: valueStr,
        kind: runtime.kind,
      });
    }

    return { success: true, count: items.length, items };
  }

  function handleGetFieldValue(fieldId) {
    if (!fieldId) return { success: false, message: "缺少 fieldId" };
    const runtime = fieldRuntimeMap.get(String(fieldId));
    if (!runtime) return { success: false, message: "找不到字段：可能需要重新填充" };
    return { success: true, value: readRuntimeValue(runtime) };
  }

  function parseRefillValue(kind, rawValue) {
    const text = String(rawValue ?? "").trim();
    if (kind === "checkbox_group") {
      if (!text) return [];
      if (text.startsWith("[") && text.endsWith("]")) {
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) return parsed.map((v) => String(v));
        } catch (_) {
          // ignore
        }
      }
      return text
        .split(/[\n,，]/g)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return text;
  }

  function readRuntimeValue(runtime) {
    const kind = runtime?.kind;
    if (!runtime) return "";

    if (kind === "checkbox_group") {
      const selected = [];
      for (const opt of runtime.options || []) {
        if (opt?.el?.checked) selected.push(opt.label || opt.value || "");
      }
      return selected.filter(Boolean);
    }

    if (kind === "radio_group") {
      for (const opt of runtime.options || []) {
        if (opt?.el?.checked) return opt.label || opt.value || "";
      }
      return "";
    }

    if (kind === "select") {
      const el = runtime.el;
      if (!el || !el.options) return "";
      const opt = el.options[el.selectedIndex];
      return String(opt?.textContent || "").trim();
    }

    if (kind === "contenteditable") {
      return String(runtime.el?.textContent || "").trim();
    }

    return String(runtime.el?.value || "").trim();
  }

  async function fillOne(runtime, value) {
    if (!runtime) return { filled: false, message: "字段不存在" };

    const kind = runtime.kind;
    if (kind === "file") {
      return { filled: false, message: "文件上传字段无法自动填写" };
    }

    if (kind === "checkbox_group") {
      const desired = Array.isArray(value)
        ? value.map((v) => String(v))
        : String(value || "")
            .split(/[\n,，]/g)
            .map((s) => s.trim())
            .filter(Boolean);
      if (desired.length === 0) {
        return { filled: false, message: "AI 未给出勾选项" };
      }

      const options = runtime.options || [];
      let any = false;
      for (const opt of options) {
        const label = String(opt.label || "").trim();
        const shouldCheck = desired.some((d) => isFuzzyMatch(label, d));
        if (!shouldCheck) continue;
        const ok = await safeCheck(opt.el, true);
        if (ok) any = true;
      }
      return any
        ? { filled: true }
        : { filled: false, message: "未找到可匹配的多选项" };
    }

    if (kind === "radio_group") {
      const desired = String(value || "").trim();
      if (!desired) return { filled: false, message: "AI 未给出选择项" };

      const options = runtime.options || [];
      const best = pickBestOption(options, desired);
      if (!best) return { filled: false, message: "未找到可匹配的单选项" };
      const ok = await safeCheck(best.el, true);
      return ok ? { filled: true } : { filled: false, message: "点击单选项失败" };
    }

    if (kind === "select") {
      const desired = String(value || "").trim();
      if (!desired) return { filled: false, message: "AI 未给出选择值" };
      const ok = selectByText(runtime.el, desired);
      return ok ? { filled: true } : { filled: false, message: "未找到可匹配的下拉选项" };
    }

    if (kind === "date_like") {
      return fillDateLikeField(runtime, value);
    }

    if (kind === "contenteditable") {
      const desired = String(value || "");
      if (!desired) return { filled: false, message: "AI 未给出填写内容" };
      const el = runtime.el;
      scrollIntoView(el);
      el.focus?.();
      el.textContent = desired;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { filled: true };
    }

    // text / textarea / input(date/email/tel/...) 统一按 value 写入
    const desired = String(value || "");
    if (!desired) return { filled: false, message: "AI 未给出填写内容" };
    const el = runtime.el;
    const ok = setValueWithEvents(el, desired);
    return ok ? { filled: true } : { filled: false, message: "写入失败" };
  }

  function normalizeValueForPreview(value) {
    if (Array.isArray(value)) return JSON.stringify(value);
    if (value == null) return "";
    return String(value);
  }

  const ANT_DATE_PRESETS = {
    antCalendarWithYearSelect: {
      yearPanelSelector: ".ant-calendar-year-select",
      yearElementSelector:
        ".ant-calendar-year-panel-cell:not(.ant-calendar-year-panel-cell-disabled):not(.ant-calendar-year-panel-last-decade-cell):not(.ant-calendar-year-panel-next-decade-cell)",
      yearFilterClasses: false,
      decadeSelector: ".ant-calendar-year-panel-decade-select-content",
      nextDecadeBtn: ".ant-calendar-year-panel-next-decade-btn",
      prevDecadeBtn: ".ant-calendar-year-panel-prev-decade-btn",
      monthConfig: ".ant-calendar-month-select",
      monthElementSelector: ".ant-calendar-month-panel-month",
      dayElementSelector: ".ant-calendar-date",
      yearRetryTimes: 60,
      monthRetryTimes: 12,
    },
    antCalendar: {
      yearPanelSelector: null,
      yearElementSelector: ".ant-calendar-month-panel-year-select-content",
      yearFilterClasses: true,
      decadeSelector: ".ant-calendar-year-panel-decade-select-content",
      nextDecadeBtn: ".ant-calendar-month-panel-next-year-btn",
      prevDecadeBtn: ".ant-calendar-month-panel-prev-year-btn",
      monthConfig: "",
      monthElementSelector: ".ant-calendar-month-panel-month",
      dayElementSelector: ".ant-calendar-date",
      yearRetryTimes: 60,
      monthRetryTimes: 12,
    },
    antPicker: {
      yearPanelSelector: ".ant-picker-year-btn",
      yearElementSelector: ".ant-picker-cell-in-view",
      yearFilterClasses: false,
      decadeSelector: ".ant-picker-decade-btn",
      nextDecadeBtn: ".ant-picker-header-super-next-btn",
      prevDecadeBtn: ".ant-picker-header-super-prev-btn",
      monthConfig: ".ant-picker-month-btn",
      monthElementSelector: ".ant-picker-cell",
      dayElementSelector: ".ant-picker-cell",
      yearRetryTimes: 60,
      monthRetryTimes: 12,
    },
  };

  async function fillDateLikeField(runtime, value) {
    const normalized = normalizeDateLikeValue(value, runtime);
    if (!normalized.ok) {
      return { filled: false, message: normalized.message };
    }

    const el = runtime?.el;
    if (!el) return { filled: false, message: "日期字段不存在" };

    if ((runtime?.framework || "") === "ant") {
      const antOk = await fillAntDateLikeByPreset(runtime, normalized.value);
      if (antOk) return { filled: true };
    }

    if (setDateValueWithEvents(el, normalized.value, runtime)) {
      return { filled: true };
    }

    const panelOk = await fillDateLikeByPanel(runtime, normalized.value);
    return panelOk
      ? { filled: true }
      : { filled: false, message: "日期写入失败" };
  }

  function normalizeDateLikeValue(value, runtime) {
    const raw = String(value || "").trim();
    if (!raw) {
      return { ok: false, message: "AI 未给出日期内容" };
    }

    const mode = runtime?.dateMode || "date";
    const normalized = raw
      .replace(/[./]/g, "-")
      .replace(/年/g, "-")
      .replace(/月/g, "-")
      .replace(/日/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (mode === "month") {
      const match = normalized.match(/^(\d{4})-(\d{1,2})$/);
      if (!match) {
        return { ok: false, message: "日期格式不支持：需要 YYYY-MM" };
      }
      const year = match[1];
      const month = padDatePart(match[2]);
      if (!isMonthInRange(month)) {
        return { ok: false, message: "月份超出范围" };
      }
      return { ok: true, value: `${year}-${month}` };
    }

    if (mode === "datetime-local") {
      const match = normalized.match(
        /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?$/
      );
      if (!match) {
        return {
          ok: false,
          message: "日期时间格式不支持：需要 YYYY-MM-DDTHH:mm",
        };
      }
      const year = match[1];
      const month = padDatePart(match[2]);
      const day = padDatePart(match[3]);
      const hour = padDatePart(match[4] || "00");
      const minute = padDatePart(match[5] || "00");
      if (!isMonthInRange(month) || !isDayInRange(day)) {
        return { ok: false, message: "日期超出范围" };
      }
      if (!isHourInRange(hour) || !isMinuteInRange(minute)) {
        return { ok: false, message: "时间超出范围" };
      }
      return { ok: true, value: `${year}-${month}-${day}T${hour}:${minute}` };
    }

    const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) {
      return { ok: false, message: "日期格式不支持：需要 YYYY-MM-DD" };
    }
    const year = match[1];
    const month = padDatePart(match[2]);
    const day = padDatePart(match[3]);
    if (!isMonthInRange(month) || !isDayInRange(day)) {
      return { ok: false, message: "日期超出范围" };
    }
    return { ok: true, value: `${year}-${month}-${day}` };
  }

  function setDateValueWithEvents(el, value, runtime) {
    if (!el) return false;
    scrollIntoView(el);

    try {
      el.focus?.();
      setNativeValue(el, value);
      dispatchTextInputEvent(el);
      dispatchKeyboardCommitEvents(el);
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.blur?.();
      const actual = String(el.value || "").trim();
      return isNormalizedDateMatch(actual, value, runtime?.dateMode || "date");
    } catch (e) {
      console.warn(EXT_TAG, "日期写入失败", e);
      return false;
    }
  }

  async function fillDateLikeByPanel(runtime, value) {
    const el = runtime?.el;
    if (!el) return false;

    await openDateLikePanel(el);
    const panel = await waitForDateLikePanel(runtime, 1200);
    if (!panel) return false;

    const parts = splitNormalizedDateValue(value, runtime?.dateMode || "date");
    if (!parts) return false;

    if (!(await prepareDatePanel(panel, runtime, parts))) {
      return false;
    }

    const isAntFramework = (runtime?.framework || "") === "ant";
    const isAntPicker = isAntFramework && isAntPickerPanel(panel);

    if (!isAntFramework || isAntPicker) {
      if (!(await clickDatePart(panel, "month", parts.month))) {
        return false;
      }
    }

    if ((runtime?.dateMode || "date") !== "month") {
      if (!(await clickDatePart(panel, "day", parts.day))) {
        return false;
      }
    }

    await sleep(20);
    const actual = String(el.value || "").trim();
    if (isNormalizedDateMatch(actual, value, runtime?.dateMode || "date")) {
      return true;
    }

    if (isAntFramework && !isAntPicker) {
      return fillAntCalendarByInput(panel, el, value, runtime);
    }

    return false;
  }

  async function waitForDateLikePanel(runtime, timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const panel = findDateLikePanel(runtime);
      if (panel) return panel;
      await sleep(30);
    }
    return null;
  }

  async function prepareDatePanel(panel, runtime, parts) {
    if ((runtime?.framework || "") === "ant") {
      return syncAntDatePanel(panel, parts);
    }
    return panelMatchesYear(panel, parts.year);
  }

  async function syncAntDatePanel(panel, parts) {
    if (isAntPickerPanel(panel)) {
      return syncAntPickerPanel(panel, parts);
    }
    return syncAntCalendarPanel(panel, parts);
  }

  async function fillAntCalendarByInput(panel, targetEl, value, runtime) {
    const input = panel.querySelector?.(".ant-calendar-input");
    if (!input) return false;

    try {
      input.focus?.();
      setNativeValue(input, value);
      dispatchTextInputEvent(input);
      dispatchKeyboardCommitEvents(input);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (_) {
      return false;
    }

    const okBtn = panel.querySelector?.(".ant-calendar-ok-btn");
    if (okBtn) {
      const clicked = await dispatchRealClickSequence(okBtn, 50);
      if (!clicked) {
        if (okBtn?.click) {
          okBtn.click();
        } else if (okBtn?.dispatchEvent) {
          okBtn.dispatchEvent(new Event("click", { bubbles: true }));
        }
      }
    }

    await sleep(50);
    const actual = String(targetEl?.value || "").trim();
    return isNormalizedDateMatch(actual, value, runtime?.dateMode || "date");
  }

  async function openDateLikePanel(el) {
    const trigger = findDateTriggerElement(el);
    const target = trigger || el;
    scrollIntoView(target);
    target?.focus?.();
    el.focus?.();
    if (await dispatchRealClickSequence(target, 20)) {
      return;
    }
    if (target && typeof target.click === "function") {
      target.click();
      return;
    }
    if (typeof el.click === "function") {
      el.click();
      return;
    }
    target?.dispatchEvent?.(new Event("click", { bubbles: true }));
  }

  function findDateLikePanel(runtime) {
    const selectors = getDateLikePanelSelectors(runtime);

    for (const selector of selectors) {
      const panels = Array.from(document.querySelectorAll(selector) || []);
      const visible = panels.find((panel) => isDatePanelVisible(panel, runtime));
      if (visible) return visible;
    }
    return null;
  }

  function getDateLikePanelSelectors(runtime) {
    const framework = String(runtime?.framework || "");
    if (framework === "ant") {
      return [
        '[data-role="mock-date-panel"]',
        ".ant-calendar-picker-container:not(.slide-up-leave)",
        ".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)",
        ".ant-calendar-picker-container",
        ".ant-calendar",
        ".ant-picker-dropdown",
      ];
    }

    return [
      '[data-role="mock-date-panel"]',
      ".ant-calendar-picker-container:not(.slide-up-leave)",
      ".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)",
      ".ant-calendar-picker-container",
      ".ant-calendar",
      ".ant-picker-dropdown",
      ".el-picker-panel",
      ".flatpickr-calendar",
      '[class*="picker-panel"]',
      '[class*="datepicker"]',
      '[class*="calendar"]',
    ];
  }

  function findDateTriggerElement(el) {
    if (!el) return null;
    const antPicker = el.closest?.(".ant-picker");
    if (antPicker) return antPicker;

    const antWrapper = el.closest?.(".ant-calendar-picker");
    if (antWrapper) return antWrapper;

    const antPickerSuffix = el.parentElement?.querySelector?.(".ant-picker-suffix");
    if (antPickerSuffix) return antPickerSuffix;

    const antIcon = el.parentElement?.querySelector?.(".ant-calendar-picker-icon");
    if (antIcon) return antIcon;

    return el;
  }

  function isDatePanelVisible(panel, runtime) {
    if (!panel) return false;
    const ariaHidden = panel.getAttribute?.("aria-hidden");
    if (ariaHidden === "true") return false;
    const className = String(panel.className || "");
    if (
      className.includes("slide-up-leave") ||
      className.includes("leave-active") ||
      className.includes("ant-picker-dropdown-hidden")
    ) {
      return false;
    }

    if (panel.classList?.contains?.("open")) return true;

    const owner = runtime?.el;
    if (owner && panel.contains?.(owner)) return true;

    try {
      const style = getComputedStyle(panel);
      if (style.display === "none" || style.visibility === "hidden") return false;
    } catch (_) {
      // ignore
    }

    return true;
  }

  function isAntPickerPanel(panel) {
    if (!panel) return false;
    const className = String(panel.className || "");
    if (className.includes("ant-picker")) return true;
    if (panel.querySelector?.(".ant-picker-year-btn")) return true;
    return false;
  }

  function splitNormalizedDateValue(value, mode) {
    const text = String(value || "").trim();
    if (!text) return null;

    if (mode === "month") {
      const match = text.match(/^(\d{4})-(\d{2})$/);
      if (!match) return null;
      return { year: match[1], month: match[2], day: "" };
    }

    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
    if (!match) return null;
    return {
      year: match[1],
      month: match[2],
      day: match[3],
      hour: match[4] || "",
      minute: match[5] || "",
    };
  }

  function getAntDatePreset(name) {
    const preset = ANT_DATE_PRESETS[name];
    if (!preset) {
      throw new Error(`未找到日期选择器预设: ${name}`);
    }
    return preset;
  }

  function extractDisplayYear(text) {
    const samples = [
      { regex: /(\d{4})\s*年\s*-\s*(\d{4})\s*年/, group: 2 },
      { regex: /(\d{4})\s*年/, group: 1 },
      { regex: /(\d{4})/, group: 1 },
    ];
    for (const sample of samples) {
      const match = String(text || "").match(sample.regex);
      if (match) return Number(match[sample.group]);
    }
    return null;
  }

  function extractDisplayMonth(text) {
    const samples = [
      { regex: /(\d{4})\s*年\s*(\d{1,2})\s*月/, group: 2 },
      { regex: /(\d{1,2})\s*月/, group: 1 },
    ];
    for (const sample of samples) {
      const match = String(text || "").match(sample.regex);
      if (match) return Number(match[sample.group]);
    }
    return null;
  }

  function getMonthAliases(month) {
    return (
      [
        ["一月", "1月", "01", "1", "Jan", "01月"],
        ["二月", "2月", "02", "2", "Feb", "02月"],
        ["三月", "3月", "03", "3", "Mar", "03月"],
        ["四月", "4月", "04", "4", "Apr", "04月"],
        ["五月", "5月", "05", "5", "May", "05月"],
        ["六月", "6月", "06", "6", "Jun", "06月"],
        ["七月", "7月", "07", "7", "Jul", "07月"],
        ["八月", "8月", "08", "8", "Aug", "08月"],
        ["九月", "9月", "09", "9", "Sept", "09月"],
        ["十月", "10月", "10", "10", "Oct", "10月"],
        ["十一月", "11月", "11", "11", "Nov", "11月"],
        ["十二月", "12月", "12", "12", "Dec", "12月"],
      ][month - 1] || []
    );
  }

  function isLegacyAntCalendarInput(el) {
    if (!el) return false;
    const className = String(el.className || "");
    return (
      className.includes("ant-calendar-picker-input") ||
      Boolean(el.closest?.(".ant-calendar-picker"))
    );
  }

  function isModernAntPickerInput(el) {
    if (!el) return false;
    const className = String(el.className || "");
    return className.includes("ant-picker") || Boolean(el.closest?.(".ant-picker"));
  }

  async function dispatchFocusClickOpen(el, waitMs) {
    if (!el || typeof el.dispatchEvent !== "function") return false;
    try {
      el.focus?.();
      el.dispatchEvent(new Event("focus"));
    } catch (_) {
      // ignore
    }
    el.dispatchEvent(
      createMouseLikeEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      })
    );
    if ((waitMs || 0) > 0) {
      await sleep(waitMs);
    }
    return true;
  }

  async function fillAntDateLikeByPreset(runtime, value) {
    const el = runtime?.el;
    if (!el) return false;

    if (isLegacyAntCalendarInput(el)) {
      const selector = ".ant-calendar-picker-container:not(.slide-up-leave)";
      if (!document.querySelector(selector)) {
        await dispatchFocusClickOpen(el, 10);
      }
      const panel = document.querySelector(selector);
      if (!panel) return false;
      const presetName = panel.querySelector(".ant-calendar-year-select")
        ? "antCalendarWithYearSelect"
        : "antCalendar";
      const ok = await navigateDatePanelByPreset(presetName, panel, value);
      await sleep(50);
      return ok && isNormalizedDateMatch(String(el.value || "").trim(), value, runtime?.dateMode);
    }

    if (isModernAntPickerInput(el)) {
      await dispatchRealClickSequence(el, 100);
      const panel = document.querySelector(".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)");
      if (!panel) return false;
      const ok = await navigateDatePanelByPreset("antPicker", panel, value);
      await sleep(50);
      return ok && isNormalizedDateMatch(String(el.value || "").trim(), value, runtime?.dateMode);
    }

    return false;
  }

  async function navigateDatePanelByPreset(presetOrOptions, containerArg, dateStrArg) {
    let options;
    if (typeof presetOrOptions === "string") {
      if (!containerArg || !dateStrArg) return false;
      options = {
        container: containerArg,
        dateStr: dateStrArg,
        ...getAntDatePreset(presetOrOptions),
      };
    } else {
      options = presetOrOptions;
    }

    let {
      container,
      dateStr,
      yearPanelSelector,
      yearElementSelector,
      yearFilterClasses,
      decadeSelector,
      nextDecadeBtn,
      prevDecadeBtn,
      monthConfig,
      monthElementSelector,
      dayElementSelector,
      yearRetryTimes = 60,
      subContainerSelector = null,
      monthRetryTimes = 10,
    } = options || {};

    const root = container;
    let scope = root;
    let success = false;
    let yearMatched = false;

    const applySubContainer = () => {
      if (!subContainerSelector) {
        scope = root;
        return;
      }
      const sub = root.querySelector(subContainerSelector);
      scope = sub || root;
    };

    try {
      const [rawYear, rawMonth, rawDay] = String(dateStr || "")
        .split("-")
        .map((part) => Number(part));
      const targetYear = rawYear;
      const targetMonth = rawMonth;
      const targetDay = Number.isNaN(rawDay) ? 1 : rawDay;
      if (
        !(Number.isInteger(targetYear) && targetYear >= 1900 && targetYear <= 2100) ||
        !(Number.isInteger(targetMonth) && targetMonth >= 1 && targetMonth <= 12) ||
        !(Number.isInteger(targetDay) && targetDay >= 1 && targetDay <= 31)
      ) {
        return false;
      }

      const selectDay = async () => {
        if (!dayElementSelector || !Number.isInteger(targetDay)) {
          success = true;
          return;
        }
        applySubContainer();
        await sleep(50);
        if (!isDatePanelVisible(scope, {})) return;

        const cells = Array.from(scope.querySelectorAll?.(dayElementSelector) || []);
        if (cells.length === 0) {
          success = true;
          return;
        }
        const firstText = normalizeText(cells[0]?.textContent || "");
        if (firstText.includes("月")) {
          success = true;
          return;
        }
        const matched = cells.filter((cell) => {
          const text = normalizeText(cell.textContent || "");
          return Number(text) === targetDay;
        });
        const target = targetDay <= 15 ? matched[0] : matched[matched.length - 1];
        if (!target) return;
        await dispatchRealClickSequence(target, 100);
        success = true;
      };

      const selectMonth = async () => {
        if (!monthElementSelector || !Number.isInteger(targetMonth)) {
          await selectDay();
          return;
        }

        applySubContainer();
        if (monthConfig == null || typeof monthConfig !== "object") {
          if (monthConfig) {
            const toggle = scope.querySelector(monthConfig);
            if (toggle) {
              await dispatchRealClickSequence(toggle, 100);
              applySubContainer();
              await sleep(100);
            }
          }
          const aliases = getMonthAliases(targetMonth);
          const cells = Array.from(scope.querySelectorAll?.(monthElementSelector) || []);
          const target = cells.find((cell) => {
            const text = normalizeText(String(cell.textContent || "").replace(/\s+/g, ""));
            return aliases.includes(text);
          });
          if (!target) return;
          await dispatchRealClickSequence(target, 100);
          await selectDay();
          return;
        }

        if (monthRetryTimes <= 0) return;
        const currentText = String(
          scope.querySelector?.(monthElementSelector)?.textContent || ""
        );
        const currentMonth = extractDisplayMonth(currentText);
        if (currentMonth === targetMonth) {
          await selectDay();
          return;
        }
        const selector =
          targetMonth > Number(currentMonth || 0)
            ? monthConfig.nextMonthSelector
            : monthConfig.prevMonthSelector;
        const btn = scope.querySelector(selector);
        if (!btn) return;
        monthRetryTimes -= 1;
        await dispatchRealClickSequence(btn, 100);
        await selectMonth();
        if (!success && yearMatched) {
          await sleep(200);
          if (!isDatePanelVisible(scope, {})) {
            success = true;
          }
        }
      };

      const selectYear = async () => {
        if (!yearElementSelector || !Number.isInteger(targetYear)) {
          await selectMonth();
          return;
        }

        if (yearRetryTimes <= 0) return;
        applySubContainer();

        if (yearPanelSelector == null) {
          const text = String(scope.querySelector?.(yearElementSelector)?.textContent || "");
          const currentYear = extractDisplayYear(text);
          if (currentYear === targetYear) {
            yearMatched = true;
            await selectMonth();
            return;
          }

          const fallbackSelector =
            targetYear > Number(currentYear || 0)
              ? nextDecadeBtn ||
                (monthConfig && typeof monthConfig === "object"
                  ? monthConfig.nextMonthSelector
                  : "")
              : prevDecadeBtn ||
                (monthConfig && typeof monthConfig === "object"
                  ? monthConfig.prevMonthSelector
                  : "");
          const btn = fallbackSelector ? scope.querySelector(fallbackSelector) : null;
          if (!btn) return;
          yearRetryTimes -= 1;
          await dispatchRealClickSequence(btn, 50);
          await selectYear();
          return;
        }

        const cells = Array.from(scope.querySelectorAll?.(yearElementSelector) || []);
        const matched = cells.find((cell, index) => {
          const text = String(cell.textContent || "");
          const numeric = extractDisplayYear(text);
          if (text === String(targetYear) || numeric === targetYear) {
            if (yearFilterClasses === true) {
              return index !== 0 && index !== cells.length - 1;
            }
            if (Array.isArray(yearFilterClasses) && yearFilterClasses.length > 0) {
              return !yearFilterClasses.some((name) => cell.closest?.(`.${name}`));
            }
            return true;
          }
          return false;
        });

        if (matched) {
          await dispatchRealClickSequence(matched, 100);
          yearMatched = true;
          await selectMonth();
          return;
        }

        let currentYear = null;
        if (decadeSelector) {
          const decade = scope.querySelector(decadeSelector);
          currentYear = extractDisplayYear(String(decade?.textContent || ""));
        }
        if (currentYear == null) {
          const lastCell = cells[cells.length - 1];
          currentYear = extractDisplayYear(String(lastCell?.textContent || ""));
        }
        if (currentYear == null) return;
        const btn = scope.querySelector(
          targetYear >= currentYear ? nextDecadeBtn : prevDecadeBtn
        );
        if (!btn) return;
        yearRetryTimes -= 1;
        await dispatchRealClickSequence(btn, 100);
        await selectYear();
      };

      applySubContainer();
      if (yearPanelSelector != null) {
        const toggle = scope.querySelector(yearPanelSelector);
        if (toggle) {
          await dispatchRealClickSequence(toggle, 100);
          applySubContainer();
        }
      }
      await selectYear();
    } catch (_) {
      success = false;
    }

    return success;
  }

  async function syncAntCalendarPanel(panel, parts) {
    const targetYear = Number(parts?.year || 0);
    const targetMonth = Number(parts?.month || 0);
    if (!targetYear || !targetMonth) return false;

    for (let i = 0; i < 240; i += 1) {
      const currentYear = readAntCalendarYear(panel);
      const currentMonth = readAntCalendarMonth(panel);
      if (currentYear === targetYear && currentMonth === targetMonth) {
        return true;
      }

      if (currentYear && currentYear !== targetYear) {
        const selector =
          currentYear > targetYear
            ? ".ant-calendar-prev-year-btn"
            : ".ant-calendar-next-year-btn";
        if (!(await clickPanelButton(panel, selector))) return false;
        await sleep(10);
        continue;
      }

      if (currentMonth && currentMonth !== targetMonth) {
        const selector =
          currentMonth > targetMonth
            ? ".ant-calendar-prev-month-btn"
            : ".ant-calendar-next-month-btn";
        if (!(await clickPanelButton(panel, selector))) return false;
        await sleep(10);
        continue;
      }

      return false;
    }

    return false;
  }

  async function syncAntPickerPanel(panel, parts) {
    const targetYear = Number(parts?.year || 0);
    const targetMonth = Number(parts?.month || 0);
    if (!targetYear || !targetMonth) return false;

    for (let i = 0; i < 240; i += 1) {
      const currentYear = readAntPickerYear(panel);
      if (currentYear === targetYear) break;
      if (!currentYear) return false;
      const selector =
        currentYear > targetYear
          ? ".ant-picker-header-super-prev-btn"
          : ".ant-picker-header-super-next-btn";
      if (!(await clickPanelButton(panel, selector))) return false;
      await sleep(10);
    }

    const actualYear = readAntPickerYear(panel);
    if (actualYear !== targetYear) return false;

    if (readAntPickerMonth(panel) === targetMonth) {
      return true;
    }

    if (!(await clickPanelButton(panel, ".ant-picker-month-btn"))) {
      return false;
    }
    await sleep(10);
    if (!(await clickDatePart(panel, "month", parts.month))) {
      return false;
    }
    await sleep(20);
    return true;
  }

  function readAntCalendarYear(panel) {
    const text = String(
      panel.querySelector?.(".ant-calendar-year-select")?.textContent || ""
    );
    const match = text.match(/\d{4}/);
    return match ? Number(match[0]) : 0;
  }

  function readAntCalendarMonth(panel) {
    const text = normalizeText(
      panel.querySelector?.(".ant-calendar-month-select")?.textContent || ""
    );
    const zhMatch = text.match(/(\d{1,2})月/);
    if (zhMatch) return Number(zhMatch[1]);
    const plainMatch = text.match(/^(\d{1,2})$/);
    if (plainMatch) return Number(plainMatch[1]);
    return 0;
  }

  function readAntPickerYear(panel) {
    const text = normalizeText(panel.querySelector?.(".ant-picker-year-btn")?.textContent || "");
    const match = text.match(/\d{4}/);
    return match ? Number(match[0]) : 0;
  }

  function readAntPickerMonth(panel) {
    const text = normalizeText(panel.querySelector?.(".ant-picker-month-btn")?.textContent || "");
    const zhMatch = text.match(/(\d{1,2})月/);
    if (zhMatch) return Number(zhMatch[1]);
    const plainMatch = text.match(/^(\d{1,2})$/);
    if (plainMatch) return Number(plainMatch[1]);
    return 0;
  }

  async function clickPanelButton(panel, selector) {
    const button = panel.querySelector?.(selector);
    if (!button) return false;
    if (await dispatchRealClickSequence(button, 20)) {
      return true;
    }
    if (typeof button.click === "function") {
      button.click();
      return true;
    }
    button.dispatchEvent?.(new Event("click", { bubbles: true }));
    return true;
  }

  function panelMatchesYear(panel, expectedYear) {
    const yearEl =
      panel.querySelector?.('[data-role="selected-year"]') ||
      panel.querySelector?.(".ant-calendar-year-select") ||
      panel.querySelector?.('[class*="year"]');
    if (!yearEl) return true;
    const actualYear = String(yearEl.textContent || "").match(/\d{4}/)?.[0] || "";
    return !actualYear || actualYear === expectedYear;
  }

  async function clickDatePart(panel, part, expected) {
    if (!expected) return false;
    const selectors =
      part === "month"
        ? [
          '[data-role="month-cell"]',
          "[data-month]",
          ".ant-picker-cell",
          ".ant-calendar-month-panel-cell .ant-calendar-month-panel-month",
          ".ant-calendar-month-panel-month",
          '[class*="month"]',
        ]
        : [
          '[data-role="day-cell"]',
          "[data-day]",
          ".ant-picker-cell",
          ".ant-calendar-cell .ant-calendar-date",
          ".ant-calendar-date",
          '[class*="day"]',
        ];

    for (const selector of selectors) {
      const cells = Array.from(panel.querySelectorAll?.(selector) || []);
      const cell = cells.find((item) => matchDateCell(item, part, expected));
      if (!cell) continue;

      if (await dispatchRealClickSequence(cell, 20)) {
        return true;
      }
      if (typeof cell.click === "function") {
        cell.click();
      } else {
        cell.dispatchEvent?.(new Event("click", { bubbles: true }));
      }
      return true;
    }
    return false;
  }

  function matchDateCell(cell, part, expected) {
    if (!cell) return false;
    const attrName = part === "month" ? "data-month" : "data-day";
    const attrValue = String(cell.getAttribute?.(attrName) || "").trim();
    const text = normalizeText(cell.textContent || "");
    const title = String(cell.getAttribute?.("title") || "").trim();
    if (attrValue === expected) return true;
    if (title === expected) return true;
    if (title.endsWith(`-${expected}`)) return true;
    if (part === "month" && title.includes(`-${expected}-`)) return true;
    if (text === expected) return true;
    if (text === String(Number(expected))) return true;
    if (part === "month" && (text === `${expected}月` || text === `${Number(expected)}月`)) {
      return true;
    }
    return false;
  }

  async function dispatchRealClickSequence(el, waitMs) {
    if (!el || typeof el.dispatchEvent !== "function") return false;

    const rect =
      typeof el.getBoundingClientRect === "function"
        ? el.getBoundingClientRect()
        : { left: 0, top: 0, width: 0, height: 0 };
    const centerX = Number(rect.left || 0) + Math.max(0, Number(rect.width || 0)) / 2;
    const centerY = Number(rect.top || 0) + Math.max(0, Number(rect.height || 0)) / 2;
    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: centerX,
      clientY: centerY,
      screenX: centerX,
      screenY: centerY,
      button: 0,
      buttons: 1,
    };

    try {
      el.focus?.();
    } catch (_) {
      // ignore
    }

    try {
      if (typeof PointerEvent === "function") {
        el.dispatchEvent(new PointerEvent("pointerdown", eventInit));
      }
    } catch (_) {
      // ignore
    }

    for (const type of ["mousedown", "mouseup", "click"]) {
      el.dispatchEvent(createMouseLikeEvent(type, eventInit));
      if (type !== "click") {
        await sleep(12);
      }
    }

    if ((waitMs || 0) > 0) {
      await sleep(waitMs);
    }
    return true;
  }

  function createMouseLikeEvent(type, init) {
    if (typeof MouseEvent === "function") {
      return new MouseEvent(type, init);
    }
    const event = new Event(type, {
      bubbles: init?.bubbles,
      cancelable: init?.cancelable,
    });
    for (const [key, value] of Object.entries(init || {})) {
      try {
        event[key] = value;
      } catch (_) {
        // ignore
      }
    }
    return event;
  }

  function dispatchTextInputEvent(el) {
    if (!el || typeof el.dispatchEvent !== "function") return;
    if (typeof InputEvent === "function") {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: null }));
      return;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function dispatchKeyboardCommitEvents(el) {
    if (!el || typeof el.dispatchEvent !== "function") return;
    for (const key of ["Enter", "Tab"]) {
      dispatchKeyboardEvent(el, "keydown", key);
      dispatchKeyboardEvent(el, "keyup", key);
    }
  }

  function dispatchKeyboardEvent(el, type, key) {
    if (typeof KeyboardEvent === "function") {
      el.dispatchEvent(
        new KeyboardEvent(type, {
          bubbles: true,
          key,
        })
      );
      return;
    }
    const event = new Event(type, { bubbles: true });
    event.key = key;
    el.dispatchEvent(event);
  }

  function isNormalizedDateMatch(actual, expected, mode) {
    const left = normalizeDateLikeValue(actual, { dateMode: mode });
    const right = normalizeDateLikeValue(expected, { dateMode: mode });
    if (!left.ok || !right.ok) return String(actual || "").trim() === String(expected || "").trim();
    return left.value === right.value;
  }

  function padDatePart(value) {
    return String(value || "").padStart(2, "0");
  }

  function isMonthInRange(value) {
    const month = Number(value);
    return Number.isInteger(month) && month >= 1 && month <= 12;
  }

  function isDayInRange(value) {
    const day = Number(value);
    return Number.isInteger(day) && day >= 1 && day <= 31;
  }

  function isHourInRange(value) {
    const hour = Number(value);
    return Number.isInteger(hour) && hour >= 0 && hour <= 23;
  }

  function isMinuteInRange(value) {
    const minute = Number(value);
    return Number.isInteger(minute) && minute >= 0 && minute <= 59;
  }

  function detectDateFieldMeta(el, label) {
    if (!el || el.tagName?.toLowerCase?.() !== "input") return null;

    const type = String(el.getAttribute("type") || "text").toLowerCase();
    const name = String(el.getAttribute("name") || "");
    const id = String(el.id || "");
    const placeholder = String(el.getAttribute("placeholder") || "");
    const autocomplete = String(el.getAttribute("autocomplete") || "");
    const className = String(el.className || "");
    const haystack = [label, name, id, placeholder, autocomplete, className]
      .join(" ")
      .toLowerCase();

    let dateMode = null;
    if (["date", "month", "datetime-local"].includes(type)) {
      dateMode = type;
    } else if (/(出生年月|年月|month)/i.test(haystack)) {
      dateMode = "month";
    } else if (
      /(生日|出生日期|开始日期|结束日期|日期|dob|birthday|birthdate|date)/i.test(
        haystack
      )
    ) {
      dateMode = "date";
    }

    const framework = detectDateFramework(el);
    if (!dateMode && framework === "generic") return null;

    return {
      dateMode: dateMode || "date",
      framework,
      hints: [label, name, id, placeholder, autocomplete, className]
        .map((item) => normalizeText(item || ""))
        .filter(Boolean)
        .slice(0, 6),
    };
  }

  function detectDateFramework(el) {
    const candidates = [];
    let current = el;
    for (let depth = 0; current && depth < 4; depth += 1, current = current.parentElement) {
      candidates.push(String(current.className || ""));
      for (const attr of ["data-testid", "data-type", "role"]) {
        const value = current.getAttribute?.(attr);
        if (value) candidates.push(String(value));
      }
    }

    const text = candidates.join(" ").toLowerCase();
    if (text.includes("ant-picker") || text.includes("ant-calendar-picker")) return "ant";
    if (text.includes("el-date-editor") || text.includes("el-picker")) return "element";
    if (text.includes("flatpickr")) return "flatpickr";
    if (text.includes("mui")) return "mui";
    if (
      text.includes("datepicker") ||
      text.includes("date-picker") ||
      text.includes("calendar")
    ) {
      return "generic";
    }
    return "generic";
  }

  // --- Field Scanning ---
  function scanFields() {
    const root = pickLikelyFormRoot();
    const elements = collectControls(root);

    /** @type {Array<any>} */
    const fields = [];
    /** @type {Array<any>} */
    const runtime = [];

    let idSeq = 0;

    // groups by type+name
    const radioGroups = new Map();
    const checkboxGroups = new Map();

    for (const el of elements) {
      if (!isFillableElement(el)) continue;

      const tag = el.tagName.toLowerCase();
      if (tag === "select") {
        const fieldId = `f_${++idSeq}`;
        const label = getFieldLabel(el);
        const options = Array.from(el.options || [])
          .map((opt) => String(opt.textContent || "").trim())
          .filter(Boolean)
          .slice(0, 60);

        fields.push({
          fieldId,
          kind: "select",
          label,
          name: el.getAttribute("name") || "",
          id: el.id || "",
          placeholder: "",
          options,
        });
        runtime.push({ fieldId, kind: "select", el });
        continue;
      }

      if (tag === "textarea") {
        const fieldId = `f_${++idSeq}`;
        const label = getFieldLabel(el);
        fields.push({
          fieldId,
          kind: "textarea",
          label,
          name: el.getAttribute("name") || "",
          id: el.id || "",
          placeholder: el.getAttribute("placeholder") || "",
        });
        runtime.push({ fieldId, kind: "textarea", el });
        continue;
      }

      const isContentEditable =
        el.getAttribute("contenteditable") === "true" ||
        el.getAttribute("contenteditable") === "";
      if (isContentEditable) {
        const fieldId = `f_${++idSeq}`;
        const label = getFieldLabel(el);
        fields.push({
          fieldId,
          kind: "contenteditable",
          label,
          name: el.getAttribute("name") || "",
          id: el.id || "",
          placeholder: el.getAttribute("placeholder") || "",
        });
        runtime.push({ fieldId, kind: "contenteditable", el });
        continue;
      }

      if (tag === "input") {
        const type = String(el.getAttribute("type") || "text").toLowerCase();
        if (
          [
            "hidden",
            "submit",
            "button",
            "reset",
            "image",
            "range",
            "color",
          ].includes(type)
        ) {
          continue;
        }

        if (type === "file") {
          const fieldId = `f_${++idSeq}`;
          const label = getFieldLabel(el);
          fields.push({
            fieldId,
            kind: "file",
            label,
            name: el.getAttribute("name") || "",
            id: el.id || "",
            placeholder: el.getAttribute("placeholder") || "",
          });
          runtime.push({ fieldId, kind: "file", el });
          continue;
        }

        if (type === "radio" || type === "checkbox") {
          const name = el.getAttribute("name") || el.id || "";
          const key = `${type}:${name || "(no-name)"}`;
          const groupMap = type === "radio" ? radioGroups : checkboxGroups;
          if (!groupMap.has(key)) {
            groupMap.set(key, {
              type,
              name,
              elements: [],
              label: getGroupLabel(el),
            });
          }
          groupMap.get(key).elements.push(el);
          continue;
        }

        // 普通输入框
        const fieldId = `f_${++idSeq}`;
        const label = getFieldLabel(el);
        const dateMeta = detectDateFieldMeta(el, label);
        if (dateMeta) {
          fields.push({
            fieldId,
            kind: "date_like",
            inputType: type,
            dateMode: dateMeta.dateMode,
            framework: dateMeta.framework,
            label,
            name: el.getAttribute("name") || "",
            id: el.id || "",
            placeholder: el.getAttribute("placeholder") || "",
            autocomplete: el.getAttribute("autocomplete") || "",
            hints: dateMeta.hints,
          });
          runtime.push({
            fieldId,
            kind: "date_like",
            el,
            inputType: type,
            dateMode: dateMeta.dateMode,
            framework: dateMeta.framework,
            hints: dateMeta.hints,
          });
          continue;
        }

        fields.push({
          fieldId,
          kind: "text",
          inputType: type,
          label,
          name: el.getAttribute("name") || "",
          id: el.id || "",
          placeholder: el.getAttribute("placeholder") || "",
          autocomplete: el.getAttribute("autocomplete") || "",
        });
        runtime.push({ fieldId, kind: "text", el });
        continue;
      }
    }

    // build groups after collecting
    for (const group of radioGroups.values()) {
      const fieldId = `f_${++idSeq}`;
      const options = group.elements
        .map((input) => ({
          label: getOptionLabel(input),
          value: input.value || "",
        }))
        .filter((o) => o.label || o.value)
        .slice(0, 80);

      fields.push({
        fieldId,
        kind: "radio_group",
        label: group.label,
        name: group.name,
        options: options.map((o) => o.label || o.value),
      });

      runtime.push({
        fieldId,
        kind: "radio_group",
        options: group.elements.map((input) => ({
          el: input,
          label: getOptionLabel(input) || input.value || "",
          value: input.value || "",
        })),
      });
    }

    for (const group of checkboxGroups.values()) {
      const fieldId = `f_${++idSeq}`;
      const options = group.elements
        .map((input) => ({
          label: getOptionLabel(input),
          value: input.value || "",
        }))
        .filter((o) => o.label || o.value)
        .slice(0, 80);

      fields.push({
        fieldId,
        kind: "checkbox_group",
        label: group.label,
        name: group.name,
        options: options.map((o) => o.label || o.value),
      });

      runtime.push({
        fieldId,
        kind: "checkbox_group",
        options: group.elements.map((input) => ({
          el: input,
          label: getOptionLabel(input) || input.value || "",
          value: input.value || "",
        })),
      });
    }

    return { fields, runtime };
  }

  // --- Memory ---
  function normalizeMemoryKey(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  }

  function buildMemoryIndex(memory) {
    const exact = new Map();
    const longKeys = [];

    const obj = memory && typeof memory === "object" ? memory : {};
    for (const [rawKey, rawEntry] of Object.entries(obj)) {
      const key = normalizeMemoryKey(rawKey);
      if (!key) continue;

      const entry =
        rawEntry && typeof rawEntry === "object"
          ? rawEntry
          : { label: rawKey, value: String(rawEntry || "") };

      const value = String(entry.value || "").trim();
      if (!value) continue;

      const normalized = {
        key,
        label: String(entry.label || rawKey || key),
        value: String(entry.value || ""),
      };

      exact.set(key, normalized);
      if (key.length > 3) longKeys.push(normalized);
    }

    longKeys.sort((a, b) => b.key.length - a.key.length);
    return { exact, longKeys };
  }

  function findMemoryForField(field, memoryIndex) {
    if (!memoryIndex) return null;
    const fieldKey = normalizeMemoryKey(
      field?.label || field?.name || field?.placeholder || ""
    );
    if (!fieldKey) return null;

    const exact = memoryIndex.exact.get(fieldKey);
    if (exact) return exact;

    if (fieldKey.length <= 3) return null;
    for (const item of memoryIndex.longKeys || []) {
      if (!item?.key) continue;
      if (fieldKey.includes(item.key) || item.key.includes(fieldKey)) {
        return item;
      }
    }
    return null;
  }

  function pickLikelyFormRoot() {
    const forms = Array.from(document.querySelectorAll("form")).filter((f) =>
      isVisible(f)
    );
    if (forms.length === 0) return document;

    const ranked = forms
      .map((form) => ({ form, count: countControls(form) }))
      .sort((a, b) => b.count - a.count);

    const best = ranked[0];
    if (best && best.count >= 2) return best.form;
    return document;
  }

  function countControls(root) {
    return collectControls(root).length;
  }

  function collectControls(root) {
    const scope = root || document;
    const selectors =
      'input, textarea, select, [contenteditable="true"], [contenteditable=""]';
    return Array.from(scope.querySelectorAll(selectors)).filter((el) =>
      isVisible(el)
    );
  }

  function isFillableElement(el) {
    if (!el) return false;
    if (el.disabled) return false;
    if (el.getAttribute("aria-disabled") === "true") return false;
    return true;
  }

  function isVisible(el) {
    try {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") return false;
      const rects = el.getClientRects();
      return rects && rects.length > 0;
    } catch (_) {
      return false;
    }
  }

  function getFieldLabel(el) {
    const ariaLabel = el.getAttribute?.("aria-label");
    if (ariaLabel) return normalizeText(ariaLabel);

    const labelledBy = el.getAttribute?.("aria-labelledby");
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/g)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((n) => normalizeText(n.textContent || ""));
      const joined = parts.filter(Boolean).join(" / ");
      if (joined) return joined;
    }

    const id = el.id;
    if (id) {
      const forLabel = document.querySelector(`label[for="${cssEscape(id)}"]`);
      if (forLabel) {
        const t = normalizeText(forLabel.textContent || "");
        if (t) return t;
      }
    }

    const wrapping = el.closest?.("label");
    if (wrapping) {
      const t = normalizeText(wrapping.textContent || "");
      if (t) return t;
    }

    const containerLabel = getContainerFieldLabel(el);
    if (containerLabel) return containerLabel;

    const placeholder = el.getAttribute?.("placeholder");
    if (placeholder) return normalizeText(placeholder);

    const name = el.getAttribute?.("name");
    if (name) return name;

    return "";
  }

  function getContainerFieldLabel(el) {
    const container =
      el?.closest?.(
        '.no-form-item, .ant-form-item, [class*="form-item"], [class*="field"], [class*="item"]'
      ) || null;
    if (!container) return "";

    const selectors = [
      ".no-form-item-label",
      ".ant-form-item-label label",
      ".ant-form-item-label",
      '[class*="item-label"]',
      '[class*="field-label"]',
      '[class*="form-label"]',
    ];

    for (const selector of selectors) {
      const labelEl = container.querySelector?.(selector);
      const text = normalizeText(labelEl?.textContent || "");
      if (text) return text;
    }

    return "";
  }

  function getGroupLabel(input) {
    const fieldset = input.closest?.("fieldset");
    const legend = fieldset?.querySelector?.("legend");
    const legendText = normalizeText(legend?.textContent || "");
    if (legendText) return legendText;

    // 常见容器：form-item/field/row 等
    const container =
      input.closest?.(
        '[class*="form"],[class*="Form"],[class*="field"],[class*="Field"],[class*="item"],[class*="Item"]'
      ) || input.parentElement;
    const text = normalizeText(container?.textContent || "");
    return text ? text.slice(0, 50) : "";
  }

  function getOptionLabel(input) {
    const id = input.id;
    if (id) {
      const forLabel = document.querySelector(`label[for="${cssEscape(id)}"]`);
      const t = normalizeText(forLabel?.textContent || "");
      if (t) return t;
    }
    const wrapping = input.closest?.("label");
    const t = normalizeText(wrapping?.textContent || "");
    if (t) return t;
    return "";
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/[\r\n]+/g, " ")
      .trim();
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, "\\$&");
  }

  // --- Fill helpers ---
  function scrollIntoView(el) {
    if (!el) return;
    try {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch (_) {
      // ignore
    }
  }

  function setValueWithEvents(el, value) {
    if (!el) return false;
    scrollIntoView(el);
    try {
      el.focus?.();
      setNativeValue(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.blur?.();
      return true;
    } catch (e) {
      console.warn(EXT_TAG, "写入失败", e);
      return false;
    }
  }

  function setNativeValue(element, value) {
    const tag = element.tagName?.toLowerCase?.() || "";
    if (tag === "input") {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      setter ? setter.call(element, value) : (element.value = value);
      return;
    }
    if (tag === "textarea") {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      setter ? setter.call(element, value) : (element.value = value);
      return;
    }
    element.value = value;
  }

  function selectByText(selectEl, desired) {
    if (!selectEl || !selectEl.options) return false;
    scrollIntoView(selectEl);

    const options = Array.from(selectEl.options);
    const wanted = String(desired || "").trim();
    if (!wanted) return false;

    let best = null;
    for (const opt of options) {
      const t = String(opt.textContent || "").trim();
      if (!t) continue;
      if (t === wanted) {
        best = opt;
        break;
      }
      if (!best && isFuzzyMatch(t, wanted)) {
        best = opt;
      }
    }

    if (!best) return false;
    selectEl.value = best.value;
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    selectEl.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  async function safeCheck(inputEl, checked) {
    if (!inputEl) return false;
    try {
      scrollIntoView(inputEl);
      inputEl.focus?.();

      if (typeof inputEl.click === "function") {
        // 对于大多数框架，click 比直接赋值更可靠
        if (Boolean(inputEl.checked) !== Boolean(checked)) {
          inputEl.click();
        }
      } else {
        inputEl.checked = Boolean(checked);
      }

      inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(30);
      return Boolean(inputEl.checked) === Boolean(checked);
    } catch (_) {
      return false;
    }
  }

  function pickBestOption(options, desired) {
    const wanted = String(desired || "").trim();
    if (!wanted) return null;
    let exact = null;
    let fuzzy = null;
    for (const opt of options || []) {
      const label = String(opt.label || "").trim();
      if (!label) continue;
      if (label === wanted) {
        exact = opt;
        break;
      }
      if (!fuzzy && isFuzzyMatch(label, wanted)) {
        fuzzy = opt;
      }
    }
    return exact || fuzzy;
  }

  function isFuzzyMatch(a, b) {
    const x = String(a || "").trim();
    const y = String(b || "").trim();
    if (!x || !y) return false;
    if (x === y) return true;
    return x.includes(y) || y.includes(x);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // --- AI ---
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

  function parseJsonFromAiText(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) throw new Error("AI 返回为空");

    const direct = tryParseJson(trimmed);
    if (direct.ok) return direct.value;

    const noFences = trimmed
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
    const noFencesParsed = tryParseJson(noFences);
    if (noFencesParsed.ok) return noFencesParsed.value;

    const extracted = extractLikelyJson(noFences);
    const extractedParsed = tryParseJson(extracted);
    if (extractedParsed.ok) return extractedParsed.value;

    throw new Error("无法解析 AI 返回的 JSON");
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

  // --- Popup helpers ---
  function sendLog(level, text) {
    chrome.runtime.sendMessage({ type: "log", level, text });
  }

  function sendStats(fieldCount, filledCount) {
    chrome.runtime.sendMessage({
      type: "updateStats",
      fieldCount,
      filledCount,
    });
  }

  if (window.__AI_RESUME_TEST_HOOKS__) {
    Object.assign(window.__AI_RESUME_TEST_HOOKS__, {
      buildMemoryIndex,
      detectDateFieldMeta,
      fillDateLikeField,
      findMemoryForField,
      getFieldLabel,
      normalizeMemoryKey,
      normalizeDateLikeValue,
      readRuntimeValue,
    });
  }

  console.log(EXT_TAG, "Content script 已加载");
})();
