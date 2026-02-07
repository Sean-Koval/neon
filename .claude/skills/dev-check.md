# /dev-check - Full Dev Verification Loop

Orchestrator that verifies the application works end-to-end: API health, then interactive UI exploration.

## Usage

```
/dev-check                         # Full verification against localhost:3000
/dev-check --quick                 # API check + passive nav check only (~20s)
/dev-check /eval-runs              # Full verification of a single page
/dev-check /eval-runs "create a new eval run"  # Test a specific user flow
```

## Architecture

```
/dev-check (orchestrator)
├── Layer 1: /api-check        ~5s    curl all endpoints, check status codes
└── Layer 2: /ui-explore       ~2-5m  interactive exploration (click, fill, submit)
```

For quick passive checks without interaction:
```
/api-check                     ~5s    API health only
/nav-check                     ~15s   visit pages, no interaction
/visual-check                  ~40s   screenshot pages, no interaction
```

## Execution

### Step 1: Run /api-check (always first)

Execute `/api-check`. This takes ~5 seconds and catches broken endpoints before wasting time on browser tests. If critical API failures are found, note them — they'll likely cause UI failures too.

### Step 2: Run /ui-explore

Execute `/ui-explore` on the target pages. This is the core of the verification: Claude navigates to each page, clicks buttons, fills forms, opens modals, submits data, and screenshots every step to verify things actually work.

If a specific page or user flow was requested, focus there. Otherwise, explore the pages most likely to be affected by recent changes.

**Priority order for full exploration:**
1. Pages you just modified
2. Pages that depend on APIs you changed
3. Core user flows: create eval run, view traces, configure settings
4. Secondary flows: compare runs, manage alerts, provide feedback

### Step 3: Combined Report

```
## Dev Verification Report

Base URL: http://localhost:3000

---

### API Health (5.2s)
Endpoints tested: 23 | CRITICAL: 2 | WARNING: 1 | OK: 20

- CRITICAL: GET /api/alerts -> 401
- CRITICAL: GET /api/skills/summaries -> 404
- WARNING: POST /api/trpc/feedback.create -> 400

---

### UI Exploration (3m 12s)
Pages explored: 4 | Interactions: 28 | Bugs: 3

#### /eval-runs (12 interactions)
- BUG: Form submit returns 400 — missing test cases validation
- WORKING: Modal opens, form fields accept input, pagination works

#### /settings (8 interactions)
- WORKING: All 4 tabs render, settings save correctly

#### /traces (5 interactions)
- BUG: Search input doesn't filter results
- WORKING: Status filter, trace detail navigation

#### /feedback (3 interactions)
- BUG: Compare tab shows "No responses" — API returns empty
- WORKING: Tab switching works

---

### Summary
| Type | Count |
|------|-------|
| API failures | 3 |
| UI bugs | 3 |
| Interactions tested | 28 |
| Working features | 25 |

### Recommended Fix Order
1. Auth middleware for local dev (unblocks alerts, traces APIs)
2. Eval run form validation (core workflow)
3. Trace search filtering
4. Feedback API data
```

## Notes

- Always run `/api-check` first — it's 5 seconds and catches the cheapest bugs
- `/ui-explore` is the thorough layer — it actually uses the app as a human would
- For quick iteration during development, use `/api-check` alone
- For pre-commit verification, run the full `/dev-check`
- The old `/nav-check` and `/visual-check` are still available for quick passive checks
