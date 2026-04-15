const test = require("node:test");
const assert = require("node:assert/strict");

const logExport = require("../shared/log-export.js");

test("buildLogFileName uses timestamp, host, title, and status", () => {
  const fileName = logExport.buildLogFileName({
    startedAt: "2026-04-15T13:30:45.000Z",
    url: "https://jobs.example.com/apply/frontend",
    title: "Frontend Engineer / 申请表",
    status: "success",
  });

  assert.equal(
    fileName,
    "2026-04-15_13-30-45_jobs.example.com_frontend-engineer-success.json"
  );
});

test("buildLogFileName falls back gracefully when host/title are missing", () => {
  const fileName = logExport.buildLogFileName({
    startedAt: "2026-04-15T13:30:45.000Z",
    url: "",
    title: "",
    status: "error",
  });

  assert.equal(fileName, "2026-04-15_13-30-45_unknown-host_resume-fill-error.json");
});

test("createLogExportPayload keeps logs, stats, and tab metadata", () => {
  const payload = logExport.createLogExportPayload({
    id: "fill-001",
    startedAt: "2026-04-15T13:30:45.000Z",
    endedAt: "2026-04-15T13:31:02.000Z",
    status: "success",
    tab: {
      id: 99,
      url: "https://jobs.example.com/apply/frontend",
      title: "Frontend Engineer / 申请表",
    },
    stats: {
      fieldCount: 18,
      mappedCount: 16,
      filledCount: 14,
    },
    logs: [
      {
        level: "info",
        message: "[扫描] f_1 text label=\"电子邮箱\"",
        timestamp: "2026-04-15T13:30:46.000Z",
      },
    ],
  });

  assert.equal(payload.sessionId, "fill-001");
  assert.equal(payload.status, "success");
  assert.equal(payload.tab.url, "https://jobs.example.com/apply/frontend");
  assert.equal(payload.stats.filledCount, 14);
  assert.equal(payload.logs.length, 1);
  assert.equal(payload.logs[0].message, "[扫描] f_1 text label=\"电子邮箱\"");
});
