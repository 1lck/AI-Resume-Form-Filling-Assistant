#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const fixturePath = path.resolve(
  __dirname,
  "..",
  "fixtures",
  "date-picker-fixture.html"
);

const html = fs.readFileSync(fixturePath, "utf8");

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
  status: "baseline-ready",
};

console.log(JSON.stringify(baseline, null, 2));
