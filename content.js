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

    const placeholder = el.getAttribute?.("placeholder");
    if (placeholder) return normalizeText(placeholder);

    const name = el.getAttribute?.("name");
    if (name) return name;

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

  console.log(EXT_TAG, "Content script 已加载");
})();
