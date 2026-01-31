# Bundle Optimization Report - PERF-005

## Overview

This document summarizes the bundle optimization work done as part of PERF-005 to reduce initial load time and improve perceived performance.

## Changes Implemented

### 1. Code Splitting with Dynamic Imports

- **Charts**: All Recharts components are now lazy-loaded via `next/dynamic`
  - `TrendChart` -> `LazyTrendChart`
  - `ScoreTrendChart` -> `LazyScoreTrendChart`

- **Dashboard Components**: Heavy dashboard components are lazy-loaded
  - `ScoreTrends` -> `LazyScoreTrends`
  - `DashboardStatCards` -> `LazyDashboardStatCards`

- **Trace Viewer Components**: Trace visualization components are lazy-loaded
  - `TraceTimeline` -> `LazyTraceTimeline`
  - `SpanDetail` -> `LazySpanDetail`

### 2. Route-Level Loading States

Added `loading.tsx` files for smooth navigation:
- `/app/loading.tsx` - Dashboard skeleton
- `/app/traces/loading.tsx` - Traces list skeleton
- `/app/traces/[id]/loading.tsx` - Trace detail skeleton
- `/app/eval-runs/loading.tsx` - Eval runs list skeleton
- `/app/eval-runs/[id]/loading.tsx` - Eval run detail skeleton

### 3. Next.js Configuration Optimizations

- Added `@next/bundle-analyzer` for visualization
- Enabled `optimizePackageImports` for recharts, date-fns, lucide-react
- Added modular imports for lucide-react icons

### 4. Route Preloading

Created `PreloadLink` component that preloads routes on hover/focus for faster navigation.

## Bundle Size Analysis

### Before Optimization
- Total JS: **1,873 KB**
- No lazy loading - all Recharts code loaded on initial page

### After Optimization
- **Initial Bundle: 510 KB** (loaded on every page)
- **Lazy-loaded Chart Chunks: 774 KB** (2 x 387 KB, loaded on-demand)
- Total JS: 1,910 KB (slight increase due to dynamic import wrappers)

### Effective Reduction

The initial page load no longer includes the ~774 KB of chart/visualization code. This represents a **60% reduction** in initial JavaScript payload:

- Before: ~1,285 KB loaded on initial page (including charts)
- After: ~510 KB loaded on initial page

Charts and heavy visualization components load:
1. When user navigates to dashboard (after initial paint)
2. When chart components become visible in viewport
3. With skeleton loading states for smooth UX

## Files Added

```
frontend/
├── components/
│   ├── charts/
│   │   └── lazy-charts.tsx        # Lazy chart wrappers + skeletons
│   ├── dashboard/
│   │   └── lazy-components.tsx    # Lazy dashboard wrappers
│   ├── traces/
│   │   └── lazy-components.tsx    # Lazy trace viewer wrappers
│   └── ui/
│       └── preload-link.tsx       # Hover/focus preloading
├── app/
│   ├── loading.tsx                # Dashboard loading state
│   ├── traces/
│   │   ├── loading.tsx            # Traces list loading
│   │   └── [id]/loading.tsx       # Trace detail loading
│   └── eval-runs/
│       ├── loading.tsx            # Eval runs loading
│       └── [id]/loading.tsx       # Eval run detail loading
└── BUNDLE_OPTIMIZATION.md         # This document
```

## Files Modified

- `next.config.js` - Added bundle analyzer and optimizations
- `package.json` - Added `build:analyze` script
- `app/page.tsx` - Use lazy dashboard components
- `app/traces/[id]/page.tsx` - Use lazy trace components
- `components/dashboard/score-trends.tsx` - Use lazy TrendChart
- `components/dashboard/trend-card.tsx` - Use lazy ScoreTrendChart
- `components/sidebar.tsx` - Use PreloadLink for navigation

## Commands

```bash
# Standard build
bun run build

# Build with bundle analyzer visualization
bun run build:analyze
```

## Performance Improvements

1. **Faster Initial Load**: 60% reduction in initial JavaScript
2. **No FOUC**: Loading skeletons prevent flash of unstyled content
3. **Smoother Navigation**: Route preloading on hover/focus
4. **Progressive Loading**: Charts load after initial paint

## Future Optimizations

Consider for future work:
- Virtualized lists for large trace/run tables
- Image optimization with next/image
- Service worker for offline caching
- Edge caching for API responses
