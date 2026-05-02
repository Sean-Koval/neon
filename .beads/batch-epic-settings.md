# Settings Page Completion

- type: epic
- priority: 2
- labels: frontend, ux, settings


Complete the Settings page (`/settings`) with URL-synced tab navigation, Evaluation Defaults card, and verification of existing API key validation and infrastructure health features.

**Wireframe:** `frontend/branding/wireframes/settings/index.txt` (666 lines)

**Current state:** ~60% implemented. All 4 tabs (Project, API Keys, Providers, Infrastructure) render. Missing Evaluation Defaults card in Project tab and URL-synced tab state. API key validation and infrastructure auto-refresh need verification against wireframe spec.

**Key files:**
- `frontend/app/settings/page.tsx` — main settings page with tab navigation
- `frontend/components/settings/project-settings.tsx` — Project tab content
- `frontend/components/settings/api-keys-section.tsx` — API Keys tab
- `frontend/components/settings/llm-providers.tsx` — Providers tab
- `frontend/components/settings/infrastructure.tsx` — Infrastructure tab
- `frontend/components/api-key-settings.tsx` — API key input component
- `frontend/hooks/use-settings.ts` — settings data hooks

---
## Sync settings tab state to URL

- type: task
- priority: 2
- labels: frontend, ux, settings
- estimate: 30

### Description


Replace client-only `useState` tab management with URL-synced tab state using search parameters. This enables direct linking to specific settings tabs (e.g., `/settings?tab=infrastructure`).

**Wireframe:** `frontend/branding/wireframes/settings/index.txt` — tab navigation area

**Requirements**

1. **Update `frontend/app/settings/page.tsx`**:
   - Replace `useState` for active tab with `useSearchParams` from `next/navigation`
   - Read tab from `?tab=` URL parameter, default to `project` if absent
   - Use shallow routing (`router.push` with `scroll: false`) when switching tabs so the page does not reload
   - Valid tab values: `project`, `api-keys`, `providers`, `infrastructure`
   - Invalid or missing `?tab=` value falls back to `project`

2. **Tab click handler**:
   - On tab click, update URL to `?tab={tabId}` via `router.push`
   - Tab UI visually reflects the current URL parameter
   - Browser back/forward buttons navigate between tabs correctly

3. **Preserve other query params** if any exist (use `URLSearchParams` to merge)

### Acceptance Criteria
- Navigating to `/settings?tab=infrastructure` opens directly on Infrastructure tab
- Clicking tabs updates the URL without full page reload
- Browser back button returns to previous tab
- Default tab is Project when no `?tab=` parameter is present
- Invalid `?tab=` values fall back to Project tab
---
## Build Evaluation Defaults card

- type: task
- priority: 1
- labels: frontend, api, settings
- estimate: 360

### Description


Build a new Evaluation Defaults card in the Project tab of Settings, below the existing System Information card. This card lets users configure default parameters for evaluation runs.

**Wireframe:** `frontend/branding/wireframes/settings/index.txt` — "Evaluation Defaults" section in Project tab

**Requirements**

1. **New card in `frontend/components/settings/project-settings.tsx`**:
   - Card title: "Evaluation Defaults"
   - Card description: "Configure default parameters for evaluation runs"
   - Positioned below the existing System Information card

2. **Form fields**:
   - **Default Model**: dropdown select with options: `claude-sonnet-4-5`, `gpt-4o`, `gemini-2.5-flash`, `gpt-4o-mini`, `claude-haiku-4-5`
   - **Minimum Pass Score**: number input, range 0-100%, step 5, default 80
   - **Max P50 Latency**: number input in milliseconds, step 100, default 2000
   - **Trace Retention Period**: dropdown select with options: `7 days`, `30 days`, `90 days`, `1 year`

3. **Save behavior**:
   - "Save Defaults" button at bottom of card
   - Button disabled until user changes at least one field (dirty state tracking)
   - Use `useForm` pattern or manual dirty tracking comparing current values to initial values
   - On save, call `PUT /api/settings/defaults` with form data
   - On success: show toast "Evaluation defaults saved", reset dirty state
   - On error: show toast with error message

4. **New API endpoint** `frontend/app/api/settings/defaults/route.ts`:
   - `GET`: returns current defaults from Postgres `project_settings` table
   - `PUT`: validates and stores updated defaults to Postgres
   - Both endpoints use `withAuth` middleware for workspace scoping
   - Schema validation on PUT: model must be in allowed list, pass score 0-100, latency > 0, retention in allowed values

5. **New hook** `frontend/hooks/use-evaluation-defaults.ts` (or add to existing `use-settings.ts`):
   - `useEvaluationDefaults()` returning `{ defaults, isLoading, error, updateDefaults }`
   - Uses React Query with `queryKey: ['evaluation-defaults']`
   - Invalidates query on successful mutation

### Acceptance Criteria
- Evaluation Defaults card renders below System Information in Project tab
- All 4 form fields render with correct input types and constraints
- Save button is disabled until a field is changed
- Saving calls the API and shows success toast
- Reloading the page preserves saved values
- Validation prevents invalid values (negative latency, score > 100, etc.)
---
## Verify API key validation flow

- type: task
- priority: 2
- labels: frontend, qa, settings
- estimate: 60

### Description


Verify that the `ApiKeySettings` component implements the full validation flow specified in the wireframe. Fix any deviations found.

**Wireframe:** `frontend/branding/wireframes/settings/index.txt` — "API Keys" tab section

**Requirements**

1. **Audit `frontend/components/api-key-settings.tsx`** against wireframe spec:

   - **Format validation**: regex `^ae_(dev|staging|prod)_[a-zA-Z0-9]{32,}$`
     - Triggered on blur or submit
     - Invalid format shows red border + inline error: "Invalid API key format"

   - **Functional validation**: on format pass, make test call to `api.getSuites()` (or equivalent health endpoint)
     - Show spinner/loading state during validation
     - On success: transition to "connected" state
     - On failure: show error "API key is invalid or expired"

   - **Success state**: display masked key (e.g., `ae_prod_****...****abcd`) + "Clear" link to remove
     - "Clear" link resets to input state

   - **Error state**: red border on input + error message below input
     - User can re-enter and retry

   - **Storage**: key stored in `sessionStorage` only (not `localStorage`, not cookies)
     - Verify no `localStorage.setItem` calls for the API key
     - On page refresh, key is cleared (sessionStorage behavior)

2. **Fix any deviations**:
   - If regex is missing or wrong, add/correct it
   - If functional validation is missing, add the test call
   - If storage uses localStorage, migrate to sessionStorage
   - If success/error states don't match wireframe, update the UI

### Acceptance Criteria
- Entering a malformed key shows format validation error immediately
- Entering a valid-format but non-functional key shows "invalid or expired" error after test call
- Entering a working key shows masked key with "Clear" link
- Clicking "Clear" resets to empty input state
- Key is in sessionStorage only — confirmed by checking browser storage in dev tools
- Refreshing the page clears the stored key
---
## Verify infrastructure auto-refresh

- type: task
- priority: 2
- labels: frontend, qa, settings
- estimate: 30

### Description


Verify that the Infrastructure tab implements auto-refresh and status badge logic as specified in the wireframe. Fix any deviations found.

**Wireframe:** `frontend/branding/wireframes/settings/index.txt` — "Infrastructure" tab section

**Requirements**

1. **Audit `frontend/hooks/use-settings.ts`** (or wherever `useInfrastructureHealth` is defined):
   - Confirm `refetchInterval: 30000` (30 seconds) is set on the query
   - Confirm the hook returns health status for both ClickHouse and Temporal services

2. **Audit `frontend/components/settings/infrastructure.tsx`**:
   - **Refresh button**: verify it shows spinner animation (e.g., `animate-spin` on refresh icon) while fetching
   - Spinner should appear during both auto-refresh and manual refresh
   - Button should call `refetch()` on click

3. **Overall status badge logic**:
   - Both services up → "Healthy" badge with `bg-emerald-500/10 text-emerald-500` styling
   - One service down → "Degraded" badge with `bg-amber-500/10 text-amber-500` styling
   - Both services down → "Unhealthy" badge with `bg-rose-500/10 text-rose-500` styling
   - Verify the badge text and colors match these exact states

4. **Individual service cards**:
   - Each service (ClickHouse, Temporal) shows its own status indicator
   - Connected: green dot + "Connected"
   - Disconnected: red dot + "Disconnected"
   - Checking: yellow dot + "Checking..." (during fetch)

### Acceptance Criteria
- Infrastructure tab auto-refreshes every 30 seconds without user action
- Manual refresh button shows spinning icon during fetch
- Overall status badge correctly reflects combined service health
- Individual service cards show correct connection status
- Stopping ClickHouse or Temporal changes the displayed status within 30s