const test = require("node:test");
const assert = require("node:assert/strict");

const bridge = require("../shared/content-bridge.js");

test("contentScriptHasDiagnosticsSupport accepts matching version and capability", () => {
  assert.equal(
    bridge.contentScriptHasDiagnosticsSupport({
      success: true,
      version: bridge.CONTENT_SCRIPT_VERSION,
      capabilities: {
        fullDiagnostics: true,
      },
    }),
    true
  );
});

test("contentScriptHasDiagnosticsSupport rejects stale or partial responses", () => {
  assert.equal(bridge.contentScriptHasDiagnosticsSupport({ success: true }), false);
  assert.equal(
    bridge.contentScriptHasDiagnosticsSupport({
      success: true,
      version: "old-version",
      capabilities: {
        fullDiagnostics: true,
      },
    }),
    false
  );
  assert.equal(
    bridge.contentScriptHasDiagnosticsSupport({
      success: true,
      version: bridge.CONTENT_SCRIPT_VERSION,
      capabilities: {
        fullDiagnostics: false,
      },
    }),
    false
  );
});
