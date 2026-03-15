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
if (!hooks.normalizeDateLikeValue || !hooks.fillDateLikeField) {
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

class MockTextNode {
  constructor(text) {
    this.textContent = text;
  }
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
  constructor(className = "", onClick = null) {
    this.className = className;
    this._onClick = onClick;
  }

  click() {
    if (this._onClick) this._onClick();
  }

  focus() {}
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
  constructor(title, text, onClick) {
    this._title = title;
    this.textContent = text;
    this._onClick = onClick;
  }

  getAttribute(name) {
    if (name === "title") return this._title;
    return "";
  }

  click() {
    this._onClick();
  }
}

class MockAntPanel {
  constructor(input) {
    this.input = input;
    this.open = false;
    this.className = "ant-calendar-picker-container";
    this.year = 2026;
    this.month = 3;
    this._yearNode = new MockTextNode(`${this.year}年`);
    this._monthNode = new MockTextNode(`${this.month}月`);
    this._prevYearBtn = new MockElementNode("ant-calendar-prev-year-btn", () => {
      this.year -= 1;
      this.syncHeader();
    });
    this._nextYearBtn = new MockElementNode("ant-calendar-next-year-btn", () => {
      this.year += 1;
      this.syncHeader();
    });
    this._prevMonthBtn = new MockElementNode("ant-calendar-prev-month-btn", () => {
      this.month -= 1;
      if (this.month < 1) {
        this.month = 12;
        this.year -= 1;
      }
      this.syncHeader();
    });
    this._nextMonthBtn = new MockElementNode("ant-calendar-next-month-btn", () => {
      this.month += 1;
      if (this.month > 12) {
        this.month = 1;
        this.year += 1;
      }
      this.syncHeader();
    });
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
      return ["19", "20", "21", "22"].map(
        (day) =>
          new MockAntCell(
            `${this.year}-${String(this.month).padStart(2, "0")}-${day}`,
            String(Number(day)),
            () => {
              this.input.lockProgrammaticWrite = false;
              this.input.value = `${this.year}-${String(this.month).padStart(2, "0")}-${day}`;
              this.input.lockProgrammaticWrite = true;
              this.open = false;
            }
          )
      );
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

  console.log(
    JSON.stringify(
      {
        ...baseline,
        nativeDateFill: nativeDateInput.value,
        nativeMonthFill: nativeMonthInput.value,
        nativeDateEvents: nativeDateInput.events,
        nativeMonthEvents: nativeMonthInput.events,
        keyboardConfirmFill: keyboardConfirmInput.value,
        keyboardConfirmEvents: keyboardConfirmInput.events,
        panelFill: panelInput.value,
        antFill: antInput.value,
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
