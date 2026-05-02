# Global Shell & Navigation Enhancements

- type: epic
- priority: 1
- labels: frontend, ux, redesign


Enhance the global application shell — layout, sidebar, command palette, status bar — and add the missing keyboard shortcuts overlay. These changes affect every page and establish shared UX infrastructure.

**Wireframe references:**
- `frontend/branding/wireframes/global/layout.txt` (73 lines)
- `frontend/branding/wireframes/global/sidebar.txt` (89 lines)
- `frontend/branding/wireframes/global/command-palette.txt` (91 lines)
- `frontend/branding/wireframes/global/status-bar.txt` (66 lines)
- `frontend/branding/wireframes/global/keyboard-shortcuts.txt` (65 lines)

**Current state:** Sidebar, layout, command palette, and status bar all exist and largely match wireframes. Keyboard shortcuts overlay does not exist. Responsive sidebar is not implemented.

**Key files:**
- `frontend/app/layout.tsx`
- `frontend/components/sidebar.tsx`
- `frontend/components/command-palette.tsx`
- `frontend/components/status-bar.tsx`

---
## Create keyboard shortcuts overlay component

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 180

### Description


Create a new `frontend/components/keyboard-shortcuts.tsx` component — a full-screen modal overlay showing all available keyboard shortcuts.

**Wireframe:** `frontend/branding/wireframes/global/keyboard-shortcuts.txt`

**Requirements**

1. Modal overlay with backdrop blur, centered dialog (`max-w-xl`)
2. Triggered by pressing `?` key (when not inside an input/textarea)
3. Close via Escape key or backdrop click
4. Four shortcut sections laid out in a 2-column grid:
   - **NAVIGATION**: `g then c` → Command Center, `g then a` → Agents, `g then t` → Traces, `g then e` → Eval Runs, `g then s` → Suites, `g then x` → Experiments, `g then p` → Prompts, `g then r` → Training, `g then ,` → Settings
   - **GLOBAL**: `⌘K` → Command palette, `/` → Search, `?` → This overlay, `Escape` → Close overlay/modal
   - **ACTIONS**: `⌘E` → Start eval run, `⌘X` → Create experiment, `⌘D` → Compare runs, `r` → Refresh data
   - **TABLE/LIST**: `j/k` → Navigate rows, `Enter` → Open selected, `x` → Select/deselect row
5. Each shortcut key rendered as inline `<kbd>` element with `bg-surface-inset rounded px-1.5 py-0.5 text-xs font-mono` styling
6. Section headers in uppercase muted text

### Acceptance Criteria
- Pressing `?` outside any input opens the overlay
- All 4 sections render with correct shortcuts
- Escape or backdrop click closes
- No interaction with underlying page while open (focus trap)
---
## Register global keyboard shortcut listeners

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 360

### Description


Create a `useKeyboardShortcuts` hook (or integrate into existing layout) that registers global keyboard listeners for navigation and actions.

**Wireframe:** `frontend/branding/wireframes/global/keyboard-shortcuts.txt`

**Requirements**

1. **Two-key chord navigation** (`g then X` pattern):
   - Track `g` keypress, start 500ms timeout window
   - Within window, match second key to route: `c` → `/`, `a` → `/agents`, `t` → `/traces`, `e` → `/eval-runs`, `s` → `/suites`, `x` → `/experiments`, `p` → `/prompts`, `r` → `/training`, `,` → `/settings`
   - Use `next/navigation` `useRouter().push()` for navigation
2. **Action shortcuts**:
   - `⌘E` / `Ctrl+E` → Start eval run (open StartEvalRunDialog)
   - `⌘X` / `Ctrl+X` → Create experiment (navigate to /experiments with create flag)
   - `⌘D` / `Ctrl+D` → Compare runs (navigate to /compare)
   - `r` → Refresh current page data (emit custom event or call refetch)
3. **Guard**: All shortcuts must be ignored when focus is inside `<input>`, `<textarea>`, `<select>`, or `[contenteditable]` elements
4. Mount in `frontend/app/layout.tsx` or `frontend/app/providers.tsx`

### Acceptance Criteria
- `g` then `a` within 500ms navigates to `/agents`
- `⌘K` still opens command palette (no conflict)
- Typing in search inputs does not trigger navigation
- `r` refreshes visible data on current page
---
## Mount keyboard shortcuts overlay in root layout

- type: task
- priority: 2
- labels: frontend, redesign
- estimate: 30

### Description


Add `<KeyboardShortcutsOverlay />` to the root layout at `frontend/app/layout.tsx`, alongside existing `<CommandPalette />` and `<StatusBar />`.

**Wireframe:** `frontend/branding/wireframes/global/layout.txt`

**Requirements**
1. Import and mount `KeyboardShortcutsOverlay` component inside the `<Providers>` wrapper
2. Place at z-50 (same level as CommandPalette)
3. Component manages its own open/close state internally via `?` key listener

### Acceptance Criteria
- Overlay renders on every page when `?` is pressed
- No layout shift or z-index conflicts with command palette or status bar
---
## Add footer hints to command palette

- type: task
- priority: 3
- labels: frontend, ux, redesign
- estimate: 30

### Description


Add navigation hint footer to the existing command palette component.

**Wireframe:** `frontend/branding/wireframes/global/command-palette.txt`

**Requirements**
1. In `frontend/components/command-palette.tsx`, add a footer bar below the command list
2. Content: `↑↓ Navigate · ↵ Select · esc Close`
3. Styled: `text-xs text-content-tertiary border-t border-border-default px-4 py-2`
4. Statically rendered (no interaction needed)

### Acceptance Criteria
- Footer visible at bottom of command palette when open
- Does not interfere with keyboard navigation of items
---
## Wire command palette search to pre-fill target pages

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 120

### Description


When a user selects "Search traces...", "Search agents...", or "Search prompts..." in the command palette, navigate to that page with the search query pre-filled.

**Wireframe:** `frontend/branding/wireframes/global/command-palette.txt`

**Requirements**
1. In `frontend/components/command-palette.tsx`, update the SEARCH group items:
   - "Search traces..." → Navigate to `/traces?search={query}` where query is whatever the user typed in the palette search input
   - "Search agents..." → Navigate to `/agents?search={query}`
   - "Search prompts..." → Navigate to `/prompts?search={query}`
2. On the target pages (`traces/page.tsx`, `agents/page.tsx`, `prompts/page.tsx`), read `searchParams.search` and initialize the search input with that value
3. If the palette search input is empty when a search item is selected, just navigate to the page and focus the search input

### Acceptance Criteria
- Type "booking" in command palette → select "Search traces..." → lands on `/traces?search=booking` with filtered results
- Empty search → select "Search agents..." → lands on `/agents` with search input focused
---
## Implement responsive sidebar collapse

- type: task
- priority: 3
- labels: frontend, ux, redesign
- estimate: 180

### Description


Make the sidebar responsive — collapsed at medium viewports, hidden at small viewports.

**Wireframe:** `frontend/branding/wireframes/global/layout.txt`, `frontend/branding/wireframes/global/sidebar.txt`

**Requirements**
1. In `frontend/components/sidebar.tsx`:
   - **≥1280px**: Full sidebar (`w-64`) — current behavior
   - **1024-1279px**: Collapsed sidebar (`w-16`) — show only icons, hide text labels, hide group headers. Tooltip on hover showing label text.
   - **<1024px**: Sidebar hidden. Hamburger button in top-left of main content area. Click opens sidebar as overlay with backdrop.
2. Use `useMediaQuery` hook or Tailwind responsive classes
3. Persist user's manual collapse preference in `localStorage` (if user explicitly collapses on desktop, respect that)
4. Animate collapse transition (width transition 200ms ease)

### Acceptance Criteria
- Resizing browser to 1100px shows icon-only sidebar
- Resizing to 900px hides sidebar entirely, shows hamburger
- Navigation still works in all modes
---
## Add experiments and training data to status bar

- type: task
- priority: 3
- labels: frontend, ux, redesign
- estimate: 180

### Description


The status bar currently only shows running eval runs. Extend it to also show running experiments and active training loops.

**Wireframe:** `frontend/branding/wireframes/global/status-bar.txt`

**Requirements**
1. In `frontend/components/status-bar.tsx`:
   - Add query for running experiments (A/B tests and progressive rollouts) — poll every 15s
   - Add query for active training loops — poll every 30s
   - Merge all running work items into the existing display list
2. Each item type gets a distinct icon:
   - Eval runs: `Play` icon (existing)
   - Experiments: `FlaskConical` icon
   - Training loops: `Sparkles` icon
3. Collapsed view shows total count across all types
4. Expanded view groups by type

**Depends on:** Experiments and Training pages must exist (data sources). Can use mock data initially and wire up later.

### Acceptance Criteria
- Status bar shows "3 running" when 1 eval + 1 experiment + 1 training loop are active
- Expanding shows all 3 with correct icons and progress
- Each item links to its detail page