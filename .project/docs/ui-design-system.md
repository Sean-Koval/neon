# Neon UI Design System

**Version:** 1.0
**Companion to:** frontend-design-spec.md
**Focus:** Visual polish, interactions, and component states

---

## 1. Design Tokens

### 1.1 Extended Color Palette

```css
/* Primary Brand */
--primary-50:  #eff6ff;
--primary-100: #dbeafe;
--primary-200: #bfdbfe;
--primary-500: #3b82f6;
--primary-600: #2563eb;
--primary-700: #1d4ed8;

/* Neutral (Gray) */
--gray-50:  #f9fafb;
--gray-100: #f3f4f6;
--gray-200: #e5e7eb;
--gray-300: #d1d5db;
--gray-400: #9ca3af;
--gray-500: #6b7280;
--gray-600: #4b5563;
--gray-700: #374151;
--gray-800: #1f2937;
--gray-900: #111827;

/* Semantic Status */
--success-50:  #f0fdf4;
--success-100: #dcfce7;
--success-500: #22c55e;
--success-600: #16a34a;
--success-700: #15803d;

--warning-50:  #fffbeb;
--warning-100: #fef3c7;
--warning-500: #eab308;
--warning-600: #ca8a04;

--error-50:  #fef2f2;
--error-100: #fee2e2;
--error-500: #ef4444;
--error-600: #dc2626;
--error-700: #b91c1c;

/* Background Layers (Light Mode) */
--bg-base:    #f9fafb;   /* Page background */
--bg-surface: #ffffff;   /* Cards, modals */
--bg-raised:  #ffffff;   /* Elevated elements */
--bg-overlay: rgba(0,0,0,0.5);  /* Modal backdrop */
```

### 1.2 Elevation System

Use shadows to create depth hierarchy. Higher elevation = more prominence.

```css
/* Elevation Levels */
--shadow-xs:  0 1px 2px rgba(0,0,0,0.05);
--shadow-sm:  0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06);
--shadow-md:  0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
--shadow-lg:  0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
--shadow-xl:  0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);

/* Usage */
Level 0: No shadow (flat)           → Table rows, inline elements
Level 1: shadow-xs                  → Subtle cards, input fields
Level 2: shadow-sm                  → Default cards, dropdowns
Level 3: shadow-md                  → Raised cards on hover, popovers
Level 4: shadow-lg                  → Modals, dialogs
Level 5: shadow-xl                  → Critical alerts, regression banner
```

### 1.3 Border Radius Scale

```css
--radius-none: 0;
--radius-sm:   4px;    /* Badges, small pills */
--radius-md:   6px;    /* Buttons, inputs */
--radius-lg:   8px;    /* Cards */
--radius-xl:   12px;   /* Large cards, modals */
--radius-full: 9999px; /* Pills, avatars */
```

### 1.4 Animation Timing

```css
/* Durations */
--duration-instant:  75ms;   /* Hover state changes */
--duration-fast:     150ms;  /* Button interactions */
--duration-normal:   200ms;  /* Standard transitions */
--duration-slow:     300ms;  /* Modal enter/exit */
--duration-slower:   500ms;  /* Page transitions */

/* Easing */
--ease-out:    cubic-bezier(0, 0, 0.2, 1);     /* Entering elements */
--ease-in:     cubic-bezier(0.4, 0, 1, 1);     /* Exiting elements */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);   /* Moving elements */
--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1); /* Playful emphasis */
```

---

## 2. Component States

### 2.1 Button States

```
┌─────────────────────────────────────────────────────────────────┐
│ PRIMARY BUTTON                                                   │
├─────────────┬───────────────────────────────────────────────────┤
│ Default     │ bg: primary-600, text: white                      │
│             │ shadow: sm, border-radius: md                     │
├─────────────┼───────────────────────────────────────────────────┤
│ Hover       │ bg: primary-700                                   │
│             │ shadow: md (lift effect)                          │
│             │ transform: translateY(-1px)                       │
│             │ transition: duration-fast ease-out                │
├─────────────┼───────────────────────────────────────────────────┤
│ Active      │ bg: primary-800                                   │
│             │ shadow: xs (pressed)                              │
│             │ transform: translateY(0)                          │
├─────────────┼───────────────────────────────────────────────────┤
│ Focus       │ ring: 2px primary-500 with 2px offset             │
│             │ (outline-offset: 2px)                             │
├─────────────┼───────────────────────────────────────────────────┤
│ Disabled    │ bg: gray-300, text: gray-500                      │
│             │ cursor: not-allowed, opacity: 0.6                 │
├─────────────┼───────────────────────────────────────────────────┤
│ Loading     │ bg: primary-600 (dimmed)                          │
│             │ Show spinner (16px) left of text                  │
│             │ Text: "Loading..." or original with spinner       │
│             │ pointer-events: none                              │
└─────────────┴───────────────────────────────────────────────────┘

BUTTON VARIANTS:
- Primary:   Blue bg, white text (main CTAs)
- Secondary: White bg, gray-700 text, gray-200 border
- Ghost:     Transparent bg, gray-600 text (inline actions)
- Danger:    Red bg, white text (destructive actions)
- Success:   Green bg, white text (confirm positive action)
```

### 2.2 Input Field States

```
┌─────────────────────────────────────────────────────────────────┐
│ TEXT INPUT                                                       │
├─────────────┬───────────────────────────────────────────────────┤
│ Default     │ bg: white, border: 1px gray-300                   │
│             │ text: gray-900, placeholder: gray-400             │
│             │ padding: 8px 12px, border-radius: md              │
├─────────────┼───────────────────────────────────────────────────┤
│ Hover       │ border: gray-400                                  │
│             │ transition: duration-instant                      │
├─────────────┼───────────────────────────────────────────────────┤
│ Focus       │ border: primary-500                               │
│             │ ring: 3px primary-100                             │
│             │ (box-shadow for soft glow effect)                 │
├─────────────┼───────────────────────────────────────────────────┤
│ Filled      │ Same as default, but with value                   │
│             │ Label floats above (if using float labels)        │
├─────────────┼───────────────────────────────────────────────────┤
│ Error       │ border: error-500                                 │
│             │ ring: 3px error-100                               │
│             │ Error icon (!) right side                         │
│             │ Error message below in error-600 text             │
├─────────────┼───────────────────────────────────────────────────┤
│ Disabled    │ bg: gray-50, border: gray-200                     │
│             │ text: gray-400, cursor: not-allowed               │
└─────────────┴───────────────────────────────────────────────────┘

VALIDATION FEEDBACK:
- Show error state only after blur (not while typing)
- Use inline error messages, not tooltips
- Error message format: "Field name is required" or "Must be between 0 and 1"
- Success checkmark for valid fields (optional, don't overuse)
```

### 2.3 Card States

```
┌─────────────────────────────────────────────────────────────────┐
│ INTERACTIVE CARD (e.g., Suite Card, Run Row)                     │
├─────────────┬───────────────────────────────────────────────────┤
│ Default     │ bg: white, border: 1px gray-200                   │
│             │ shadow: xs, border-radius: lg                     │
├─────────────┼───────────────────────────────────────────────────┤
│ Hover       │ shadow: sm                                        │
│             │ border: gray-300                                  │
│             │ transform: translateY(-2px)                       │
│             │ transition: duration-fast ease-out                │
│             │ cursor: pointer                                   │
├─────────────┼───────────────────────────────────────────────────┤
│ Active      │ shadow: xs                                        │
│             │ transform: translateY(0)                          │
│             │ bg: gray-50                                       │
├─────────────┼───────────────────────────────────────────────────┤
│ Selected    │ border: 2px primary-500                           │
│             │ bg: primary-50                                    │
└─────────────┴───────────────────────────────────────────────────┘

STATIC CARD (e.g., Stat Card):
- No hover lift effect
- Subtle shadow-xs
- Can have colored left border for categorization
```

### 2.4 Table Row States

```
┌─────────────────────────────────────────────────────────────────┐
│ TABLE ROW                                                        │
├─────────────┬───────────────────────────────────────────────────┤
│ Default     │ bg: white (odd) or gray-50 (even for striping)    │
│             │ border-bottom: 1px gray-100                       │
├─────────────┼───────────────────────────────────────────────────┤
│ Hover       │ bg: gray-50 (subtle highlight)                    │
│             │ Show action buttons if hidden by default          │
├─────────────┼───────────────────────────────────────────────────┤
│ Selected    │ bg: primary-50                                    │
│             │ border-left: 3px primary-500                      │
├─────────────┼───────────────────────────────────────────────────┤
│ Expanded    │ Child rows indented with bg: gray-50              │
│             │ Animated expand: height 0 → auto, duration-normal │
│             │ Chevron rotates 180°                              │
├─────────────┼───────────────────────────────────────────────────┤
│ Failed Row  │ bg: error-50 (very subtle red tint)               │
│             │ border-left: 3px error-500                        │
└─────────────┴───────────────────────────────────────────────────┘
```

---

## 3. Micro-Interactions

### 3.1 Hover Effects

```css
/* Subtle lift for clickable cards */
.card-interactive:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
  transition: all var(--duration-fast) var(--ease-out);
}

/* Link underline animation */
.link:hover {
  text-decoration-color: currentColor;
  /* Underline slides in from left */
}

/* Icon button pulse on hover */
.icon-btn:hover svg {
  transform: scale(1.1);
  transition: transform var(--duration-fast) var(--ease-bounce);
}
```

### 3.2 Click/Press Feedback

```css
/* Button press */
.btn:active {
  transform: translateY(1px) scale(0.98);
  transition: transform var(--duration-instant);
}

/* Ripple effect (optional, Material-style) */
/* Use sparingly - only for primary actions */
```

### 3.3 Loading States

```css
/* Skeleton pulse */
@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.skeleton {
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  background: linear-gradient(90deg, var(--gray-200) 0%, var(--gray-100) 50%, var(--gray-200) 100%);
  background-size: 200% 100%;
}

/* Spinner */
@keyframes spin {
  to { transform: rotate(360deg); }
}
.spinner {
  animation: spin 0.8s linear infinite;
  border: 2px solid var(--gray-200);
  border-top-color: var(--primary-600);
  border-radius: 50%;
}

/* Button loading - inline spinner + dimmed text */
.btn-loading {
  position: relative;
  color: transparent;
}
.btn-loading::after {
  content: '';
  position: absolute;
  /* spinner styles */
}
```

### 3.4 Expandable Row Animation

```css
/* Smooth expand/collapse */
.expandable-content {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--duration-normal) var(--ease-out);
}
.expandable-content.open {
  grid-template-rows: 1fr;
}
.expandable-content > div {
  overflow: hidden;
}

/* Chevron rotation */
.expand-icon {
  transition: transform var(--duration-fast) var(--ease-out);
}
.expanded .expand-icon {
  transform: rotate(180deg);
}
```

### 3.5 Toast/Notification Animation

```css
/* Slide in from top-right */
@keyframes toast-in {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* Auto-dismiss progress bar */
.toast-progress {
  height: 3px;
  background: var(--primary-500);
  animation: shrink 5s linear forwards;
}
@keyframes shrink {
  from { width: 100%; }
  to { width: 0%; }
}
```

---

## 4. The Compare Page - Hero Feature Visual Design

The comparison view is Neon's **core value proposition**. It deserves special visual treatment.

### 4.1 Result Reveal Animation

When user clicks "Compare":

```
1. Button enters loading state (spinner)
2. Results fade in with stagger (0.5s total)
3. If REGRESSION:
   - Red banner slides down with bounce
   - Shake animation (subtle, 2 cycles)
   - Sound: optional error chime
4. If PASS:
   - Green banner slides down
   - Confetti burst (subtle, 20 particles)
   - Sound: optional success chime
```

### 4.2 Regression Banner (CRITICAL STATE)

```
╔═══════════════════════════════════════════════════════════════════╗
║  ⚠️  REGRESSION DETECTED                                          ║
║                                                                   ║
║     Overall Score: 0.85 → 0.79                                    ║
║     Delta: -0.06 (exceeds threshold of 0.05)                      ║
║                                                                   ║
║     2 regressions found across 10 cases                           ║
╚═══════════════════════════════════════════════════════════════════╝

STYLING:
- Background: error-100 with error-500 left border (4px)
- Shadow: xl (maximum elevation - this is important!)
- Border-radius: lg
- Icon: Large warning triangle, animated pulse
- Text:
  - "REGRESSION DETECTED" in error-700, font-weight: 700, 20px
  - Details in gray-700, 14px
- Entrance: slideDown with slight bounce (300ms)
```

### 4.3 Success Banner (PASS STATE)

```
╔═══════════════════════════════════════════════════════════════════╗
║  ✓  NO REGRESSIONS                                                ║
║                                                                   ║
║     Overall Score: 0.85 → 0.88 (+0.03)                            ║
║     All 10 cases within threshold                                 ║
║                                                                   ║
║     Safe to merge!                                                ║
╚═══════════════════════════════════════════════════════════════════╝

STYLING:
- Background: success-100 with success-500 left border (4px)
- Shadow: lg
- Icon: Large checkmark circle, brief scale-up animation
- Optional: Subtle confetti on first load
```

### 4.4 Regression Item Card

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔴  tool-lookup                                    CRITICAL      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   tool_selection                                                │
│   ━━━━━━━━━━━━━━━━━━━━━░░░░░░░░  0.85 → 0.45                   │
│                                                                 │
│   ↓ -0.40  (exceeds threshold by 0.35)                         │
│                                                                 │
│   [View Details]                                                │
└─────────────────────────────────────────────────────────────────┘

STYLING:
- Background: white with error-500 left border (4px)
- Shadow: sm, elevates to md on hover
- Score bar:
  - Baseline portion: gray-300
  - Lost portion: error-400 (animated fill from right)
  - Candidate portion: error-600
- Delta text: error-600, font-weight: 600
- "CRITICAL" badge for delta > 0.20
- Sorted by severity (largest delta first)
```

### 4.5 Side-by-Side Score Visualization

```
          Baseline          Candidate
          ───────           ─────────
tool      ████████████░░░   ████░░░░░░░░░░░
          0.85              0.45  ↓

reason    ██████████░░░░░   ████████████░░░
          0.70              0.80  ↑

ground    ████████████░░░   ████████████░░░
          0.83              0.82  —

VISUAL TREATMENT:
- Bars are horizontal, 200px width each
- Threshold line (dotted) at 0.7 mark
- Improvement: green fill grows from baseline
- Regression: red "loss" portion animated
- Unchanged: gray, subtle
```

---

## 5. Focus Management & Keyboard Navigation

### 5.1 Focus Ring Style

```css
/* Consistent focus ring across all interactive elements */
:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 2px var(--bg-surface),      /* Gap */
    0 0 0 4px var(--primary-500);     /* Ring */
}

/* For dark backgrounds */
.dark-bg :focus-visible {
  box-shadow:
    0 0 0 2px var(--gray-900),
    0 0 0 4px var(--primary-400);
}
```

### 5.2 Skip Link

```html
<!-- First focusable element in DOM -->
<a href="#main-content" class="skip-link">
  Skip to main content
</a>

<style>
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  padding: 8px 16px;
  background: var(--primary-600);
  color: white;
  z-index: 100;
}
.skip-link:focus {
  top: 0;
}
</style>
```

### 5.3 Focus Trap for Modals

```
When modal opens:
1. Store previously focused element
2. Move focus to first focusable element in modal
3. Tab cycles within modal only
4. Escape closes modal
5. On close, restore focus to trigger element
```

---

## 6. Icon System

### 6.1 Icon Guidelines

**Library:** Lucide React (consistent with existing setup)

**Sizes:**
- 16px: Inline with text, badges
- 20px: Buttons, navigation items
- 24px: Headers, feature icons
- 32px+: Empty states, hero sections

**Stroke Width:** 2px (default Lucide)

**Colors:**
- Match text color by default (`currentColor`)
- Use semantic colors for status icons
- Never use more than 2 icon colors in a single component

### 6.2 Required Icons

```
Navigation:
- LayoutDashboard  → Dashboard
- FolderKanban     → Suites
- Play             → Runs
- GitCompare       → Compare
- Settings         → Settings

Status:
- CheckCircle      → Success/Passed (green)
- XCircle          → Failed (red)
- AlertCircle      → Error/Warning (yellow/red)
- Clock            → Pending (gray)
- Loader2          → Running (blue, animated spin)
- Ban              → Cancelled (gray)

Actions:
- Plus             → Create/Add
- Pencil           → Edit
- Trash2           → Delete
- MoreVertical     → Menu
- ChevronDown      → Expand
- ChevronRight     → Navigate
- ExternalLink     → External link
- Copy             → Copy to clipboard
- RefreshCw        → Refresh/Retry

Data:
- ArrowUp          → Improvement (green)
- ArrowDown        → Regression (red)
- Minus            → No change (gray)
- TrendingUp       → Trend positive
- TrendingDown     → Trend negative
```

---

## 7. Dark Mode (Future)

While not in MVP scope, design with dark mode in mind:

```css
/* Use CSS variables for all colors */
:root {
  --bg-base: #f9fafb;
  --text-primary: #111827;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-base: #111827;
    --text-primary: #f9fafb;
  }
}

/* Or with a class toggle */
.dark {
  --bg-base: #111827;
  --bg-surface: #1f2937;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
}
```

---

## 8. Responsive Patterns

### 8.1 Sidebar Collapse

```
Desktop (>1024px):
┌────────────┬──────────────────────────────┐
│ Sidebar    │                              │
│ (240px)    │        Main Content          │
│            │                              │
└────────────┴──────────────────────────────┘

Mobile (<768px):
┌──────────────────────────────────────────┐
│ ☰  Neon                          [User]  │  ← Top bar with hamburger
├──────────────────────────────────────────┤
│                                          │
│              Main Content                │
│                                          │
└──────────────────────────────────────────┘

Sidebar slides in as overlay (from left)
with backdrop blur/dim
```

### 8.2 Table to Card List

```
Desktop Table:
│ Suite          │ Status    │ Score │ Time      │
├────────────────┼───────────┼───────┼───────────┤
│ core-tests     │ Completed │ 0.85  │ 2h ago    │

Mobile Cards:
┌─────────────────────────────────────────┐
│ core-tests                    Completed │
│ Score: 0.85                    2h ago   │
└─────────────────────────────────────────┘
```

---

## 9. Implementation Checklist

Before considering the UI "done", verify:

### Component Quality
- [ ] All buttons have all 5 states (default, hover, active, focus, disabled)
- [ ] All inputs have all 5 states (default, hover, focus, error, disabled)
- [ ] All interactive cards have hover lift effect
- [ ] Loading skeletons match content shape
- [ ] Empty states have icon + message + CTA

### Interaction Polish
- [ ] Transitions are smooth (no janky animations)
- [ ] Expandable sections animate height
- [ ] Focus rings visible on keyboard navigation
- [ ] Modals trap focus and close on Escape
- [ ] Toasts slide in and auto-dismiss

### Compare Page (Hero Feature)
- [ ] Regression banner is visually dramatic
- [ ] Pass state feels like a win
- [ ] Score deltas are immediately scannable
- [ ] Regressions sorted by severity

### Accessibility
- [ ] Skip link present
- [ ] All images have alt text
- [ ] Color is not sole indicator
- [ ] Touch targets ≥ 44px
- [ ] Works with keyboard only

---

*This design system ensures visual consistency and interaction polish across the entire Neon dashboard.*
