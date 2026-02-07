# /nav-check - Navigation Smoke Test

Layer 2 of the dev verification loop. Uses Playwright to visit every page and check for errors.

## Usage

```
/nav-check                    # Check all pages on localhost:3000
/nav-check <base-url>         # Check against a custom base URL
/nav-check <page-path>        # Check a single page (e.g., /skills)
```

## Prerequisites

Playwright must be installed. If not:
```bash
bun add -d playwright @playwright/test
bunx playwright install chromium
```

## Execution

When this command is invoked, follow these steps:

### Step 1: Create Playwright Test Script

Write a temporary script to the scratchpad directory that:

```typescript
// nav-check.ts
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const PAGES = [
  '/',
  '/eval-runs',
  '/traces',
  '/skills',
  '/analysis',
  '/compare',
  '/alerts',
  '/feedback',
  '/settings',
];

async function checkNavigation() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const results: Array<{
    page: string;
    status: string;
    errors: string[];
    networkFailures: string[];
    redirectedTo?: string;
  }> = [];

  for (const pagePath of PAGES) {
    const page = await context.newPage();
    const errors: string[] = [];
    const networkFailures: string[] = [];

    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // Capture failed network requests
    page.on('response', response => {
      if (response.status() >= 400) {
        networkFailures.push(`${response.status()} ${response.url()}`);
      }
    });

    try {
      const response = await page.goto(`${BASE_URL}${pagePath}`, {
        waitUntil: 'networkidle',
        timeout: 10000,
      });

      const finalUrl = page.url();
      const redirectedTo = finalUrl !== `${BASE_URL}${pagePath}`
        ? finalUrl.replace(BASE_URL, '')
        : undefined;

      results.push({
        page: pagePath,
        status: response?.status()?.toString() || 'unknown',
        errors,
        networkFailures,
        redirectedTo,
      });
    } catch (e: any) {
      results.push({
        page: pagePath,
        status: 'TIMEOUT',
        errors: [e.message],
        networkFailures,
      });
    }

    await page.close();
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

checkNavigation();
```

### Step 2: Run the Script

```bash
bunx tsx /path/to/scratchpad/nav-check.ts
```

### Step 3: Parse and Report Results

Read the JSON output and classify:

- **CRITICAL**: Pages that timeout, return non-200, or have JS errors
- **WARNING**: Pages that redirect unexpectedly, or have failed network requests (API 401s/404s)
- **OK**: Pages that load cleanly with no errors

### Step 4: Report

```
## Navigation Smoke Test Results

Base URL: http://localhost:3000
Pages tested: 9
Time: 12.4s

### CRITICAL
- /skills -> 200 but 6 failed API calls (404: /api/skills/summaries, /api/skills/regressions, ...)
- /alerts -> 200 but 3 failed API calls (401: /api/alerts x3)

### WARNING
- /suites/test-id -> REDIRECT to /eval-runs (stub page)

### OK (6 pages)
- / -> 200 (0 errors, 2 network failures)
- /eval-runs -> 200 (0 errors)
- /settings -> 200 (0 errors)
...
```

## Notes

- The dev server must be running
- Playwright runs headless Chromium
- Network failures are detected by intercepting responses
- Console errors indicate JS runtime issues
- Redirects indicate stub pages that need implementation
- This layer takes ~15 seconds
