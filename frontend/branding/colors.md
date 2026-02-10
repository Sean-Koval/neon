# Neon Color System

## Brand Colors

### Primary — Cyan
The primary action color. Used for interactive elements, links, CTAs.

| Token | Hex | Usage |
|-------|-----|-------|
| primary-50 | `#ecfeff` | Light backgrounds, hover states |
| primary-100 | `#cffafe` | Light badge backgrounds |
| primary-200 | `#a5f3fc` | Light borders |
| primary-300 | `#67e8f9` | Light text emphasis |
| primary-400 | `#22d3ee` | Dark theme text, icons |
| primary-500 | `#06b6d4` | Primary buttons, active states |
| primary-600 | `#0891b2` | Hover states (light theme) |
| primary-700 | `#0e7490` | Dark text on light backgrounds |
| primary-800 | `#155e75` | Heavy emphasis |
| primary-900 | `#164e63` | Darkest primary |

### Accent — Violet
Secondary brand color. Used for gradients, highlights, secondary actions.

| Token | Hex | Usage |
|-------|-----|-------|
| accent-50 | `#faf5ff` | Light backgrounds |
| accent-100 | `#f3e8ff` | Badge backgrounds |
| accent-200 | `#e9d5ff` | Light borders |
| accent-300 | `#d8b4fe` | Light text emphasis |
| accent-400 | `#c084fc` | Dark theme text, icons |
| accent-500 | `#a855f7` | Active states, gradient endpoints |
| accent-600 | `#9333ea` | Hover states |
| accent-700 | `#7c3aed` | Dark text on light backgrounds |
| accent-800 | `#6b21a8` | Heavy emphasis |
| accent-900 | `#581c87` | Darkest accent |

## Theme Surfaces

### Dark Theme (Default)

| Token | Hex | Usage |
|-------|-----|-------|
| surface-base | `#020617` (dark-950) | App background |
| surface-raised | `#0f172a` (dark-900) | Page background |
| surface-card | `#1e293b` (dark-800) | Cards, panels — **solid, no opacity** |
| surface-overlay | `#334155` (dark-700) | Modals, dropdowns |
| border-default | `#334155` (dark-700) | Card borders |
| border-subtle | `#1e293b` (dark-800) | Section dividers |
| text-primary | `#f8fafc` (dark-50) | Headings, primary text |
| text-secondary | `#94a3b8` (dark-400) | Body text, descriptions |
| text-muted | `#64748b` (dark-500) | Labels, metadata |

### Light Theme (Future)

| Token | Hex | Usage |
|-------|-----|-------|
| surface-base | `#ffffff` | App background |
| surface-raised | `#f8fafc` (dark-50) | Page background |
| surface-card | `#ffffff` | Cards, panels |
| surface-overlay | `#ffffff` | Modals, dropdowns |
| border-default | `#e2e8f0` (dark-200) | Card borders |
| border-subtle | `#f1f5f9` (dark-100) | Section dividers |
| text-primary | `#0f172a` (dark-900) | Headings, primary text |
| text-secondary | `#475569` (dark-600) | Body text, descriptions |
| text-muted | `#94a3b8` (dark-400) | Labels, metadata |

## Gradients

| Name | CSS | Usage |
|------|-----|-------|
| neon-gradient | `linear-gradient(135deg, #06b6d4 0%, #8b5cf6 50%, #d946ef 100%)` | Hero sections, banners |
| neon-glow | `linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)` | Buttons, accent bars |

## Card Design Rules

1. **Cards must use solid backgrounds** — never use opacity modifiers like `/50` on card backgrounds. The washed-out gray looks poor against the dark surface.
2. Dark theme cards: `bg-dark-800 border border-dark-700` (solid)
3. Light theme cards: `bg-white border border-gray-200` (solid)
4. Hover border: `hover:border-primary-500/30` (opacity OK on hover borders)
5. Cards with gradient accent: add `stat-card` class for top gradient bar
