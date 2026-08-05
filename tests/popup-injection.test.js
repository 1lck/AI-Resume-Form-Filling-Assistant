const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("popup fallback injection includes all shared content helpers", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../popup.js"),
    "utf8"
  );

  assert.match(source, /shared\/resume-schema\.js/);
  assert.match(source, /shared\/diagnostics\.js/);
  assert.match(source, /shared\/field-text\.js/);
  assert.match(source, /shared\/field-semantics\.js/);
  assert.match(source, /shared\/fill-runtime\.js/);
  assert.match(source, /shared\/content-bridge\.js/);
  assert.match(source, /shared\/ai-client\.js/);
  assert.match(source, /content\.js/);
});

test("popup fill runner sends mode and scope for new fill actions", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../popup.js"),
    "utf8"
  );
  const html = fs.readFileSync(
    path.join(__dirname, "../popup.html"),
    "utf8"
  );

  assert.match(html, /id="startIncrementalFillBtn"/);
  assert.match(html, /id="startSelectionFillBtn"/);
  assert.match(source, /fillMode: actionConfig\.fillMode/);
  assert.match(source, /scope: actionConfig\.scope/);
  assert.match(source, /incrementalPage/);
  assert.match(source, /selection/);
});

test("manifest grants HTTP(S) access after switching the side panel to any web tab", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../manifest.json"), "utf8")
  );
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../package.json"), "utf8")
  );

  assert.deepEqual(manifest.host_permissions, ["http://*/*", "https://*/*"]);
  assert.equal(manifest.permissions.includes("activeTab"), false);
  assert.equal("content_scripts" in manifest, false);
  assert.equal(manifest.version, packageJson.version);
});

test("popup distinguishes missing page access from restricted system pages", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../popup.js"),
    "utf8"
  );

  assert.match(source, /if \(!tab\.url\)/);
  assert.match(source, /网页权限不可用/);
  assert.match(source, /if \(!isSupportedWebPageUrl\(tab\.url\)\)/);
});
