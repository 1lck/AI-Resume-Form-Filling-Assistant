const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadClickHelper() {
  const source = fs.readFileSync(path.join(__dirname, "../content.js"), "utf8");
  const start = source.indexOf("  function clickLikeUser(el) {");
  const end = source.indexOf("  function parseDateParts(value) {", start);
  const snippet = `
    function scrollIntoView() {}
    ${source.slice(start, end)}
    module.exports = { clickLikeUser };
  `;
  const context = {
    module: { exports: {} },
    exports: {},
    MouseEvent: class MouseEvent {
      constructor(type) {
        this.type = type;
      }
    },
  };
  vm.createContext(context);
  vm.runInContext(snippet, context);
  return context.module.exports.clickLikeUser;
}

test("clickLikeUser emits one activation", () => {
  const clickLikeUser = loadClickHelper();
  const dispatched = [];
  let nativeClicks = 0;
  const element = {
    focus() {},
    dispatchEvent(event) {
      dispatched.push(event.type);
    },
    click() {
      nativeClicks += 1;
    },
  };

  clickLikeUser(element);

  assert.deepEqual(JSON.parse(JSON.stringify(dispatched)), ["mousedown", "mouseup"]);
  assert.equal(nativeClicks, 1);
});
