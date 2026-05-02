# Prompts Management Redesign

- type: epic
- priority: 1
- labels: frontend, ux, redesign


Redesign the Prompts pages to match the wireframe specifications. Convert list from table to card layout, fix type values, add create dialog, inline editing, performance metrics, and production management.

**Wireframes:**
- `frontend/branding/wireframes/prompts/index.txt` (548 lines) — prompts list page
- `frontend/branding/wireframes/prompts/detail.txt` (701 lines) — prompt detail page

**Current state:** ~45% implemented with mock data. Uses table layout (wireframe specifies cards). Wrong type values (system/user/template/function instead of text/chat). Missing create dialog, inline edit mode, performance metrics section, production toggle, and experiments section.

**Key files:**
- `frontend/app/prompts/page.tsx` — prompts list page
- `frontend/app/prompts/[id]/page.tsx` — prompt detail page
- `frontend/server/trpc/routers/prompts.ts` — prompts tRPC router
- `frontend/components/feedback/` — existing feedback components (reference for patterns)

---
## Convert prompts list from table to card layout

- type: task
- priority: 1
- labels: frontend, ux, redesign
- estimate: 360

### Description


Replace the current table-based prompts list with a responsive card grid layout matching the wireframe specification.

**Wireframe:** `frontend/branding/wireframes/prompts/index.txt` — card grid section

**Requirements**

1. **Replace table with responsive card grid** in `frontend/app/prompts/page.tsx`:
   - Grid classes: `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4`
   - Each card is a clickable link to `/prompts/[id]`

2. **Card anatomy** (each card component):
   - **Header row**: prompt name (font-semibold, truncate), type badge ("text" or "chat")
   - **Production badge**: emerald badge if `is_production === true`, hidden otherwise
   - **Description**: `line-clamp-2`, `text-muted-foreground`, `text-sm`
   - **Attribution line**: version count (e.g. "v7"), author icon, relative timestamp (e.g. "2h ago")
   - **Metrics row**: average score, token estimate, variable count (extracted from `{{var}}` patterns)
   - **Tags**: rendered as small badges at card bottom

3. **Extract card to component** `frontend/components/prompts/prompt-card.tsx`:
   - Props: `PromptCardProps { prompt: Prompt }`
   - Hover state: `hover:border-border-hover` with subtle shadow transition

### Acceptance Criteria
- Prompts display as cards in a responsive grid (1/2/3 columns at breakpoints)
- Card shows all anatomy elements: name, type badge, production badge, description, attribution, metrics, tags
- Cards are clickable and navigate to prompt detail page
- Empty state renders when no prompts exist
- Layout matches wireframe proportions
---
## Fix prompt type values

- type: task
- priority: 1
- labels: frontend, api, redesign
- estimate: 60

### Description


Change prompt type values from the incorrect "system/user/template/function" to the correct "text/chat" values matching the API schema.

**Wireframe:** `frontend/branding/wireframes/prompts/index.txt` — type badges show "text" and "chat"

**Requirements**

1. **Update tRPC router** `frontend/server/trpc/routers/prompts.ts`:
   - Change type enum from `['system', 'user', 'template', 'function']` to `['text', 'chat']`
   - Update any mock data or seed data to use new values

2. **Update type badges** in prompt card and detail components:
   - "text" badge: default/neutral styling
   - "chat" badge: primary/blue styling
   - Remove old type values from any filter dropdowns or selectors

3. **Update filter options** if type filter exists:
   - Options should be: All, Text, Chat

### Acceptance Criteria
- All prompt type values are either "text" or "chat"
- Type badges render with correct labels and styling
- No references to old type values (system/user/template/function) remain in frontend code
- Filter dropdowns show only valid type options
---
## Add prompts summary stat cards

- type: task
- priority: 1
- labels: frontend, ux, redesign
- estimate: 180

### Description


Add 4 summary stat cards at the top of the prompts list page providing an overview of prompt management activity.

**Wireframe:** `frontend/branding/wireframes/prompts/index.txt` — stat cards row above card grid

**Requirements**

1. **4 stat cards** rendered in a `grid grid-cols-2 lg:grid-cols-4 gap-4` row above the prompt cards:
   - **Total Prompts**: count of all prompts
   - **In Production**: count of prompts with `is_production === true`
   - **Changes 7d**: count of new versions created in the last 7 days
   - **Auto-Optimized**: count of prompts with auto-optimization origin (created by training loop)

2. **Data source**: derive from `trpc.prompts.list` response or add a `trpc.prompts.stats` query if needed

3. **Component**: `frontend/components/prompts/prompt-stats.tsx`
   - Reuse existing stat card patterns from `frontend/components/dashboard/stat-cards.tsx`
   - Each card: icon, label, value, optional trend indicator

### Acceptance Criteria
- 4 stat cards visible above prompts grid
- Values derived from real data (or computed from prompt list)
- Cards show correct counts
- Responsive: 2 columns on mobile, 4 on desktop
---
## Add tag, status, and sort filters

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 180

### Description


Add filtering and sorting controls to the prompts list page for tag, production status, and sort order.

**Wireframe:** `frontend/branding/wireframes/prompts/index.txt` — filter bar between stat cards and card grid

**Requirements**

1. **Tag multi-select combobox**:
   - Populated from distinct tags across all prompts
   - Multi-select with checkboxes
   - Selected tags shown as removable chips
   - Filters prompts to those containing ANY selected tag

2. **Status dropdown**:
   - Options: All (default), Production, Draft
   - "Production" filters to `is_production === true`
   - "Draft" filters to `is_production === false`

3. **Sort dropdown**:
   - Options: Newest (default), Oldest, Name A-Z, Most Versions
   - Newest/Oldest sort by `updated_at`
   - Most Versions sort by version count descending

4. **URL-synced via shallow routing**:
   - `?tags=safety,rag&status=production&sort=newest`
   - Filters persist on page refresh
   - Use `useSearchParams` with `router.replace` (shallow)

5. **Filter bar component**: `frontend/components/prompts/prompt-filters.tsx`

### Acceptance Criteria
- All three filter controls render in a horizontal bar
- Selecting filters immediately updates the displayed prompt cards
- URL updates with filter state without full page reload
- Refreshing preserves filter selections
- "Clear all" resets all filters
---
## Add overflow menu on prompt cards

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 60

### Description


Add a 3-dot overflow menu to each prompt card with quick actions.

**Wireframe:** `frontend/branding/wireframes/prompts/index.txt` — overflow menu on cards

**Requirements**

1. **3-dot icon trigger** (`MoreVertical` or `EllipsisVertical` from lucide-react):
   - Positioned top-right of card
   - Click opens dropdown menu (stopPropagation to prevent card navigation)

2. **Menu items**:
   - **Duplicate**: creates a copy of the prompt with name "{name} (copy)"
   - **Set as Production**: sets `is_production: true` on the latest version (shows confirmation dialog)
   - **Delete**: deletes the prompt (disabled if currently production, tooltip explains why)

3. **Actions**:
   - Duplicate calls `trpc.prompts.create` with copied data
   - Set as Production calls `trpc.prompts.update` with `is_production: true`
   - Delete calls `trpc.prompts.delete` with confirmation dialog

### Acceptance Criteria
- 3-dot menu icon appears on hover or always visible on each card
- Clicking menu does not navigate to detail page
- Duplicate creates a new prompt card immediately
- Delete is disabled with tooltip when prompt is in production
- Set as Production shows confirmation before executing
---
## Build Create Prompt dialog

- type: task
- priority: 1
- labels: frontend, ux, redesign
- estimate: 360

### Description


Build a dialog for creating new prompts with name validation, type selection, content editor with variable highlighting, and tag management.

**Wireframe:** `frontend/branding/wireframes/prompts/index.txt` — Create Prompt dialog specification

**Requirements**

1. **Dialog trigger**: "Create Prompt" button in page header (primary button with Plus icon)

2. **Dialog fields**:
   - **Name** (required): text input, validated unique via debounced API check (`trpc.prompts.get` by name, 300ms debounce), shows inline error "Name already exists"
   - **Description**: textarea, optional, max 500 characters
   - **Type** radio group: "Text" (single prompt template) / "Chat" (message array)
   - **Content editor**:
     - For "text" type: textarea with `{{variable}}` syntax highlighting (amber background on variables)
     - For "chat" type: message array builder with role selector (system/user/assistant) per message, add/remove message buttons, each message has role dropdown + content textarea
   - **Tags**: combobox with autocomplete from existing tags, allows creating new tags

3. **Submit**: calls `trpc.prompts.create` with `{ name, description, type, content, tags }`
   - On success: close dialog, navigate to new prompt detail page
   - On error: show inline error message

4. **Component**: `frontend/components/prompts/create-prompt-dialog.tsx`

### Acceptance Criteria
- Dialog opens from "Create Prompt" button
- Name uniqueness validated in real-time with debounced API check
- Type radio switches between text editor and chat message builder
- Chat type shows message array builder with role selectors
- `{{variable}}` patterns highlighted in amber in content editor
- Tags autocomplete from existing tags
- Successful creation navigates to new prompt detail page
- Form validates required fields before submission
---
## Wire prompts list to real tRPC data

- type: task
- priority: 1
- labels: frontend, api, redesign
- estimate: 180

### Description


Replace mock/hardcoded data in the prompts list page with real data from the `trpc.prompts.list` query.

**Wireframe:** `frontend/branding/wireframes/prompts/index.txt` — data-driven card grid

**Requirements**

1. **Replace mock data** in `frontend/app/prompts/page.tsx`:
   - Use `trpc.prompts.list` query with filter parameters
   - Pass `{ tags, status, sort, offset, limit }` from URL search params
   - Handle loading state with skeleton cards
   - Handle error state with error boundary or inline error

2. **Ensure tRPC router** `frontend/server/trpc/routers/prompts.ts` supports:
   - `list` procedure with inputs: `{ tags?: string[], status?: 'all'|'production'|'draft', sort?: 'newest'|'oldest'|'name'|'versions', offset?: number, limit?: number }`
   - Returns: `{ prompts: Prompt[], total: number, hasMore: boolean }`

3. **Loading state**: show 6 skeleton cards matching card dimensions
4. **Empty state**: "No prompts found" with "Create your first prompt" CTA button

### Acceptance Criteria
- Prompts list populated from real API data
- No mock/hardcoded data remains in the prompts list page
- Loading skeleton renders while data is fetching
- Empty state displays when no prompts exist
- Filters from URL params are passed to API query
---
## Add Load More pagination

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 60

### Description


Add offset-based "Load More" pagination to the prompts list page.

**Wireframe:** `frontend/branding/wireframes/prompts/index.txt` — Load More button below card grid

**Requirements**

1. **Pagination strategy**: offset-based, 20 prompts per batch
   - Initial load: offset=0, limit=20
   - "Load More" appends next 20 to existing list
   - Button hidden when `hasMore === false`

2. **Load More button**:
   - Centered below the card grid
   - Shows "Load More" with count: "Load More (showing 20 of 47)"
   - Loading state: spinner icon, disabled during fetch
   - Uses `trpc.prompts.list` with incremented offset

3. **Implementation**: use React Query's `useInfiniteQuery` pattern or manual offset tracking

### Acceptance Criteria
- First page shows up to 20 prompt cards
- "Load More" button appears when more prompts exist
- Clicking loads next 20 and appends to grid
- Button disappears when all prompts are loaded
- Button shows loading state during fetch
---
## Build prompt detail performance section

- type: task
- priority: 1
- labels: frontend, ux, redesign
- estimate: 180

### Description


Build the performance metrics section on the prompt detail page showing evaluation results for prompts used in eval runs.

**Wireframe:** `frontend/branding/wireframes/prompts/detail.txt` — "Performance" section

**Requirements**

1. **3 stat cards** in a `grid grid-cols-3 gap-4` row:
   - **Avg Score**: average evaluation score across all eval runs using this prompt
   - **Avg Latency**: average response latency when this prompt is used
   - **Cost/Call**: average cost per invocation

2. **Data source**: join from eval runs that reference this prompt:
   - Query `eval_runs` metadata for prompt references (by prompt ID or name)
   - Aggregate scores, latency, and cost from matching runs
   - May require new tRPC procedure `trpc.prompts.getPerformance({ promptId })`

3. **Color thresholds** for score card:
   - Score >= 0.9: `text-emerald-500` (emerald)
   - Score >= 0.7: `text-amber-500` (amber)
   - Score < 0.7: `text-rose-500` (rose)

4. **Component**: `frontend/components/prompts/prompt-performance.tsx`
5. **Key file**: `frontend/app/prompts/[id]/page.tsx`

### Acceptance Criteria
- 3 performance stat cards render on prompt detail page
- Values derived from actual eval run data
- Score card uses correct color thresholds
- Empty state shows "No evaluation data" when prompt has not been used in eval runs
- Cards show formatted values (score as percentage, latency in ms, cost as currency)
---
## Build chat message UI for prompt detail

- type: task
- priority: 1
- labels: frontend, ux, redesign
- estimate: 360

### Description


For "chat" type prompts, render the content as a visual message list instead of raw JSON on the prompt detail page.

**Wireframe:** `frontend/branding/wireframes/prompts/detail.txt` — chat message display section

**Requirements**

1. **Conditional rendering** in `frontend/app/prompts/[id]/page.tsx`:
   - If prompt type is "text": render content as formatted text block (existing)
   - If prompt type is "chat": render content as message list (new)

2. **Message list component** `frontend/components/prompts/chat-messages.tsx`:
   - Parse content as JSON array of `{ role: string, content: string }` messages
   - Each message rendered in its own card/bubble
   - **Role badge per message**:
     - system: gray badge (`bg-muted text-muted-foreground`)
     - user: blue badge (`bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300`)
     - assistant: emerald badge (`bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300`)
   - Messages displayed in conversation order (array index order)

3. **Variable highlighting**:
   - `{{variable}}` patterns highlighted with amber background (`bg-amber-100 dark:bg-amber-900 px-1 rounded`)
   - Use regex to detect and wrap `{{...}}` patterns in styled spans

### Acceptance Criteria
- Chat type prompts display as a visual message list, not raw JSON
- Each message has correct role badge with role-specific colors
- Messages appear in conversation order
- `{{variable}}` patterns highlighted with amber background
- Text type prompts continue to render as plain text block
- Handles malformed JSON gracefully (falls back to raw text display)
---
## Build variables table on prompt detail

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 180

### Description


Build a table that extracts and displays all template variables (`{{variable}}` patterns) found in the prompt content.

**Wireframe:** `frontend/branding/wireframes/prompts/detail.txt` — "Variables" section

**Requirements**

1. **Variable extraction** utility `frontend/lib/extract-variables.ts`:
   - Regex scan prompt content for `{{variable_name}}` patterns
   - Deduplicate variable names
   - Return array of `{ name: string, type: 'string'|'number'|'json', required: boolean, default: string }`
   - Type inference: if variable name contains "count", "num", "total" → number; if contains "config", "options", "data" → json; else string
   - All detected variables marked as `required: true`
   - Default value: empty string (editable later)

2. **Variables table component** `frontend/components/prompts/variables-table.tsx`:
   - Columns: Name, Type (inferred), Required (badge), Default (empty)
   - Sorted alphabetically by name
   - For chat type prompts, scan all messages for variables

3. **Auto-updates**: when prompt content changes (in edit mode), variables table re-extracts

4. **Mount in** `frontend/app/prompts/[id]/page.tsx` below the content section

### Acceptance Criteria
- Variables table appears on prompt detail page
- All `{{variable}}` patterns extracted from content
- Variables deduplicated and sorted alphabetically
- Type inference applies reasonable heuristics
- Empty state: "No variables detected" when no `{{...}}` patterns found
- For chat type, variables extracted from all messages
---
## Build inline edit mode for prompt detail

- type: task
- priority: 1
- labels: frontend, ux, redesign
- estimate: 360

### Description


Add an inline edit mode to the prompt detail page that transforms content from read-only display to editable form, creating a new version on save (immutable history).

**Wireframe:** `frontend/branding/wireframes/prompts/detail.txt` — edit mode specification

**Requirements**

1. **Edit button** in header area:
   - Click transforms content section from read-only to editable
   - Button text changes to "Editing..." with cancel/save options

2. **Editable content**:
   - Text type: content textarea replaces read-only display
   - Chat type: message array becomes editable (add/remove/reorder messages)
   - `{{variable}}` highlighting maintained in edit mode

3. **Commit message field** (required for save):
   - Text input below content editor: "Describe your changes..."
   - Required — save button disabled until commit message entered
   - Creates a new version (immutable version history)

4. **Model config collapsible section**:
   - Collapsible/accordion section below content editor
   - Fields: model (dropdown), temperature (slider 0-2), max_tokens (number input), top_p (slider 0-1)
   - Default values from current version

5. **Actions**:
   - **Cancel**: discards all changes, returns to read-only mode
   - **Save**: calls `trpc.prompts.update` with `{ id, content, commitMessage, modelConfig }`, creates new version
   - On success: exit edit mode, show new version in version history

6. **Key file**: `frontend/app/prompts/[id]/page.tsx`

### Acceptance Criteria
- Edit button toggles between read-only and edit mode
- Content area becomes editable textarea (text) or message editor (chat)
- Commit message required before save is enabled
- Save creates a new version (version number increments)
- Cancel discards changes without creating a version
- Model config section is collapsible
- New version appears in version history after save
---
## Build version history overflow menu

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 180

### Description


Add a per-row overflow menu to the version history table on the prompt detail page with actions for viewing, comparing, promoting, and restoring versions.

**Wireframe:** `frontend/branding/wireframes/prompts/detail.txt` — version history table overflow menu

**Requirements**

1. **3-dot overflow menu** on each row of the version history table

2. **Menu items**:
   - **View Content**: opens a modal showing the full prompt content for that version (read-only)
   - **Compare to Current**: shows inline diff between selected version and current version (highlight additions in green, removals in red)
   - **Promote to Production**: sets this version as the production version (confirmation dialog)
   - **Restore**: creates a new version with the content from the selected old version (effectively a "revert" that preserves history)

3. **View Content modal**:
   - Full prompt content displayed in a dialog
   - For chat type, render as message list
   - Read-only, no editing

4. **Compare to Current**:
   - Inline diff view (side-by-side or unified)
   - Additions highlighted green, removals highlighted red
   - Can use a lightweight diff library or custom implementation

5. **Restore action**:
   - Creates new version (does not modify history)
   - New version commit message auto-set: "Restored from v{N}"

### Acceptance Criteria
- 3-dot menu appears on each version history row
- "View Content" opens modal with full version content
- "Compare to Current" shows visual diff
- "Promote to Production" changes production version with confirmation
- "Restore" creates a new version from old content
- All actions provide appropriate loading/success/error feedback
---
## Add production toggle switch

- type: task
- priority: 1
- labels: frontend, ux, redesign
- estimate: 60

### Description


Add a production toggle in the prompt detail header that controls which version is deployed as production.

**Wireframe:** `frontend/branding/wireframes/prompts/detail.txt` — production toggle in header area

**Requirements**

1. **Toggle switch** in the prompt detail header area:
   - Shows current production status (on/off)
   - Label: "Production" with version number (e.g. "Production: v5")

2. **Switching behavior**:
   - Toggling ON shows confirmation dialog: "Set v{current} as production?"
   - If another version is already production: "Set v7 as production? This will demote v5."
   - Toggling OFF shows confirmation: "Remove production status? No version will be in production."

3. **API call**: `trpc.prompts.update` with `{ id, is_production: true/false, version }`
   - Only one version per prompt name can be production at a time
   - Server enforces uniqueness

4. **Visual feedback**: production badge (emerald) updates immediately on success

### Acceptance Criteria
- Toggle visible in prompt detail header
- Confirmation dialog shown before changing production status
- Dialog text explains the demotion effect when another version is active
- Production badge updates immediately on success
- Only one version can be production at a time
---
## Build Used in Experiments section

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 180

### Description


Add a section on the prompt detail page showing experiments that reference this prompt, linking prompts to the experimentation system.

**Wireframe:** `frontend/branding/wireframes/prompts/detail.txt` — "Used in Experiments" section

**Requirements**

1. **Section placement**: below version history on prompt detail page

2. **Table columns**:
   - **Experiment name**: linked to experiment detail page (when available)
   - **Type**: badge showing "A/B" or "Rollout"
   - **Status**: badge showing Running/Completed/Cancelled
   - **Outcome**: badge showing Winner/Loser/Inconclusive (for completed experiments)

3. **Data source**: query experiments filtered by prompt ID
   - May require new tRPC procedure `trpc.experiments.listByPrompt({ promptId })`
   - If experiments feature not yet built, show empty state with explanation

4. **Component**: `frontend/components/prompts/used-in-experiments.tsx`

5. **Empty state**: "Not used in any experiments" with optional "Create Experiment" link

### Acceptance Criteria
- Experiments section renders below version history
- Table shows experiment name, type, status, and outcome
- Experiment names are clickable links
- Empty state renders when prompt has no associated experiments
- Badges use correct colors (Running=blue, Completed=emerald, Cancelled=muted)
---
## Add human vs auto-optimized distinction

- type: task
- priority: 2
- labels: frontend, ux, redesign
- estimate: 60

### Description


Add visual indicators to distinguish human-authored prompts from auto-optimized prompts (created by the training loop).

**Wireframe:** `frontend/branding/wireframes/prompts/detail.txt` — author attribution with sparkles icon

**Requirements**

1. **Icon indicators**:
   - **Auto-optimized** (created by training loop): `SparklesIcon` from lucide-react, accent color
   - **Human-authored**: `UserIcon` from lucide-react, muted color

2. **Display locations**:
   - **Prompt card** (list page): in the attribution line, before/beside the author name
   - **Version history** (detail page): in the author column of each version row

3. **Determination logic**:
   - Check prompt/version metadata for `source` or `created_by` field
   - If `source === 'auto-optimization'` or `created_by === 'training-loop'` → auto-optimized
   - Otherwise → human-authored

4. **Tooltip**: hovering the icon shows "Auto-optimized by training loop" or "Created by {author name}"

### Acceptance Criteria
- SparklesIcon displays for auto-optimized prompts
- UserIcon displays for human-authored prompts
- Icons appear on both card list and version history
- Tooltips provide context on hover
- Visual distinction is subtle but clear