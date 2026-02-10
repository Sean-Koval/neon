# Dark Mode Migration Spec

## Objective
Every page must look correct in BOTH light and dark mode. The `dark` class on `<html>` toggles the theme via `next-themes`.

## CSS Variable Tokens (defined in globals.css)
These auto-switch with theme. Prefer these for new code:
- `bg-surface-base` — app background
- `bg-surface-raised` — page/section background
- `bg-surface-card` — cards, panels, tables
- `bg-surface-overlay` — modals, dropdowns, tooltips
- `border-border` — card/section borders
- `border-subtle` — dividers
- `text-content-primary` — headings, primary text
- `text-content-secondary` — body text
- `text-content-muted` — labels, metadata

## Replacement Rules (for existing gray-* classes)
Add `dark:` variant alongside existing light class. DO NOT remove the light class.

### Backgrounds
| Light class | Add dark variant |
|---|---|
| `bg-white` | `dark:bg-dark-800` |
| `bg-gray-50` | `dark:bg-dark-900` |
| `bg-gray-100` | `dark:bg-dark-800` |
| `bg-gray-200` | `dark:bg-dark-700` |
| `from-gray-50` | `dark:from-dark-900` |
| `to-gray-100/50` | `dark:to-dark-800/50` |
| `to-white` | `dark:to-dark-800` |

### Text
| Light class | Add dark variant |
|---|---|
| `text-gray-900` | `dark:text-gray-100` |
| `text-gray-800` | `dark:text-gray-200` |
| `text-gray-700` | `dark:text-gray-300` |
| `text-gray-600` | `dark:text-gray-300` |
| `text-gray-500` | `dark:text-gray-400` |
| `text-gray-400` | `dark:text-gray-500` |

### Borders & Dividers
| Light class | Add dark variant |
|---|---|
| `border-gray-200` | `dark:border-dark-700` |
| `border-gray-100` | `dark:border-dark-700` |
| `border-gray-300` | `dark:border-dark-600` |
| `divide-gray-200` | `dark:divide-dark-700` |
| `divide-gray-100` | `dark:divide-dark-700` |

### Hover/Focus States
| Light class | Add dark variant |
|---|---|
| `hover:bg-gray-50` | `dark:hover:bg-dark-700` |
| `hover:bg-gray-100` | `dark:hover:bg-dark-700` |
| `hover:border-gray-300` | `dark:hover:border-dark-600` |
| `focus:border-blue-500` | (keep as-is, works in both) |
| `focus:ring-blue-500` | (keep as-is, works in both) |

### Rings & Shadows
| Light class | Add dark variant |
|---|---|
| `ring-gray-200` | `dark:ring-dark-700` |
| `ring-offset-white` | `dark:ring-offset-dark-900` |

## Status Colors (green/red/amber/yellow — success/error/warning)

Status colors need vibrant dark variants using mid-range (500) at low opacity for clear tints:

### Backgrounds (50-level → subtle tint)
| Light class | Add dark variant |
|---|---|
| `bg-green-50` | `dark:bg-emerald-500/10` |
| `bg-red-50` | `dark:bg-red-500/10` |
| `bg-amber-50` / `bg-yellow-50` | `dark:bg-amber-500/10` |
| `bg-rose-50` | `dark:bg-rose-500/10` |
| `bg-orange-50` | `dark:bg-orange-500/10` |

### Backgrounds (100-level → stronger badge/pill tint)
| Light class | Add dark variant |
|---|---|
| `bg-green-100` / `bg-emerald-100` | `dark:bg-emerald-500/20` |
| `bg-red-100` | `dark:bg-red-500/20` |
| `bg-amber-100` / `bg-yellow-100` | `dark:bg-amber-500/20` |
| `bg-rose-100` | `dark:bg-rose-500/20` |

### Status Text (dark text → bright readable)
| Light class | Add dark variant |
|---|---|
| `text-green-600/700` | `dark:text-emerald-400` |
| `text-green-800` | `dark:text-emerald-300` |
| `text-red-600/700` | `dark:text-red-400` |
| `text-red-800` | `dark:text-red-300` |
| `text-amber-600/700` / `text-yellow-600/700` | `dark:text-amber-400` |
| `text-amber-800` / `text-yellow-800` | `dark:text-amber-300` |
| `text-rose-600/700` | `dark:text-rose-400` |
| `text-emerald-700` | `dark:text-emerald-400` |

### Status Borders
| Light class | Add dark variant |
|---|---|
| `border-green-200` | `dark:border-emerald-500/25` |
| `border-red-200` | `dark:border-red-500/25` |
| `border-amber-200` / `border-yellow-200` | `dark:border-amber-500/25` |
| `border-rose-200` | `dark:border-rose-500/25` |

### DO NOT change
- `text-*-500` (already bright enough in both modes)
- `bg-*-500` (solid dots/indicators, fine as-is)

## Rules
1. NEVER remove the existing light-mode class — always ADD the `dark:` variant alongside it
2. Status colors (green/red/amber) NEED dark variants — use the status color table above
3. The sidebar is ALWAYS dark — do not modify sidebar.tsx
4. Gradient accent bars (primary-400 → accent-400) work in both themes — leave them alone
5. When doing bulk replaces, be careful not to double-add `dark:` variants (check if already present)
6. For inputs/selects: add `dark:bg-dark-800 dark:border-dark-700 dark:text-gray-100`
7. For placeholder text: `placeholder:text-gray-400` → add `dark:placeholder:text-gray-500`
