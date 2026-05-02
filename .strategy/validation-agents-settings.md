# Validation Report: Agents & Settings Epic Tickets

**Generated:** 2026-02-13
**Branch:** `feat/core-ip-optimization-activities`
**Methodology:** Each ticket's acceptance criteria were checked against the actual source files in the codebase.

---

## EPIC 1: Agents List Page Redesign

### Ticket: Add registry summary stat cards to agents list
- **Status:** NOT DONE
- **Evidence:**
  - The component `frontend/components/agents/agent-stat-cards.tsx` does **not exist**.
  - `frontend/app/agents/page.tsx` has no stat cards above the filter bar.
  - No 5-card horizontal row (Total Agents, Healthy, Degraded, Failing, Stale) is rendered.
  - No `?status=X` URL search param filtering is implemented (the page uses `useState` for `statusFilter`, not `useSearchParams`).
  - No "Stale" status concept exists anywhere in the agents page. The status filter dropdown only has Healthy, Degraded, Failing.
  - **Missing all acceptance criteria.**

### Ticket: Add tag filtering UI to agents list
- **Status:** NOT DONE
- **Evidence:**
  - The component `frontend/components/agents/tag-filter.tsx` does **not exist**.
  - `frontend/app/agents/page.tsx` has no tag filter dropdown, no multi-select, no tag pills, no `?tags=` URL parameter.
  - The agent data model (`AgentCardData`) does not include a `tags` field.
  - **Missing all acceptance criteria.**

### Ticket: Add table view toggle with bulk actions to agents list
- **Status:** NOT DONE
- **Evidence:**
  - `frontend/components/agents/agent-table-view.tsx` does **not exist**.
  - `frontend/components/agents/view-toggle.tsx` does **not exist**.
  - `frontend/components/agents/bulk-actions-bar.tsx` does **not exist**.
  - `frontend/app/agents/page.tsx` only renders a grid view (card layout). No table view, no view toggle, no checkboxes, no bulk actions bar, no `localStorage` preference.
  - **Missing all acceptance criteria.**

### Ticket: Build Register Agent modal
- **Status:** PARTIAL
- **Evidence:**
  - `frontend/components/agents/register-agent-modal.tsx` **exists** and is mounted in `frontend/app/agents/page.tsx` with a "Register Agent" button.
  - **Implemented:**
    - "Register Agent" button opens the modal.
    - Agent Name (ID) field with slug validation (`/^[a-z0-9][a-z0-9-]*$/`).
    - Display Name field.
    - Description textarea with 500 char max.
    - Team text input.
    - Environments checkbox group (production, staging, development).
    - Submit calls `trpc.agents.upsert` mutation.
    - Success toast and list invalidation on success.
    - Inline error on failure.
    - Form reset on close.
  - **Missing (vs wireframe spec):**
    - No **4-section layout** (Identity, Organization, Connections, SLA Targets) -- it is a flat form.
    - No **Tags** multi-select input (create new or select existing).
    - No **Team combobox** with searchable dropdown and ability to create new -- it is a plain text input.
    - No **Connections Section** (Eval Suites multi-select from `trpc.suites.list`, MCP Servers multi-select from `trpc.mcp.list`).
    - No **SLA Targets Section** (Minimum Pass Rate, Maximum Error Rate, Maximum Latency, Maximum Cost per Call).
  - **Verdict:** Core identity fields and submission work, but about half the form sections are missing.

### Ticket: Add sort dropdown to agents list
- **Status:** NOT DONE
- **Evidence:**
  - `frontend/components/agents/sort-dropdown.tsx` does **not exist**.
  - `frontend/app/agents/page.tsx` has no sort dropdown, no sort logic, no `?sort=` URL parameter.
  - **Missing all acceptance criteria.**

### Ticket: Wire agent list to real API data
- **Status:** PARTIAL
- **Evidence:**
  - `frontend/app/agents/page.tsx` **does** use `trpc.agents.list.useQuery()` as the data source (line 18).
  - The tRPC `agents.list` procedure in `frontend/server/trpc/routers/agents.ts` queries ClickHouse for real trace data and enriches with Postgres metadata.
  - **Implemented:**
    - Real API data from `trpc.agents.list` (no mock data on list page).
    - Loading skeleton state (6 skeleton cards while loading).
    - Empty state with appropriate message.
  - **Missing:**
    - Health computation does **not** match wireframe thresholds. The tRPC router uses simple error-rate-only thresholds (`> 10%` failing, `> 5%` degraded), not the specified multi-factor thresholds (pass rate >= 90% AND error rate < 5% AND P50 < 2000ms for healthy, etc.).
    - No **"Stale"** status (no trace data within 24 hours) is computed.
    - No **error state** with retry button is rendered (only loading and empty states exist).
    - No **auto-refresh** (`refetchInterval: 30000`) is configured on the query.

---

## EPIC 2: Agents Detail Page Redesign

### Ticket: Add quick stats cards to agent detail header
- **Status:** PARTIAL
- **Evidence:**
  - `frontend/components/agents/agent-quick-stats.tsx` does **not exist** as a standalone component.
  - However, `frontend/components/agents/agent-header.tsx` **does** render a 4-column metrics row: Total Traces, Avg Score, Error Rate, P50 Latency (lines 63-85).
  - **Implemented:**
    - 4 stat areas with correct labels (Traces, Avg Score, Error Rate, P50 Latency).
    - Error rate has color coding (red when > 5%).
  - **Missing:**
    - Data is from **mock data** (`mockAgent` on line 41-51 of the detail page), not from `trpc.agents.get`.
    - **Color coding** does not match spec thresholds: Avg Score has no color coding (always `text-content-primary`), P50 Latency has no color coding, Error Rate uses only one threshold (> 5% = red) instead of three.
    - No loading skeleton for the stats.
    - Cards not styled with the specified `bg-surface-default rounded-lg border border-border-default p-4` pattern (they are inline within the header card).
    - Not responsive (2x2 on mobile, 4-column on desktop) -- always `grid-cols-4`.

### Ticket: Add agent context row to agent detail
- **Status:** NOT DONE
- **Evidence:**
  - `frontend/components/agents/agent-context-row.tsx` does **not exist**.
  - `frontend/app/agents/[id]/page.tsx` does not render any context row (environment badges, model name, team, editable tags, last seen).
  - The `AgentHeader` shows environment badges and health, but not model name, team, editable inline tags, or last seen relative timestamp.
  - **Missing all acceptance criteria.**

### Ticket: Build Overview tab -- Agent Info section
- **Status:** NOT DONE
- **Evidence:**
  - `frontend/components/agents/agent-info-section.tsx` does **not exist**.
  - `frontend/components/agents/agent-overview.tsx` does not contain a 2-column grid with Details card (Agent ID, Created, Description, SLA Targets, Associated Suites) or System Prompt Preview card.
  - The current Overview tab shows: a bar-chart mockup of score trend, hardcoded Active Issues, hardcoded Tool Usage bars, and hardcoded Recent Traces. All data is from `defaultIssues`, `defaultToolUsage`, and `defaultRecentTraces` constants (mock data).
  - **Missing all acceptance criteria.**

### Ticket: Build Overview tab -- Cost Breakdown
- **Status:** NOT DONE
- **Evidence:**
  - `frontend/components/agents/cost-breakdown.tsx` does **not exist**.
  - No `trpc.agents.getCostBreakdown` endpoint exists in `frontend/server/trpc/routers/agents.ts`.
  - No cost attribution card or cost trend chart is rendered in the Overview tab.
  - **Missing all acceptance criteria.**

### Ticket: Build Overview tab -- Health Trends charts
- **Status:** NOT DONE
- **Evidence:**
  - `frontend/components/agents/health-trends.tsx` does **not exist**.
  - No `trpc.agents.getHealthTrends` endpoint exists.
  - The overview tab has a simplistic bar chart mockup (generated with `Math.sin` and `Math.random()` on line 74) that is not a recharts `<LineChart>` with real data. No SLA target reference lines, no score/latency dual charts.
  - **Missing all acceptance criteria.**

### Ticket: Build Overview tab -- Recent Activity feed
- **Status:** NOT DONE
- **Evidence:**
  - `frontend/components/agents/agent-activity-feed.tsx` does **not exist**.
  - The overview tab has an "Active Issues" section and "Recent Traces" section, but these use **hardcoded mock data** (e.g., `defaultIssues`, `defaultRecentTraces` in `agent-overview.tsx`). They are not a proper activity feed with event-type icons (CheckCircle, XCircle, Rocket, AlertTriangle, Settings), are not chronological events from a real data source, and have no "View all activity" link.
  - **Missing all acceptance criteria.**

### Ticket: Enhance Skills tab -- add search/filter and Run Skill Eval
- **Status:** NOT DONE
- **Evidence:**
  - The Skills tab exists in `frontend/app/agents/[id]/page.tsx` (the `SkillsTab` function component, line 103).
  - It renders skill summary stats and a skill card grid using real data from `useSkillEvalSummaries()` and `useSkillRegressions()`.
  - **Missing:**
    - No search bar to filter skills by name.
    - No status filter dropdown (All, Passing, Failing, Not Tested).
    - No category filter dropdown.
    - No "Run Skill Eval" button that opens `StartEvalRunDialog` pre-configured for the agent.
  - **Missing all acceptance criteria specifically listed in this ticket.**

### Ticket: Enhance Tools tab -- add All Tools flat table
- **Status:** NOT DONE
- **Evidence:**
  - `frontend/components/agents/all-tools-table.tsx` does **not exist**.
  - The Tools tab (line 274 of the detail page) shows server cards with per-server tool tables, but there is **no aggregated flat table** of all tools across all servers below the server cards.
  - No "Export JSON" button exists.
  - No sortable column headers on a combined table.
  - **Missing all acceptance criteria.**

### Ticket: Build Tools tab -- Topology modal
- **Status:** NOT DONE
- **Evidence:**
  - `frontend/components/agents/topology-modal.tsx` does **not exist**.
  - No "View Topology" button exists on the Tools tab.
  - No graph visualization with Agent -> Server -> Tool hierarchy.
  - No `@xyflow/react` or D3 force layout is used anywhere in the agents components.
  - **Missing all acceptance criteria.**

### Ticket: Build Traces tab
- **Status:** NOT DONE
- **Evidence:**
  - `frontend/components/agents/agent-traces-tab.tsx` does **not exist**.
  - `frontend/components/agents/trace-quality-stats.tsx` does **not exist**.
  - `frontend/components/agents/agent-trace-list.tsx` does **not exist**.
  - The Traces tab in the detail page (line 478) renders a **placeholder** with a static message "Execution traces filtered for this agent" and a simple "View All Traces" link to `/traces` (not even filtered by agent_id in the URL). No filter bar, no quality summary stats, no trace list table, no pagination, no checkboxes, no Compare Selected button.
  - **Missing all acceptance criteria.**

### Ticket: Build Versions tab
- **Status:** PARTIAL
- **Evidence:**
  - The Versions tab in the detail page (line 465) renders a **placeholder** with a static message "Version history showing deployments, score changes, and configuration diffs across environments."
  - The tRPC endpoint `trpc.agents.getVersions` **does exist** in `frontend/server/trpc/routers/agents.ts` (line 145-213). It queries ClickHouse for distinct `agent_version` values and enriches with average scores.
  - **Implemented:**
    - Backend `getVersions` endpoint returning version name, first seen, last seen, trace count, avg score.
  - **Missing (frontend):**
    - `frontend/components/agents/versions-tab.tsx` does **not exist**.
    - `frontend/components/agents/deployment-card.tsx` does **not exist**.
    - `frontend/components/agents/version-comparison-chart.tsx` does **not exist**.
    - `frontend/components/agents/version-history-table.tsx` does **not exist**.
    - `frontend/components/agents/promote-dialog.tsx` does **not exist**.
    - No Current Deployments section with per-environment cards.
    - No Version Score Comparison bar chart.
    - No Version History table with inline editable labels.
    - No Promote/Rollback buttons with confirmation dialogs.
    - The tab is purely a placeholder with no functional UI.

### Ticket: Build Edit Metadata modal
- **Status:** NOT DONE
- **Evidence:**
  - `frontend/components/agents/register-agent-modal.tsx` exists but does **not** accept a `mode: 'create' | 'edit'` prop or an `agentData` prop for pre-population.
  - The `RegisterAgentModal` interface only has `{ open: boolean; onClose: () => void }`.
  - No "Edit" button exists in `frontend/components/agents/agent-header.tsx`.
  - No Agent ID read-only mode, no pre-population with current data, no dirty field tracking with diff indicators.
  - **Missing all acceptance criteria.**

---

## EPIC 3: Settings Page Completion

### Ticket: Sync settings tab state to URL
- **Status:** NOT DONE
- **Evidence:**
  - `frontend/app/settings/page.tsx` uses `useState<TabId>('project')` (line 27) for tab management.
  - There is **no** `useSearchParams` or `useRouter` import. No `?tab=` URL parameter is read or written.
  - Navigating to `/settings?tab=infrastructure` will **not** open on the Infrastructure tab; it will always default to Project.
  - Browser back/forward will not navigate between tabs.
  - **Missing all acceptance criteria.**

### Ticket: Build Evaluation Defaults card
- **Status:** NOT DONE
- **Evidence:**
  - `frontend/components/settings/project-settings.tsx` renders only the "Project Information" card (Project ID, Project Name, Environment). There is **no** "Evaluation Defaults" card below it.
  - No form fields for Default Model, Minimum Pass Score, Max P50 Latency, or Trace Retention Period exist.
  - No "Save Defaults" button, no dirty state tracking.
  - `frontend/app/api/settings/defaults/route.ts` does **not exist**.
  - `frontend/hooks/use-evaluation-defaults.ts` does **not exist**, and `frontend/hooks/use-settings.ts` has no `useEvaluationDefaults` hook.
  - **Missing all acceptance criteria.**

### Ticket: Verify API key validation flow
- **Status:** PARTIAL
- **Evidence:**
  - `frontend/components/api-key-settings.tsx` implements API key validation, but with deviations from the wireframe spec:
  - **Implemented:**
    - Basic format validation: checks `parts.length !== 3 || parts[0] !== 'ae'` (line 34). This is a loose check, not the spec's strict regex `^ae_(dev|staging|prod)_[a-zA-Z0-9]{32,}$`.
    - Functional validation: makes a test call to `api.getSuites()` (line 45).
    - Loading state during validation ("Validating..." button text, line 132).
    - Error state with error message display.
    - "Clear API key" link when authenticated (line 82-87).
    - **Storage uses `sessionStorage`** (confirmed in `frontend/lib/auth.tsx` lines 55, 85, 95). No `localStorage` usage for API keys.
  - **Missing/Deviating:**
    - Regex is **not** the wireframe-specified `^ae_(dev|staging|prod)_[a-zA-Z0-9]{32,}$`. The current check allows any 3-part underscore-separated string starting with "ae" (e.g., `ae_anything_x` would pass).
    - Format validation is triggered **on submit only**, not on blur as specified.
    - Success state does **not** show a masked key (e.g., `ae_prod_****...****abcd`). Instead it shows a generic "API key configured" message.
    - Error state does not show a **red border** on the input field (it shows the error text below, but the input border does not change to red).
  - **Verdict:** Core flow works (validate, store in sessionStorage, clear), but specific UX details deviate from the wireframe.

### Ticket: Verify infrastructure auto-refresh
- **Status:** PARTIAL
- **Evidence:**
  - `frontend/hooks/use-settings.ts` line 87: `refetchInterval: 30000` is correctly set on the `useInfrastructureHealth` query. Auto-refresh every 30 seconds is **confirmed**.
  - `frontend/components/settings/infrastructure.tsx`:
    - Refresh button exists (line 72-82) and calls `refetch()`.
    - Spinner animation: `animate-spin` is applied to `RefreshCw` icon when `isFetching` is true (line 79). **Confirmed.**
    - Button is disabled while fetching. **Confirmed.**
  - **Overall status badge logic:**
    - The badge renders `health.status` which can be `'healthy'`, `'degraded'`, or `'unhealthy'` (line 118-123).
    - Color mapping: healthy = green, degraded = yellow/amber, unhealthy = red. **This matches the spec.**
    - However, the badge styling uses `bg-green-100 text-green-800` (not `bg-emerald-500/10 text-emerald-500` as spec requires). Minor deviation.
  - **Individual service cards:**
    - Each service shows "Connected" (green) or "Disconnected" (red). **Confirmed.**
    - However, there is **no "Checking..." state** with yellow dot during fetch. The `ServiceStatus` component only has `connected: boolean`, no intermediate "checking" state.
  - **Missing:**
    - No "Checking..." intermediate state on individual service cards during refresh.
    - Badge color classes use `bg-green-100 text-green-800` pattern instead of specified `bg-emerald-500/10 text-emerald-500`.

---

## Summary

| # | Epic | Ticket | Status |
|---|------|--------|--------|
| 1 | Agents List | Add registry summary stat cards | NOT DONE |
| 2 | Agents List | Add tag filtering UI | NOT DONE |
| 3 | Agents List | Add table view toggle with bulk actions | NOT DONE |
| 4 | Agents List | Build Register Agent modal | PARTIAL |
| 5 | Agents List | Add sort dropdown | NOT DONE |
| 6 | Agents List | Wire agent list to real API data | PARTIAL |
| 7 | Agent Detail | Add quick stats cards to header | PARTIAL |
| 8 | Agent Detail | Add agent context row | NOT DONE |
| 9 | Agent Detail | Build Overview tab -- Agent Info section | NOT DONE |
| 10 | Agent Detail | Build Overview tab -- Cost Breakdown | NOT DONE |
| 11 | Agent Detail | Build Overview tab -- Health Trends charts | NOT DONE |
| 12 | Agent Detail | Build Overview tab -- Recent Activity feed | NOT DONE |
| 13 | Agent Detail | Enhance Skills tab -- search/filter + Run Skill Eval | NOT DONE |
| 14 | Agent Detail | Enhance Tools tab -- All Tools flat table | NOT DONE |
| 15 | Agent Detail | Build Tools tab -- Topology modal | NOT DONE |
| 16 | Agent Detail | Build Traces tab | NOT DONE |
| 17 | Agent Detail | Build Versions tab | PARTIAL |
| 18 | Agent Detail | Build Edit Metadata modal | NOT DONE |
| 19 | Settings | Sync settings tab state to URL | NOT DONE |
| 20 | Settings | Build Evaluation Defaults card | NOT DONE |
| 21 | Settings | Verify API key validation flow | PARTIAL |
| 22 | Settings | Verify infrastructure auto-refresh | PARTIAL |

**Totals:**
- **DONE:** 0 / 22 (0%)
- **PARTIAL:** 6 / 22 (27%)
- **NOT DONE:** 16 / 22 (73%)

### Key Observations

1. **Agent Detail page uses mock data.** The `[id]/page.tsx` file uses a hardcoded `mockAgent` object (line 41-51) and does not call `trpc.agents.get`. The Overview tab (`agent-overview.tsx`) uses hardcoded `defaultIssues`, `defaultToolUsage`, and `defaultRecentTraces`.

2. **Agent List page is the most complete area.** It uses real API data from `trpc.agents.list`, has a working filter bar (search + environment + status), loading skeletons, and empty state. But it lacks stat cards, tag filtering, table view, sort dropdown, and auto-refresh.

3. **Register Agent modal has core functionality** but is missing half the form sections (Connections, SLA Targets, Tags).

4. **Settings page is ~60% complete as described in the epic intro.** The 4 tabs render, infrastructure auto-refresh works, API key validation mostly works. Missing: URL-synced tabs and Evaluation Defaults card.

5. **No new component files from any ticket have been created.** All 21+ component files specified across the tickets (e.g., `agent-stat-cards.tsx`, `tag-filter.tsx`, `agent-table-view.tsx`, `cost-breakdown.tsx`, `health-trends.tsx`, `versions-tab.tsx`, `topology-modal.tsx`, etc.) do not exist.

6. **Backend endpoints are partially ahead of frontend.** The `trpc.agents.getVersions` endpoint exists and is functional, but the Versions tab UI is just a placeholder.
