# Neon Brand & Theme Guide

This folder is the **single source of truth** for Neon's visual identity — colors, typography, spacing tokens, and design assets.

## Files

| File | Purpose |
|------|---------|
| `theme.ts` | Exportable color tokens for dark & light themes |
| `colors.md` | Human-readable color reference with hex values |
| `assets/` | Logo SVGs, favicons, OG images (future) |

## Usage

Import tokens in components:
```ts
import { theme } from '@/branding/theme'
```

Or reference the Tailwind config which pulls from the same palette defined in `tailwind.config.ts`.
