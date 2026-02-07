# /visual-check - Visual Verification

Layer 3 of the dev verification loop. Takes screenshots of pages and uses multimodal analysis to detect visual bugs.

## Usage

```
/visual-check                 # Screenshot all pages on localhost:3000
/visual-check <page-path>     # Screenshot a single page (e.g., /skills)
/visual-check --pages /,/eval-runs,/settings   # Check specific pages
```

## Prerequisites

Playwright must be installed (same as /nav-check).

## Execution

When this command is invoked, follow these steps:

### Step 1: Take Screenshots

For each target page, use Bash with a Playwright script:

```bash
# Write a quick screenshot script
cat > /tmp/screenshot-pages.ts << 'SCRIPT'
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const pages = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ['/', '/eval-runs', '/traces', '/skills', '/alerts', '/feedback', '/settings'];

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  for (const pagePath of pages) {
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}${pagePath}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000); // Let animations settle
      const safeName = pagePath.replace(/\//g, '_').replace(/^_/, '') || 'home';
      await page.screenshot({
        path: `/tmp/visual-check-${safeName}.png`,
        fullPage: true,
      });
      console.log(`Captured: ${pagePath} -> /tmp/visual-check-${safeName}.png`);
    } catch (e) {
      console.error(`Failed: ${pagePath} - ${e.message}`);
    }
    await page.close();
  }
  await browser.close();
}

captureScreenshots();
SCRIPT

bunx tsx /tmp/screenshot-pages.ts
```

### Step 2: Analyze Each Screenshot

For each captured screenshot, use the **Read tool** (which is multimodal) to view the image:

```
Read: /tmp/visual-check-home.png
```

When viewing each screenshot, check for:

1. **Empty states**: Large blank areas where content should be (data tables with no rows, charts with no data)
2. **Error messages**: Red banners, "Something went wrong", error boundaries, "Failed to load"
3. **Broken layout**: Overlapping elements, text cut off, sidebar collapsed unexpectedly
4. **Missing components**: Sections that should have cards/charts but show nothing
5. **Loading stuck**: Spinners that never resolve (page captured after networkidle)
6. **Auth walls**: "Please log in" or "Unauthorized" messages on pages that should work in dev
7. **Console error indicators**: Red badges, warning icons in the UI

### Step 3: Report

```
## Visual Verification Results

Pages screenshotted: 7
Time: 28.4s

### ISSUES FOUND

#### /skills (visual-check-skills.png)
- Large empty area where skill cards should be
- "No skills found" placeholder is showing - indicates missing API data
- Severity: WARNING (page renders but has no useful content)

#### /alerts (visual-check-alerts.png)
- Error banner: "Failed to load alerts"
- Page is mostly blank below the header
- Severity: CRITICAL (page is unusable)

### LOOKS GOOD

#### / (visual-check-home.png)
- Dashboard layout intact: sidebar + main content area
- Score trend chart visible (even if no data, shows placeholder correctly)
- Recent runs section present

#### /settings (visual-check-settings.png)
- Settings form renders correctly
- Health check section shows service status
```

## Notes

- This is the most expensive layer (~40 seconds + tokens for image analysis)
- Run /api-check and /nav-check first to catch cheaper-to-detect issues
- Screenshots are saved to /tmp/ and can be viewed directly
- The Read tool can interpret PNG images and describe what it sees
- Focus analysis on FUNCTIONAL issues (missing data, errors) not AESTHETIC ones
- Viewport is 1280x900 (standard laptop resolution)
