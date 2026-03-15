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

(async () => {
  const nativeDateInput = new MockInputElement("date");
  const nativeMonthInput = new MockInputElement("month");

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

  console.log(
    JSON.stringify(
      {
        ...baseline,
        nativeDateFill: nativeDateInput.value,
        nativeMonthFill: nativeMonthInput.value,
        nativeDateEvents: nativeDateInput.events,
        nativeMonthEvents: nativeMonthInput.events,
        status: "native-fill-ok",
      },
      null,
      2
    )
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
