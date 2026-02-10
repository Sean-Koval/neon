# Neon UI Wireframes

Detailed ASCII wireframes for every page and global component in the Neon redesign.
These serve as the single source of truth for layout, hierarchy, and content placement.

## Directory Structure

Mirrors the Next.js App Router structure:

```
wireframes/
  README.md                          # This file
  global/
    sidebar.txt                      # Grouped nav: Monitor / Evaluate / Improve
    command-palette.txt              # Cmd+K overlay
    status-bar.txt                   # Floating running-work indicator
    keyboard-shortcuts.txt           # Shortcut reference overlay
    layout.txt                       # Root layout (sidebar + main + overlays)
  command-center/
    index.txt                        # / — Live agent health, alerts, AI insights
  agents/
    index.txt                        # /agents — Agent registry list
    detail.txt                       # /agents/[id] — Agent detail (Overview tab)
    detail-skills.txt                # /agents/[id]?tab=skills
    detail-tools.txt                 # /agents/[id]?tab=tools
    detail-versions.txt              # /agents/[id]?tab=versions
    detail-traces.txt                # /agents/[id]?tab=traces
  traces/
    index.txt                        # /traces — Trace list + search
    detail.txt                       # /traces/[id] — Trace detail + views
    debug.txt                        # /traces/[id]/debug — Interactive debugger
    diff.txt                         # /traces/diff — Side-by-side comparison
  suites/
    index.txt                        # /suites — Suite list
    detail.txt                       # /suites/[id] — Suite detail
  eval-runs/
    index.txt                        # /eval-runs — Run list (absorbs Workflows)
    detail.txt                       # /eval-runs/[id] — Run detail + results
  compare/
    index.txt                        # /compare — Statistical comparison
  experiments/
    index.txt                        # /experiments — A/B tests + rollouts
    detail.txt                       # /experiments/[id] — Experiment detail
  prompts/
    index.txt                        # /prompts — Prompt management
    detail.txt                       # /prompts/[id] — Prompt detail + diffs
  training/
    index.txt                        # /training — Feedback + Datasets + Export + Auto-Improve
  settings/
    index.txt                        # /settings — Project, API keys, infra
```

## Design Tokens Reference

See `../colors.md` and `../theme.ts` for the full token spec.

### Quick Reference
- **Primary**: Cyan `#06b6d4` — interactive elements, links, CTAs
- **Accent**: Violet `#a855f7` — gradients, highlights, secondary
- **Healthy**: Emerald `#10b981` — status dots, pass badges
- **Warning**: Amber `#f59e0b` — degraded, caution
- **Error**: Rose `#f43f5e` — failing, regression
- **Surface**: dark-950 (base) / dark-900 (raised) / dark-800 (card)
- **Border**: dark-700 (default) / dark-800 (subtle)
- **Text**: dark-50 (primary) / dark-400 (secondary) / dark-500 (muted)

## Navigation Groups

| Group     | Pages                        | Color Accent |
|-----------|------------------------------|--------------|
| MONITOR   | Command Center, Agents, Traces | Cyan        |
| EVALUATE  | Suites, Eval Runs, Compare    | Violet       |
| IMPROVE   | Experiments, Prompts, Training | Emerald     |
| ---       | Settings                      | Gray         |

## Conventions Used in Wireframes

```
[ Button ]           — Clickable button
[+ Action]           — Primary action button
[icon]               — Icon-only button
[▾]                  — Dropdown trigger
( ) Radio             — Radio button
[x] Checkbox          — Checkbox
|input............|  — Text input field
|select ▾|           — Select dropdown
[====>       ] 45%   — Progress bar
--- divider ---      — Horizontal rule / section divider
>> link              — Navigational link
Tab | Tab* | Tab     — Tab bar (* = active)
{  } Card            — Card container
///                  — Skeleton / loading placeholder
<<< >>>              — Horizontal scroll
```
