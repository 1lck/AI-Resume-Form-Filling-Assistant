const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("popup and content use the same mapping cache version", () => {
  const popupSource = fs.readFileSync(
    path.join(__dirname, "../popup.js"),
    "utf8"
  );
  const contentSource = fs.readFileSync(
    path.join(__dirname, "../content.js"),
    "utf8"
  );

  const popupMatch = popupSource.match(/const MAPPING_CACHE_KEY = "(fieldMappingCacheV\d+)"/);
  const contentMatch = contentSource.match(/const MAPPING_CACHE_KEY = "(fieldMappingCacheV\d+)"/);

  assert.ok(popupMatch);
  assert.ok(contentMatch);
  assert.equal(popupMatch[1], contentMatch[1]);
});
