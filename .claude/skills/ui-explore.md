# /ui-explore - Interactive UI Exploration

AI-driven QA that operates the application as a real user: clicking buttons, filling forms, opening modals, submitting data, and verifying results through screenshots.

## Usage

```
/ui-explore                        # Explore all pages interactively
/ui-explore /eval-runs             # Explore a specific page
/ui-explore /eval-runs "start a new eval run"   # Test a specific user flow
```

## Prerequisites

Playwright must be installed and the dev server must be running:
```bash
bun add -d playwright @playwright/test && bunx playwright install chromium
bun run dev   # or bun run frontend
```

## Core Pattern: The See-Act Loop

This skill is an iterative loop. You are the QA tester. Each cycle:

```
SCREENSHOT → SEE (Read image) → THINK (what to interact with) → ACT (Playwright script) → SCREENSHOT → SEE → ...
```

**You drive the loop.** After each screenshot, YOU decide what to click, fill, or test next based on what you see.

## Execution

### Step 1: Take Initial Screenshot

Write and run a Playwright script to navigate to the target page and screenshot it:

```bash
cat > /tmp/ui-explore.ts << 'SCRIPT'
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto(`${BASE_URL}/eval-runs`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/ui-step-1.png', fullPage: true });
  console.log('Screenshot saved: /tmp/ui-step-1.png');

  await browser.close();
}
run();
SCRIPT
bunx tsx /tmp/ui-explore.ts
```

### Step 2: View the Screenshot

```
Read: /tmp/ui-step-1.png
```

Look at the page and identify:
- What buttons, links, and clickable elements are visible?
- What forms or inputs exist?
- What dropdowns, tabs, or filters are available?
- Is there an obvious user flow to test? (e.g., "New Eval Run" button)

### Step 3: Interact

Based on what you see, write a NEW Playwright script that performs the interaction. **Each script is self-contained** — it launches a browser, navigates, performs actions, and screenshots at each step.

```bash
cat > /tmp/ui-explore.ts << 'SCRIPT'
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  // Navigate to the page
  await page.goto(`${BASE_URL}/eval-runs`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(500);

  // Click the "New Eval Run" button
  await page.getByRole('button', { name: /new eval/i }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/ui-step-2.png', fullPage: true });
  console.log('Clicked "New Eval Run" -> /tmp/ui-step-2.png');

  // Fill in the form
  await page.getByLabel(/agent id/i).fill('test-agent-v1');
  await page.getByLabel(/agent version/i).fill('1.0.0');
  await page.screenshot({ path: '/tmp/ui-step-3.png', fullPage: true });
  console.log('Filled form fields -> /tmp/ui-step-3.png');

  // Click submit
  await page.getByRole('button', { name: /start eval/i }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/ui-step-4.png', fullPage: true });
  console.log('Submitted form -> /tmp/ui-step-4.png');

  await browser.close();
}
run();
SCRIPT
bunx tsx /tmp/ui-explore.ts
```

### Step 4: View Results and Continue

View each screenshot with Read. For each one, evaluate:
- Did the expected thing happen? (modal opened, form submitted, page navigated)
- Are there error messages, validation failures, or broken UI?
- What should be tested next?

Then write another script to continue exploring, or move to the next page.

**Repeat Steps 2-4 until the page is thoroughly explored.**

## Playwright Selector Strategy

Use these selectors in order of preference (most reliable first):

```typescript
// 1. By role + name (best — accessible, resilient to markup changes)
page.getByRole('button', { name: /new eval run/i })
page.getByRole('link', { name: /settings/i })
page.getByRole('tab', { name: /api keys/i })
page.getByRole('dialog')
page.getByRole('combobox')

// 2. By label (best for form fields)
page.getByLabel(/agent id/i)
page.getByLabel(/email/i)

// 3. By placeholder
page.getByPlaceholder(/search/i)

// 4. By visible text
page.getByText('Compare Runs')
page.getByText(/no results/i)

// 5. By test ID (if available)
page.getByTestId('run-table')

// 6. By CSS (last resort)
page.locator('button.primary')
page.locator('[data-state="open"]')
page.locator('table tbody tr').first()
```

**Always use case-insensitive regex** (`/pattern/i`) for text matching — it's more resilient.

## Common Interaction Patterns

### Click a button and wait for modal
```typescript
await page.getByRole('button', { name: /new eval/i }).click();
await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
await page.screenshot({ path: '/tmp/ui-step-N.png' });
```

### Fill a form
```typescript
await page.getByLabel(/agent id/i).fill('test-agent');
await page.getByLabel(/version/i).fill('1.0');
```

### Select from a dropdown
```typescript
// Native <select>
await page.selectOption('select[name="status"]', 'completed');

// Custom dropdown (click to open, then click option)
await page.getByRole('combobox').click();
await page.getByRole('option', { name: /completed/i }).click();
```

### Toggle checkboxes
```typescript
await page.getByLabel(/tool selection/i).check();
await page.getByLabel(/response quality/i).check();
```

### Switch tabs
```typescript
await page.getByRole('tab', { name: /api keys/i }).click();
await page.waitForTimeout(300);
```

### Click a table row
```typescript
await page.locator('table tbody tr').first().click();
await page.waitForTimeout(500);
```

### Submit a form and check result
```typescript
await page.getByRole('button', { name: /submit|save|create|start/i }).click();
await page.waitForTimeout(2000); // Wait for API call
await page.screenshot({ path: '/tmp/ui-step-N.png' });
// View screenshot to check: success toast? error message? redirect?
```

### Scroll to see more content
```typescript
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/ui-step-N.png', fullPage: true });
```

### Check for error states after interaction
```typescript
// Check for error toasts or banners
const errorVisible = await page.locator('[role="alert"], .error, .toast-error').isVisible();
console.log(`Error visible: ${errorVisible}`);

// Check for validation errors
const validationErrors = await page.locator('.field-error, [aria-invalid="true"]').count();
console.log(`Validation errors: ${validationErrors}`);

// Check console errors (capture before interactions)
page.on('console', msg => {
  if (msg.type() === 'error') console.log(`CONSOLE ERROR: ${msg.text()}`);
});

// Check failed network requests
page.on('response', resp => {
  if (resp.status() >= 400) console.log(`NET FAIL: ${resp.status()} ${resp.url()}`);
});
```

## What to Test on Each Page

### Dashboard (`/`)
- Click time range filters (7d, 30d, 90d, All)
- Expand "More Filters", change status/suite dropdowns
- Click a run row → verify navigation to run detail
- Click "View all runs" → verify navigation to /eval-runs
- Pagination: click Next/Prev

### Eval Runs (`/eval-runs`)
- Click "New Eval Run" → verify modal opens
- Fill out the form completely → submit → check result
- Click status filter dropdown → select different statuses
- Click a run row → verify detail page loads
- Refresh button

### Eval Run Detail (`/eval-runs/[id]`)
- Back button → returns to list
- Export JSON button → download triggers
- If running: Pause/Resume/Cancel buttons
- Temporal UI link → opens (don't follow, just check href)

### Traces (`/traces`)
- Search input: type a query, verify filtering
- Status dropdown: filter by Success/Error
- Click a trace row → verify detail page
- "Load More" button

### Trace Detail (`/traces/[id]`)
- Toggle between Timeline/Decisions/Multi-Agent views
- Click spans in timeline → detail panel opens
- Close detail panel button

### Settings (`/settings`)
- Switch between tabs: Project, API Keys, LLM Providers, Infrastructure
- Verify each tab renders content (not blank)

### Feedback (`/feedback`)
- Switch between Compare/Corrections/History tabs
- In Compare: click A/B/Tie/Both Bad buttons
- In Corrections: select a response, fill correction form

### Compare (`/compare`)
- Select baseline and candidate runs from dropdowns
- Click "Compare Runs"
- Change threshold

### Alerts (`/alerts`)
- Change threshold values in alert config
- Click Save

### Skills (`/skills`)
- Search input: type to filter
- Trend filter dropdown
- Click a skill card → modal opens

## Handling Failures

When an interaction fails (selector not found, timeout, etc.):

1. **Don't give up.** Take a screenshot to see the current state.
2. **Adjust the selector.** Try a different locator strategy.
3. **Check if the element is behind a scroll.** Try scrolling first.
4. **Check if a modal or overlay is blocking.** Close it first.
5. **Log the failure and move on** to the next interaction.

When a page shows errors after interaction:

1. **Screenshot the error state.** This IS the bug you're looking for.
2. **Note the exact error message** from the UI or console.
3. **Note what action triggered it** (which button, what form data).
4. **Continue testing** — one bug shouldn't stop the exploration.

## Report Format

After exploring a page (or set of pages), produce a report:

```
## UI Exploration Report: /eval-runs

### Interactions Tested: 12
### Bugs Found: 2
### Time: 45s

### BUG: New Eval Run form submission fails
- **Steps**: Click "New Eval Run" → Fill Agent ID → Fill Version → Click "Start Eval Run"
- **Expected**: Run starts, modal closes, new run appears in list
- **Actual**: 400 error returned, toast shows "Validation failed: missing test cases"
- **Screenshot**: /tmp/ui-step-4.png
- **Severity**: HIGH (core workflow broken)

### BUG: Status filter shows no results for "Running"
- **Steps**: Click Status dropdown → Select "Running"
- **Expected**: Table filters to show running runs (or empty state)
- **Actual**: Table disappears entirely, no empty state shown
- **Screenshot**: /tmp/ui-step-7.png
- **Severity**: MEDIUM (filter UI broken)

### WORKING
- Page loads correctly with run list (step 1)
- "New Eval Run" button opens modal (step 2)
- Form fields accept input (step 3)
- Run rows are clickable, navigate to detail page (step 5)
- Refresh button reloads data (step 6)
- Pagination works (step 9, step 10)
```

## Notes

- **Each Playwright script is self-contained.** It launches a browser, does its work, and closes. No persistent browser state between scripts.
- **Screenshot at every step.** Interactions without screenshots are invisible. Always capture before and after.
- **Use `/tmp/ui-step-N.png`** naming with incrementing N across all steps in an exploration session.
- **Test user journeys, not random clicks.** Think: "What would a user try to do?" then test that complete flow.
- **Console errors and network failures** are just as important as visual bugs. Always capture them.
- **Don't test aesthetics.** Test function: does clicking X do Y? Does submitting the form work? Does the page show data?
- **This skill replaces `/nav-check` and `/visual-check`** for thorough verification. Those skills are still useful for quick passive checks.
