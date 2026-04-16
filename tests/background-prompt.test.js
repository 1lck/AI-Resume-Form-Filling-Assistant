const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("field mapping prompt includes campus recruiting constraints", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../background.js"),
    "utf8"
  );

  assert.match(source, /校招场景优先级/);
  assert.match(source, /internships\.\*/);
  assert.match(source, /campusExperiences\.\*/);
  assert.match(source, /educations\.\*/);
  assert.match(source, /没有实习经历/);
  assert.match(source, /hasValue=true/);
  assert.match(source, /sectionLabel/);
  assert.match(source, /nearbyLabels/);
});
