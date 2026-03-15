# Date Picker Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add robust date field autofill support for native date inputs and common date-picker widgets without regressing existing form fill behavior.

**Architecture:** Extend `content.js` with `date_like` scanning metadata, date normalization helpers, and a multi-step date fill pipeline. Update the AI prompt in `background.js` to emit normalized date strings and add a lightweight local fixture for regression checks.

**Tech Stack:** Chrome extension MV3, vanilla JavaScript, local HTML fixture, git worktree workflow

---

### Task 1: Add fixture coverage for date fields

**Files:**
- Create: `tests/fixtures/date-picker-fixture.html`
- Create: `tests/manual/check-date-fixture.js`

**Step 1: Write the failing test fixture**

Create a fixture page with:

- native `input[type="date"]`
- native `input[type="month"]`
- one mock date-picker that only updates after panel clicks

**Step 2: Run fixture smoke check to verify current failure**

Run: `rg -n "data-test" tests/fixtures/date-picker-fixture.html tests/manual/check-date-fixture.js`
Expected: Fixture exists but current extension code still lacks `date_like` support.

**Step 3: Write minimal fixture helper**

Add a small page script or manual check script that prints each field's final value after simulated fill.

**Step 4: Run smoke check**

Run: `node tests/manual/check-date-fixture.js`
Expected: Script runs and reports placeholder baseline output.

**Step 5: Commit**

```bash
git add tests/fixtures/date-picker-fixture.html tests/manual/check-date-fixture.js
git commit -m "test: add date picker fixture coverage"
```

### Task 2: Teach AI prompt and scanner about date-like fields

**Files:**
- Modify: `background.js`
- Modify: `content.js`
- Test: `tests/fixtures/date-picker-fixture.html`

**Step 1: Write the failing scanner expectation**

Document expected fixture fields:

- birth date => `date_like`
- birth month => `date_like`
- generic panel input with date hints => `date_like`

**Step 2: Run a targeted grep check**

Run: `rg -n "date_like|dob|birthday|出生日期|出生年月" content.js background.js`
Expected: No `date_like` support yet.

**Step 3: Write minimal implementation**

- update `background.js` form-fill prompt with normalized date string guidance
- add `date_like` detection and metadata collection in `scanFields()`

**Step 4: Run verification**

Run: `rg -n "date_like|YYYY-MM-DD|YYYY-MM" background.js content.js`
Expected: New date-specific logic is present.

**Step 5: Commit**

```bash
git add background.js content.js
git commit -m "feat: detect date-like fields"
```

### Task 3: Add native date normalization and fill support

**Files:**
- Modify: `content.js`
- Test: `tests/manual/check-date-fixture.js`

**Step 1: Write the failing verification path**

Capture target expectations:

- date input accepts `YYYY-MM-DD`
- month input accepts `YYYY-MM`
- invalid natural-language dates are rejected before write

**Step 2: Run verification to show missing implementation**

Run: `rg -n "normalizeDate|fillDateLikeField|datetime-local" content.js`
Expected: Missing helpers.

**Step 3: Write minimal implementation**

- add date parsing/normalization helpers
- route `date_like` through `fillDateLikeField()`
- support native setter + event dispatch + value readback

**Step 4: Run verification**

Run: `node tests/manual/check-date-fixture.js`
Expected: Native date and month cases pass.

**Step 5: Commit**

```bash
git add content.js tests/manual/check-date-fixture.js
git commit -m "feat: support native date inputs"
```

### Task 4: Add panel-click fallback for generic date pickers

**Files:**
- Modify: `content.js`
- Modify: `tests/fixtures/date-picker-fixture.html`
- Modify: `tests/manual/check-date-fixture.js`

**Step 1: Write the failing panel scenario**

Make the fixture date picker ignore direct value assignment so current logic fails without panel clicks.

**Step 2: Run verification to confirm failure**

Run: `node tests/manual/check-date-fixture.js`
Expected: Panel-backed case fails while native cases pass.

**Step 3: Write minimal implementation**

- open date panel when needed
- locate candidate popup container
- click month/day cells based on normalized target
- re-read the bound input to confirm success

**Step 4: Run verification**

Run: `node tests/manual/check-date-fixture.js`
Expected: Native and panel-backed scenarios pass.

**Step 5: Commit**

```bash
git add content.js tests/fixtures/date-picker-fixture.html tests/manual/check-date-fixture.js
git commit -m "feat: add date picker panel fallback"
```

### Task 5: Manual extension verification

**Files:**
- Modify: `README.md`

**Step 1: Record manual verification checklist**

Add a short note describing supported date controls and verification limitations.

**Step 2: Run final verification**

Run: `node tests/manual/check-date-fixture.js && git status --short`
Expected: Fixture checks pass and only intended files are modified.

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document date picker support"
```
