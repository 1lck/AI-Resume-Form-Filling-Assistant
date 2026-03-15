#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const fixturePath = path.resolve(
  __dirname,
  "..",
  "fixtures",
  "date-picker-fixture.html"
);
const contentScriptPath = path.resolve(__dirname, "..", "..", "content.js");

const html = fs.readFileSync(fixturePath, "utf8");
const contentScript = fs.readFileSync(contentScriptPath, "utf8");

const requiredMarkers = [
  'data-test="native-date"',
  'data-test="native-month"',
  'data-test="panel-picker"',
  'data-role="month-cell"',
  'data-role="day-cell"',
];

const missing = requiredMarkers.filter((marker) => !html.includes(marker));

if (missing.length > 0) {
  console.error("Fixture check failed. Missing markers:");
  for (const marker of missing) {
    console.error(`- ${marker}`);
  }
  process.exit(1);
}

const baseline = {
  fixture: path.relative(process.cwd(), fixturePath),
  nativeDate: "present",
  nativeMonth: "present",
  panelPicker: "present",
  status: "baseline-ready"
};

class MockEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = Boolean(init.bubbles);
    this.data = init.data ?? null;
    this.key = init.key ?? "";
  }
}

class MockInputElement {
  constructor(type = "text") {
    this.tagName = "INPUT";
    this.type = type;
    this.value = "";
    this.events = [];
    this.attributes = { type };
  }

  getAttribute(name) {
    return this.attributes[name] || "";
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  focus() {}

  blur() {}

  scrollIntoView() {}

  dispatchEvent(event) {
    this.events.push(event.type);
    if (event.type === "click" && typeof this._onDispatchClick === "function") {
      this._onDispatchClick(event);
    }
    return true;
  }
}

Object.defineProperty(MockInputElement.prototype, "value", {
  get() {
    return this._value || "";
  },
  set(value) {
    if (this.lockProgrammaticWrite) return;
    if (this.commitOnKeyboard) {
      this._pendingValue = String(value);
      return;
    }
    this._value = String(value);
  },
  configurable: true,
});

class MockTextareaElement extends MockInputElement {
  constructor() {
    super("text");
    this.tagName = "TEXTAREA";
  }
}

Object.defineProperty(MockTextareaElement.prototype, "value", {
  get() {
    return this._value || "";
  },
  set(value) {
    this._value = String(value);
  },
  configurable: true,
});

const context = {
  console,
  setTimeout,
  clearTimeout,
  Map,
  Event: MockEvent,
  InputEvent: MockEvent,
  KeyboardEvent: MockEvent,
  HTMLInputElement: MockInputElement,
  HTMLTextAreaElement: MockTextareaElement,
  location: { href: "http://localhost/fixture" },
  document: {
    title: "fixture",
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
  },
  chrome: {
    runtime: {
      onMessage: { addListener: () => {} },
      sendMessage: () => {},
      lastError: null,
    },
  },
};

context.window = context;
context.globalThis = context;
context.CSS = { escape: (value) => String(value) };
context.__AI_RESUME_TEST_HOOKS__ = {};

vm.createContext(context);
vm.runInContext(contentScript, context, { filename: "content.js" });

const hooks = context.__AI_RESUME_TEST_HOOKS__;
if (
  !hooks.normalizeDateLikeValue ||
  !hooks.fillDateLikeField ||
  !hooks.getFieldLabel ||
  !hooks.findMemoryForField
) {
  console.error("Test hooks are not available from content.js");
  process.exit(1);
}

const normalizedDate = hooks.normalizeDateLikeValue("1999年8月21日", {
  dateMode: "date",
});
const normalizedMonth = hooks.normalizeDateLikeValue("1999-8", {
  dateMode: "month",
});
const invalidDate = hooks.normalizeDateLikeValue("1999年8月", {
  dateMode: "date",
});

if (!normalizedDate.ok || normalizedDate.value !== "1999-08-21") {
  console.error("Failed to normalize date value", normalizedDate);
  process.exit(1);
}

if (!normalizedMonth.ok || normalizedMonth.value !== "1999-08") {
  console.error("Failed to normalize month value", normalizedMonth);
  process.exit(1);
}

if (invalidDate.ok) {
  console.error("Invalid date should not pass normalization", invalidDate);
  process.exit(1);
}

class MockLabelContainer {
  constructor(text) {
    this._labelNode = new MockTextNode(text);
  }

  querySelector(selector) {
    if (
      selector === ".no-form-item-label" ||
      selector === ".ant-form-item-label" ||
      selector === ".ant-form-item-label label" ||
      selector === '[class*="item-label"]' ||
      selector === '[class*="field-label"]' ||
      selector === '[class*="form-label"]'
    ) {
      return this._labelNode;
    }
    return null;
  }
}

class MockTextNode {
  constructor(text) {
    this.textContent = text;
  }
}

const kuaishouLikeInput = new MockInputElement("text");
kuaishouLikeInput.attributes.placeholder = "请选择日期";
kuaishouLikeInput.attributes.name = "birthdate";
const labelContainer = new MockLabelContainer("出生日期");
kuaishouLikeInput.closest = (selector) =>
  selector.includes("form-item") || selector.includes("item") || selector.includes("field")
    ? labelContainer
    : null;

const extractedLabel = hooks.getFieldLabel(kuaishouLikeInput);
if (extractedLabel !== "出生日期") {
  console.error("Container label extraction failed", { extractedLabel });
  process.exit(1);
}

const memoryIndex = hooks.buildMemoryIndex({
  出生日期: { label: "出生日期", value: "1999-08-21" },
});
const memoryHit = hooks.findMemoryForField(
  {
    label: extractedLabel,
    name: "birthdate",
    placeholder: "请选择日期",
  },
  memoryIndex
);
if (!memoryHit || memoryHit.value !== "1999-08-21") {
  console.error("Memory lookup failed for extracted label", { extractedLabel, memoryHit });
  process.exit(1);
}

class MockCell {
  constructor(attrName, attrValue, text, onClick) {
    this._attrName = attrName;
    this._attrValue = attrValue;
    this.textContent = text;
    this.onClick = onClick;
  }

  getAttribute(name) {
    return name === this._attrName ? this._attrValue : "";
  }

  click() {
    this.onClick();
  }
}

class MockElementNode {
  constructor(className = "", onClick = null, options = {}) {
    this.className = className;
    this._onClick = onClick;
    this._strictMouseSequence = Boolean(options.strictMouseSequence);
    this._mouseDownSeen = false;
    this.events = [];
  }

  click() {
    this.events.push("click()");
    if (this._strictMouseSequence) return;
    if (this._onClick) this._onClick();
  }

  focus() {}

  dispatchEvent(event) {
    const type = event?.type || "";
    this.events.push(type);
    if (!this._strictMouseSequence) {
      if (type === "click" && this._onClick) this._onClick();
      return true;
    }
    if (type === "pointerdown" || type === "mousedown") {
      this._mouseDownSeen = true;
      return true;
    }
    if (type === "click" && this._mouseDownSeen) {
      this._mouseDownSeen = false;
      if (this._onClick) this._onClick();
    }
    return true;
  }
}

class MockPanel {
  constructor(input) {
    this.input = input;
    this.year = "1999";
    this.month = "";
    this.day = "";
    this.open = false;
    this.classList = {
      contains: (name) => name === "open" && this.open,
    };
    this._yearNode = new MockTextNode(this.year);
    this._monthCells = ["08", "09", "10", "11"].map(
      (month) =>
        new MockCell("data-month", month, `${month}月`, () => {
          this.month = month;
        })
    );
    this._dayCells = ["19", "20", "21", "22"].map(
      (day) =>
        new MockCell("data-day", day, String(Number(day)), () => {
          this.day = day;
          this.input.lockProgrammaticWrite = false;
          this.input.value = `${this.year}-${this.month}-${this.day}`;
          this.input.lockProgrammaticWrite = true;
          this.open = false;
        })
    );
  }

  getAttribute(name) {
    if (name === "aria-hidden") return this.open ? "false" : "true";
    return "";
  }

  contains() {
    return false;
  }

  querySelector(selector) {
    if (selector === '[data-role="selected-year"]') return this._yearNode;
    return null;
  }

  querySelectorAll(selector) {
    if (selector === '[data-role="month-cell"]' || selector === "[data-month]") {
      return this._monthCells;
    }
    if (selector === '[data-role="day-cell"]' || selector === "[data-day]") {
      return this._dayCells;
    }
    return [];
  }
}

class MockKeyboardConfirmInput extends MockInputElement {
  constructor() {
    super("text");
    this.commitOnKeyboard = true;
    this._pendingValue = "";
  }

  dispatchEvent(event) {
    this.events.push(event.key ? `${event.type}:${event.key}` : event.type);
    if (event.type === "keydown" && (event.key === "Enter" || event.key === "Tab")) {
      this._value = this._pendingValue;
    }
    return true;
  }
}

class MockAntCell {
  constructor(title, text, onClick, options = {}) {
    this._title = title;
    this.textContent = text;
    this._onClick = onClick;
    this._strictMouseSequence = Boolean(options.strictMouseSequence);
    this._mouseDownSeen = false;
    this.events = [];
  }

  getAttribute(name) {
    if (name === "title") return this._title;
    return "";
  }

  click() {
    this.events.push("click()");
    if (this._strictMouseSequence) return;
    this._onClick();
  }

  dispatchEvent(event) {
    const type = event?.type || "";
    this.events.push(type);
    if (!this._strictMouseSequence) {
      if (type === "click") this._onClick();
      return true;
    }
    if (type === "pointerdown" || type === "mousedown") {
      this._mouseDownSeen = true;
      return true;
    }
    if (type === "click" && this._mouseDownSeen) {
      this._mouseDownSeen = false;
      this._onClick();
    }
    return true;
  }
}

class MockAntPanel {
  constructor(input, options = {}) {
    this.input = input;
    this.open = false;
    this.className = "ant-calendar-picker-container";
    this.year = 2026;
    this.month = 3;
    this.pendingValue = "";
    this._strictMouseSequence = Boolean(options.strictMouseSequence);
    this._supportsPanelInput = options.supportsPanelInput !== false;
    this._yearNode = new MockTextNode(`${this.year}年`);
    this._monthNode = new MockTextNode(`${this.month}月`);
    this._inputNode = new MockInputElement("text");
    this._okBtn = new MockElementNode("ant-calendar-ok-btn", () => {
      const finalValue = this.pendingValue || this._inputNode.value;
      if (!finalValue) return;
      this.input.lockProgrammaticWrite = false;
      this.input.value = finalValue;
      this.input.lockProgrammaticWrite = true;
      this.open = false;
    }, { strictMouseSequence: this._strictMouseSequence });
    this._prevYearBtn = new MockElementNode("ant-calendar-prev-year-btn", () => {
      this.year -= 1;
      this.syncHeader();
    }, { strictMouseSequence: this._strictMouseSequence });
    this._nextYearBtn = new MockElementNode("ant-calendar-next-year-btn", () => {
      this.year += 1;
      this.syncHeader();
    }, { strictMouseSequence: this._strictMouseSequence });
    this._prevMonthBtn = new MockElementNode("ant-calendar-prev-month-btn", () => {
      this.month -= 1;
      if (this.month < 1) {
        this.month = 12;
        this.year -= 1;
      }
      this.syncHeader();
    }, { strictMouseSequence: this._strictMouseSequence });
    this._nextMonthBtn = new MockElementNode("ant-calendar-next-month-btn", () => {
      this.month += 1;
      if (this.month > 12) {
        this.month = 1;
        this.year += 1;
      }
      this.syncHeader();
    }, { strictMouseSequence: this._strictMouseSequence });
  }

  syncHeader() {
    this._yearNode.textContent = `${this.year}年`;
    this._monthNode.textContent = `${this.month}月`;
  }

  getAttribute(name) {
    if (name === "aria-hidden") return this.open ? "false" : "true";
    return "";
  }

  contains() {
    return false;
  }

  querySelector(selector) {
    if (selector === ".ant-calendar-year-select") return this._yearNode;
    if (selector === ".ant-calendar-month-select") return this._monthNode;
    if (selector === ".ant-calendar-input") {
      return this._supportsPanelInput ? this._inputNode : null;
    }
    if (selector === ".ant-calendar-ok-btn") return this._okBtn;
    if (selector === ".ant-calendar-prev-year-btn") return this._prevYearBtn;
    if (selector === ".ant-calendar-next-year-btn") return this._nextYearBtn;
    if (selector === ".ant-calendar-prev-month-btn") return this._prevMonthBtn;
    if (selector === ".ant-calendar-next-month-btn") return this._nextMonthBtn;
    return null;
  }

  querySelectorAll(selector) {
    if (
      selector === ".ant-calendar-cell .ant-calendar-date" ||
      selector === ".ant-calendar-date"
    ) {
      return ["05", "19", "20", "21", "22"].map(
        (day) =>
          new MockAntCell(
            `${this.year}-${String(this.month).padStart(2, "0")}-${day}`,
            String(Number(day)),
            () => {
              const finalValue = `${this.year}-${String(this.month).padStart(2, "0")}-${day}`;
              this.pendingValue = finalValue;
              this._inputNode.value = finalValue;
              this.input.lockProgrammaticWrite = false;
              this.input.value = finalValue;
              this.input.lockProgrammaticWrite = true;
              this.open = false;
            },
            { strictMouseSequence: this._strictMouseSequence }
          )
      );
    }
    return [];
  }
}

class MockAntPickerCell extends MockAntCell {
  getAttribute(name) {
    if (name === "title") return this._title;
    if (name === "data-month") {
      const match = this._title.match(/-(\d{2})-/);
      return match ? match[1] : "";
    }
    if (name === "data-day") {
      const match = this._title.match(/-(\d{2})$/);
      return match ? match[1] : "";
    }
    return "";
  }
}

class MockAntPickerPanel {
  constructor(input, options = {}) {
    this.input = input;
    this.open = false;
    this.className = options.hidden
      ? "ant-picker-dropdown ant-picker-dropdown-hidden"
      : "ant-picker-dropdown";
    this.year = 2026;
    this.month = 3;
    this.pendingValue = "";
    this._strictMouseSequence = Boolean(options.strictMouseSequence);
    this._hidden = Boolean(options.hidden);
    this._yearNode = new MockTextNode(String(this.year));
    this._monthNode = new MockTextNode(`${this.month}月`);
    this._prevYearBtn = new MockElementNode(
      "ant-picker-header-super-prev-btn",
      () => {
        this.year -= 1;
        this.syncHeader();
      },
      { strictMouseSequence: this._strictMouseSequence }
    );
    this._nextYearBtn = new MockElementNode(
      "ant-picker-header-super-next-btn",
      () => {
        this.year += 1;
        this.syncHeader();
      },
      { strictMouseSequence: this._strictMouseSequence }
    );
    this._monthToggle = new MockElementNode(
      "ant-picker-month-btn",
      null,
      { strictMouseSequence: this._strictMouseSequence }
    );
  }

  syncHeader() {
    this._yearNode.textContent = String(this.year);
    this._monthNode.textContent = `${this.month}月`;
  }

  getAttribute(name) {
    if (name === "aria-hidden") return this._hidden ? "false" : this.open ? "false" : "true";
    return "";
  }

  contains() {
    return false;
  }

  querySelector(selector) {
    if (selector === ".ant-picker-year-btn") return this._yearNode;
    if (selector === ".ant-picker-month-btn") return this._monthNode;
    if (selector === ".ant-picker-header-super-prev-btn") return this._prevYearBtn;
    if (selector === ".ant-picker-header-super-next-btn") return this._nextYearBtn;
    return null;
  }

  querySelectorAll(selector) {
    if (selector === ".ant-picker-cell-in-view") {
      return [String(this.year - 1), String(this.year), String(this.year + 1)].map(
        (year) =>
          new MockAntPickerCell(
            `${year}-${String(this.month).padStart(2, "0")}-01`,
            year,
            () => {
              this.year = Number(year);
              this.syncHeader();
            },
            { strictMouseSequence: this._strictMouseSequence }
          )
      );
    }

    if (selector === ".ant-picker-cell") {
      const monthCells = ["05", "06", "07", "08"].map(
        (month) =>
          new MockAntPickerCell(
            `${this.year}-${month}-01`,
            `${Number(month)}月`,
            () => {
              this.month = Number(month);
              this.syncHeader();
            },
            { strictMouseSequence: this._strictMouseSequence }
          )
      );
      const dayCells = ["04", "05", "06", "07"].map(
        (day) =>
          new MockAntPickerCell(
            `${this.year}-${String(this.month).padStart(2, "0")}-${day}`,
            String(Number(day)),
            () => {
              const finalValue = `${this.year}-${String(this.month).padStart(2, "0")}-${day}`;
              this.pendingValue = finalValue;
              this.input.lockProgrammaticWrite = false;
              this.input.value = finalValue;
              this.input.lockProgrammaticWrite = true;
              this.open = false;
            },
            { strictMouseSequence: this._strictMouseSequence }
          )
      );
      return [...monthCells, ...dayCells];
    }

    return [];
  }
}

(async () => {
  const nativeDateInput = new MockInputElement("date");
  const nativeMonthInput = new MockInputElement("month");
  const keyboardConfirmInput = new MockKeyboardConfirmInput();

  const panelInput = new MockInputElement("text");
  panelInput.lockProgrammaticWrite = true;
  const panel = new MockPanel(panelInput);
  panelInput.click = () => {
    panel.open = true;
  };
  panelInput._onDispatchClick = () => {
    panel.open = true;
  };

  const antInput = new MockInputElement("text");
  antInput.lockProgrammaticWrite = true;
  antInput.attributes.name = "birthdate";
  const antPanel = new MockAntPanel(antInput);
  const antWrapper = new MockElementNode("ant-calendar-picker", () => {
    antPanel.open = true;
  });
  antInput.closest = (selector) =>
    selector === ".ant-calendar-picker" ? antWrapper : null;
  antInput.parentElement = {
    querySelector: (selector) =>
      selector === ".ant-calendar-picker-icon"
        ? new MockElementNode("ant-calendar-picker-icon", () => {
            antPanel.open = true;
          })
        : null,
  };

  context.document.querySelectorAll = (selector) => {
    if (selector === ".ant-calendar-picker-container" || selector === ".ant-calendar") {
      return [antPanel];
    }
    if (selector.includes("picker") || selector.includes("calendar") || selector.includes("mock-date-panel")) {
      return [panel];
    }
    return [];
  };
  const dateResult = await hooks.fillDateLikeField(
    { kind: "date_like", el: nativeDateInput, dateMode: "date" },
    "1999/8/21"
  );
  const monthResult = await hooks.fillDateLikeField(
    { kind: "date_like", el: nativeMonthInput, dateMode: "month" },
    "1999年8月"
  );

  if (!dateResult.filled || nativeDateInput.value !== "1999-08-21") {
    console.error("Native date fill failed", { dateResult, value: nativeDateInput.value });
    process.exit(1);
  }

  if (!monthResult.filled || nativeMonthInput.value !== "1999-08") {
    console.error("Native month fill failed", {
      monthResult,
      value: nativeMonthInput.value,
    });
    process.exit(1);
  }

  const keyboardConfirmResult = await hooks.fillDateLikeField(
    { kind: "date_like", el: keyboardConfirmInput, dateMode: "date", framework: "generic" },
    "1999-08-21"
  );

  if (!keyboardConfirmResult.filled || keyboardConfirmInput.value !== "1999-08-21") {
    console.error("Keyboard confirm date fill failed", {
      keyboardConfirmResult,
      value: keyboardConfirmInput.value,
      events: keyboardConfirmInput.events,
    });
    process.exit(1);
  }

  const panelResult = await hooks.fillDateLikeField(
    { kind: "date_like", el: panelInput, dateMode: "date", framework: "generic" },
    "1999-08-21"
  );

  if (!panelResult.filled || panelInput.value !== "1999-08-21") {
    console.error("Panel date fill failed", {
      panelResult,
      value: panelInput.value,
    });
    process.exit(1);
  }

  const antResult = await hooks.fillDateLikeField(
    { kind: "date_like", el: antInput, dateMode: "date", framework: "ant" },
    "1999-08-21"
  );

  if (!antResult.filled || antInput.value !== "1999-08-21") {
    console.error("Ant calendar date fill failed", {
      antResult,
      value: antInput.value,
    });
    process.exit(1);
  }

  const delayedAntInput = new MockInputElement("text");
  delayedAntInput.lockProgrammaticWrite = true;
  delayedAntInput.attributes.name = "birthdate";
  const delayedAntPanel = new MockAntPanel(delayedAntInput);
  let delayedAntPanelVisible = false;
  const delayedAntWrapper = new MockElementNode("ant-calendar-picker", () => {
    setTimeout(() => {
      delayedAntPanel.open = true;
      delayedAntPanelVisible = true;
    }, 120);
  });
  delayedAntInput.closest = (selector) =>
    selector === ".ant-calendar-picker" ? delayedAntWrapper : null;
  delayedAntInput.parentElement = {
    querySelector: (selector) =>
      selector === ".ant-calendar-picker-icon"
        ? new MockElementNode("ant-calendar-picker-icon", () => {
            setTimeout(() => {
              delayedAntPanel.open = true;
              delayedAntPanelVisible = true;
            }, 120);
          })
        : null,
  };

  context.document.querySelectorAll = (selector) => {
    if (
      selector === ".ant-calendar-picker-container:not(.slide-up-leave)" ||
      selector === ".ant-calendar-picker-container" ||
      selector === ".ant-calendar"
    ) {
      return delayedAntPanelVisible ? [delayedAntPanel] : [];
    }
    return [];
  };

  const delayedAntResult = await hooks.fillDateLikeField(
    { kind: "date_like", el: delayedAntInput, dateMode: "date", framework: "ant" },
    "2002-07-05"
  );

  if (!delayedAntResult.filled || delayedAntInput.value !== "2002-07-05") {
    console.error("Delayed ant calendar date fill failed", {
      delayedAntResult,
      value: delayedAntInput.value,
      panelVisible: delayedAntPanelVisible,
    });
    process.exit(1);
  }

  const strictAntInput = new MockInputElement("text");
  strictAntInput.lockProgrammaticWrite = true;
  strictAntInput.attributes.name = "birthdate";
  const strictAntPanel = new MockAntPanel(strictAntInput, {
    strictMouseSequence: true,
    supportsPanelInput: false,
  });
  let strictAntPanelVisible = false;
  const strictAntWrapper = new MockElementNode(
    "ant-calendar-picker",
    () => {
      strictAntPanel.open = true;
      strictAntPanelVisible = true;
    },
    { strictMouseSequence: true }
  );
  strictAntInput.closest = (selector) =>
    selector === ".ant-calendar-picker" ? strictAntWrapper : null;
  strictAntInput.parentElement = {
    querySelector: (selector) =>
      selector === ".ant-calendar-picker-icon"
        ? new MockElementNode(
            "ant-calendar-picker-icon",
            () => {
              strictAntPanel.open = true;
              strictAntPanelVisible = true;
            },
            { strictMouseSequence: true }
          )
        : null,
  };

  context.document.querySelectorAll = (selector) => {
    if (selector === ".ant-calendar-picker-container" || selector === ".ant-calendar") {
      return strictAntPanelVisible ? [strictAntPanel] : [];
    }
    return [];
  };

  const strictAntResult = await hooks.fillDateLikeField(
    { kind: "date_like", el: strictAntInput, dateMode: "date", framework: "ant" },
    "2002-07-05"
  );

  if (!strictAntResult.filled || strictAntInput.value !== "2002-07-05") {
    console.error("Strict ant calendar click-path fill failed", {
      strictAntResult,
      value: strictAntInput.value,
      panelVisible: strictAntPanelVisible,
      wrapperEvents: strictAntWrapper.events,
      prevYearEvents: strictAntPanel._prevYearBtn.events,
      prevMonthEvents: strictAntPanel._prevMonthBtn.events,
    });
    process.exit(1);
  }

  const directAntInput = new MockInputElement("text");
  directAntInput.lockProgrammaticWrite = true;
  directAntInput.attributes.name = "birthdate";
  directAntInput.className = "ant-calendar-picker-input ant-input";
  const directAntPanel = new MockAntPanel(directAntInput, {
    strictMouseSequence: true,
    supportsPanelInput: false,
  });
  let directAntPanelVisible = false;
  const inertAntWrapper = new MockElementNode(
    "ant-calendar-picker",
    null,
    { strictMouseSequence: true }
  );
  directAntInput.closest = (selector) =>
    selector === ".ant-calendar-picker" ? inertAntWrapper : null;
  directAntInput.parentElement = {
    querySelector: (selector) =>
      selector === ".ant-calendar-picker-icon"
        ? new MockElementNode("ant-calendar-picker-icon", null, {
            strictMouseSequence: true,
          })
        : null,
  };
  directAntInput.dispatchEvent = (event) => {
    directAntInput.events.push(event?.type || "");
    const type = event?.type || "";
    if (type === "click") {
      directAntPanel.open = true;
      directAntPanelVisible = true;
    }
    return true;
  };

  context.document.querySelectorAll = (selector) => {
    if (
      selector === ".ant-calendar-picker-container:not(.slide-up-leave)" ||
      selector === ".ant-calendar-picker-container" ||
      selector === ".ant-calendar"
    ) {
      return directAntPanelVisible ? [directAntPanel] : [];
    }
    return [];
  };

  const directAntResult = await hooks.fillDateLikeField(
    { kind: "date_like", el: directAntInput, dateMode: "date", framework: "ant" },
    "2002-07-05"
  );

  if (!directAntResult.filled || directAntInput.value !== "2002-07-05") {
    console.error("Direct-input ant calendar fill failed", {
      directAntResult,
      value: directAntInput.value,
      panelVisible: directAntPanelVisible,
      inputEvents: directAntInput.events,
      wrapperEvents: inertAntWrapper.events,
    });
    process.exit(1);
  }

  const antPickerInput = new MockInputElement("text");
  antPickerInput.lockProgrammaticWrite = true;
  antPickerInput.attributes.name = "birthdate";
  antPickerInput.className = "ant-picker-input";
  const hiddenLegacyPanel = new MockAntPanel(antPickerInput, {
    strictMouseSequence: true,
    supportsPanelInput: false,
  });
  hiddenLegacyPanel.open = true;
  hiddenLegacyPanel.className = "ant-calendar-picker-container slide-up-leave";
  hiddenLegacyPanel.getAttribute = (name) => (name === "aria-hidden" ? "false" : "");
  hiddenLegacyPanel.querySelector = (selector) => {
    if (selector === ".ant-calendar-year-select") return new MockTextNode("2026年");
    if (selector === ".ant-calendar-month-select") return new MockTextNode("3月");
    return null;
  };
  hiddenLegacyPanel.querySelectorAll = () => [];

  const antPickerPanel = new MockAntPickerPanel(antPickerInput, {
    strictMouseSequence: true,
  });
  let antPickerVisible = false;
  const antPickerWrapper = new MockElementNode(
    "ant-picker",
    () => {
      antPickerPanel.open = true;
      antPickerVisible = true;
    },
    { strictMouseSequence: true }
  );
  antPickerInput.closest = (selector) =>
    selector === ".ant-picker" ? antPickerWrapper : null;
  antPickerInput.parentElement = {
    querySelector: () => null,
  };

  context.document.querySelectorAll = (selector) => {
    if (selector === ".ant-calendar-picker-container:not(.slide-up-leave)") {
      return [];
    }
    if (selector === ".ant-calendar-picker-container" || selector === ".ant-calendar") {
      return [hiddenLegacyPanel];
    }
    if (selector === ".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)") {
      return antPickerVisible ? [antPickerPanel] : [];
    }
    if (selector === ".ant-picker-dropdown") {
      return antPickerVisible ? [antPickerPanel] : [];
    }
    return [];
  };

  const antPickerResult = await hooks.fillDateLikeField(
    { kind: "date_like", el: antPickerInput, dateMode: "date", framework: "ant" },
    "2002-07-05"
  );

  if (!antPickerResult.filled || antPickerInput.value !== "2002-07-05") {
    console.error("Ant picker date fill failed", {
      antPickerResult,
      value: antPickerInput.value,
      panelVisible: antPickerVisible,
      wrapperEvents: antPickerWrapper.events,
      pickerPrevYearEvents: antPickerPanel._prevYearBtn.events,
      hiddenLegacyPanelClass: hiddenLegacyPanel.className,
    });
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ...baseline,
        nativeDateFill: nativeDateInput.value,
        nativeMonthFill: nativeMonthInput.value,
        extractedLabel,
        nativeDateEvents: nativeDateInput.events,
        nativeMonthEvents: nativeMonthInput.events,
        keyboardConfirmFill: keyboardConfirmInput.value,
        keyboardConfirmEvents: keyboardConfirmInput.events,
        panelFill: panelInput.value,
        antFill: antInput.value,
        delayedAntFill: delayedAntInput.value,
        strictAntFill: strictAntInput.value,
        directAntFill: directAntInput.value,
        antPickerFill: antPickerInput.value,
        status: "panel-fill-ok",
      },
      null,
      2
    )
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
