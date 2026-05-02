# Neon UI Rework Sprint Plan

## Strategy
Page-by-page parallel execution. 6 agent streams, each owning one page area. No file conflicts — each agent stays within its page's directory and components.

## Shared Conventions
- **Design tokens**: See `frontend/branding/wireframes/README.md` and `frontend/branding/colors.md`
- **Color thresholds**: emerald >= 90%, amber >= 70%, rose < 70% (used everywhere)
- **URL sync**: All filters use `useSearchParams` + `router.replace` (shallow)
- **Stat cards**: Reuse patterns from `frontend/components/dashboard/stat-cards.tsx`
- **Loading states**: Skeleton components, never spinners in cards
- **No mock data**: All data wired to tRPC queries
- **Dark mode**: All colors must work in both themes
- **Performance**: React.memo where appropriate, virtualize long lists, lazy load charts

## Stream 1: Prompts (13 tickets)
**Agent**: prompts-agent
**Epic**: `.beads/batch-epic-prompts.md`
**Wireframes**: `frontend/branding/wireframes/prompts/index.txt`, `detail.txt`
**Key files**: `frontend/app/prompts/`, `frontend/components/prompts/`, `frontend/server/trpc/routers/prompts.ts`

### Execution Order
1. `neon-6c7u` Fix prompt type values (text/chat)
2. `neon-x950` Convert prompts list from table to card layout
3. `neon-ildz` Wire prompts list to real tRPC data
4. `neon-giyh` Add prompts summary stat cards
5. `neon-o7lm` Add tag, status, and sort filters
6. `neon-1djh` Add overflow menu on prompt cards
7. `neon-qpqh` Build Create Prompt dialog
8. `neon-mxi2` Build chat message UI for prompt detail
9. `neon-lgpe` Build variables table on prompt detail
10. `neon-i81v` Build inline edit mode for prompt detail
11. `neon-30cq` Add production toggle switch
12. `neon-fsie` Build prompt detail performance section
13. `neon-t2iq` Build Used in Experiments section

## Stream 2: Traces (18 tickets)
**Agent**: traces-agent
**Epic**: `.beads/batch-epic-traces.md`
**Wireframes**: `frontend/branding/wireframes/traces/index.txt`, `detail.txt`, `debug.txt`, `diff.txt`
**Key files**: `frontend/app/traces/`, `frontend/components/traces/`

### Execution Order
1. `neon-55oe` Add cost column to trace table
2. `neon-ij4o` Add trace summary stat cards
3. `neon-dqs3` Add advanced filter dropdowns
4. `neon-vzb6` Add loop and multi-agent badges
5. `neon-t8y5` Add multi-select checkboxes and bulk action bar
6. `neon-i0cj` Build Create Test Cases modal
7. `neon-l9vj` Add cost stat card (detail page)
8. `neon-d32m` Build Agent Graph view
9. `neon-25tq` Build Related Traces section
10. `neon-dlaf` Add Create Test Case button and modal (detail)
11. `neon-txi2` Add deep link support for ?span=[spanId] (detail)
12. `neon-4ig6` Add RCA Analysis button and overlay
13. `neon-ke4y` Add Export dropdown to debugger
14. `neon-rozd` Add span tree search filter
15. `neon-qv12` Add deep link ?span=[spanId] to debugger
16. `neon-2bhx` Add swap A-B button to trace diff
17. `neon-qg1k` Verify diff stats color coding
18. `neon-er62` Add drill-down links to traces (compare)

## Stream 3: Eval Runs + Suites (26 tickets)
**Agent**: evals-agent
**Epic**: `.beads/batch-epic-eval-suites.md`
**Wireframes**: `frontend/branding/wireframes/eval-runs/index.txt`, `detail.txt`, `suites/index.txt`, `detail.txt`
**Key files**: `frontend/app/eval-runs/`, `frontend/app/suites/`, `frontend/components/eval-runs/`

### Execution Order (Eval Runs first, then Suites)
#### Eval Runs List
1. `neon-rxgs` Add score, suite, and agent columns to eval runs table
2. `neon-r5n8` Add search and advanced filters to eval runs list
3. `neon-hfp1` Add summary stats strip to eval runs list
4. `neon-3xi8` Add bulk selection and compare flow
5. `neon-oucm` Redesign Start Eval Run dialog as suite-first flow
#### Eval Run Detail
6. `neon-acoo` Add results summary stat cards
7. `neon-0h12` Build scorer breakdown section
8. `neon-xbms` Add test case filter tabs
9. `neon-vz5m` Add scorer grouping to results
10. `neon-b121` Add Rerun and Compare buttons
11. `neon-f6od` Hide Temporal internals
12. `neon-zt2t` Build progress hero card for running state
13. `neon-ehh5` Add CSV export
#### Suites List
14. `neon-19rl` Fix New Suite button destination
15. `neon-orb5` Add summary stats strip to suites list
16. `neon-fsrr` Add search and filter dropdowns to suites list
17. `neon-oa3k` Add last run stats to suite cards
18. `neon-mqtm` Add Run Suite button to suite cards
19. `neon-d7lt` Add agent name and scorer badges to suite cards
#### Suite Detail
20. `neon-od6k` Build suite detail action buttons
21. `neon-iere` Add summary stat cards to suite detail
22. `neon-n78f` Build expandable test case cards
23. `neon-r211` Build score trend chart on suite detail
24. `neon-7qso` Build run history table on suite detail
25. `neon-kxw1` Add "Add Case" button and inline form
26. `neon-8886` Build Evaluation Defaults card

## Stream 4: Experiments (12 tickets)
**Agent**: experiments-agent
**Epic**: `.beads/batch-epic-compare-experiments.md`
**Wireframes**: `frontend/branding/wireframes/experiments/index.txt`, `detail.txt`, `compare/index.txt`
**Key files**: `frontend/app/experiments/`, `frontend/app/compare/`, `frontend/components/experiments/`, `frontend/components/compare/`

### Execution Order (Experiments pages, then Compare enhancements)
#### Experiments List
1. `neon-fi4h` Wire experiments to real Temporal workflows (tRPC router)
2. `neon-q9zr` Add experiments summary stat cards
3. `neon-24fl` Add type, agent, and sort filters
4. `neon-x9e4` Differentiate A/B test vs rollout card layouts
5. `neon-7ka7` Add live polling for running experiments
6. `neon-4ppb` Build Create Experiment dialog
7. `neon-wv8o` Add overflow menu on experiment cards
8. `neon-ia7v` Add Load More pagination
#### Experiment Detail
9. `neon-jte8` Build experiment detail page — A/B Test layout
10. `neon-tolk` Build experiment detail page — Progressive Rollout layout
11. `neon-pl1y` Add experiment detail action buttons
12. `neon-szha` Add experiment detail export

#### Compare Page Enhancements
13. Auto-fire comparison on run selection
14. `neon-ih1u` Add agent filter to compare page (from agents issues)
15. `neon-5hk8` Build dumbbell/score delta chart
16. `neon-vz5m` Add scorer grouping to results (shared with evals)
17. `neon-er62` Add drill-down links to traces
18. `neon-oe4w` Add export functionality
19. Statistical guidance dismissable

## Stream 5: Training (20 tickets)
**Agent**: training-agent
**Epic**: `.beads/batch-epic-training.md`
**Wireframes**: `frontend/branding/wireframes/training/index.txt`, `datasets.txt`, `export.txt`, `auto-improve.txt`
**Key files**: `frontend/app/training/` (new), `frontend/components/training/` (new)

### Execution Order
#### Page Shell
1. `neon-v3ag` Build Training page shell and tab structure
#### Feedback Tab
2. `neon-u7wj` Build Feedback tab — Preferences mode
3. `neon-7120` Build Feedback tab — Corrections mode
4. `neon-0e7f` Build Feedback tab — History mode
#### Datasets Tab
5. `neon-7e79` Build datasets tRPC router
6. `neon-0aay` Build Datasets tab — card list
7. `neon-qat8` Build Datasets tab — Create Dataset wizard
8. `neon-nr6g` Build Datasets tab — detail panel
#### Export Tab
9. `neon-uh0a` Build export API endpoint
10. `neon-2i0d` Build Export tab — 3-step flow
11. `neon-yuxe` Build Export tab — Custom JSON template
12. `neon-c3nf` Build Export tab — export history
#### Auto-Improve Tab
13. `neon-klbi` Build Auto-Improve tab — pipeline visualization
14. `neon-rpve` Build Auto-Improve tab — approval banner
15. `neon-zhjv` Build Auto-Improve tab — stage detail accordion
16. `neon-6s2g` Build Auto-Improve tab — Configure New Loop dialog
17. `neon-jvh1` Build Auto-Improve tab — iteration history
18. `neon-qrr2` Wire Auto-Improve to Temporal workflows
19. `neon-felz` Migrate feedback storage from in-memory to ClickHouse
20. `neon-q28k` Build datasets tRPC router (dedup with neon-7e79)

## Stream 6: Global/Chrome (6 tickets)
**Agent**: global-agent
**Epic**: `.beads/batch-epic-global.md`
**Wireframes**: `frontend/branding/wireframes/global/keyboard-shortcuts.txt`, `command-palette.txt`, `status-bar.txt`, `layout.txt`, `sidebar.txt`
**Key files**: `frontend/app/layout.tsx`, `frontend/components/command-palette.tsx`, `frontend/components/status-bar.tsx`, `frontend/components/sidebar.tsx`

### Execution Order
1. `neon-35f1` Create keyboard shortcuts overlay component
2. `neon-x9wj` Register global keyboard shortcut listeners
3. `neon-qwn8` Mount keyboard shortcuts overlay in root layout
4. `neon-ho8g` Add footer hints to command palette
5. `neon-iew9` Wire command palette search to pre-fill target pages
6. `neon-ghnb` Add environment selector to Command Center

## Quality Gates
- No `any` types
- No mock data — all queries wired to tRPC
- Dark mode tested
- Responsive (mobile-first where wireframe specifies)
- Loading skeletons for all async data
- Error boundaries around each page section
- URL-synced filters everywhere
- Accessible (keyboard nav, aria labels, focus management)
