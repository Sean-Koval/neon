# Cleanup Plan: Archive Premature Refactor Code

## Context

During development, code was created for a future MooseStack/Temporal architecture that is not needed for MVP. This code should be archived to avoid confusion and keep the codebase focused.

---

## Files to Archive

### Backend Infrastructure (Not Wired)

| Path | Description | Action |
|------|-------------|--------|
| `moose-app/` | MooseStack data layer (ClickHouse tables, streams) | Archive |
| `temporal-workers/` | Temporal workflow definitions | Archive |
| `packages/sdk/` | TypeScript evals-as-code SDK | Archive |
| `packages/shared/` | Shared TypeScript types | Archive |
| `packages/temporal-client/` | Temporal client wrapper | Archive |

### Frontend (Mock Data Only)

| Path | Description | Action |
|------|-------------|--------|
| `frontend/app/traces/` | Trace viewer (mock data) | Archive |
| `frontend/app/workflows/` | Workflow viewer (mock data) | Archive |
| `frontend/app/analytics/` | Analytics dashboard (mock data) | **Keep as "Coming Soon"** |
| `frontend/server/trpc/` | tRPC routers (not integrated) | Archive |
| `frontend/hooks/use-traces.ts` | Trace hooks (mock) | Archive |
| `frontend/hooks/use-workflows.ts` | Workflow hooks (mock) | Archive |
| `frontend/components/traces/` | Trace components | Archive |
| `frontend/components/workflows/` | Workflow components | Archive |

### Config Files

| Path | Description | Action |
|------|-------------|--------|
| `turbo.json` | Turborepo config (for monorepo) | Archive |
| `.env.example` additions | New env vars for ClickHouse/Temporal | Remove additions |

---

## Archive Strategy

### Option A: Move to `_archive/` Directory (Recommended)

```bash
# Create archive directory
mkdir -p _archive/phase-b-prep

# Move backend infrastructure
mv moose-app/ _archive/phase-b-prep/
mv temporal-workers/ _archive/phase-b-prep/
mv packages/ _archive/phase-b-prep/

# Move frontend components
mkdir -p _archive/phase-b-prep/frontend
mv frontend/app/traces/ _archive/phase-b-prep/frontend/
mv frontend/app/workflows/ _archive/phase-b-prep/frontend/
mv frontend/server/trpc/ _archive/phase-b-prep/frontend/
mv frontend/hooks/use-traces.ts _archive/phase-b-prep/frontend/
mv frontend/hooks/use-workflows.ts _archive/phase-b-prep/frontend/
mv frontend/components/traces/ _archive/phase-b-prep/frontend/
mv frontend/components/workflows/ _archive/phase-b-prep/frontend/

# Move config
mv turbo.json _archive/phase-b-prep/
```

Benefits:
- Code is preserved for Phase B
- Easy to reference design decisions
- Clear separation from active code

### Option B: Git Branch (Alternative)

```bash
# Create branch with refactor code
git checkout -b archive/phase-b-prep
git add .
git commit -m "Archive: Phase B preparation code"
git checkout main

# Remove from main
git rm -r moose-app/ temporal-workers/ packages/
git rm -r frontend/app/traces/ frontend/app/workflows/
# ... etc
git commit -m "Remove premature refactor code, archived in branch"
```

Benefits:
- Cleaner main branch
- Full git history preserved
- Can cherry-pick later

---

## Files to Keep (Modified)

### `frontend/app/analytics/page.tsx`

Convert to "Coming Soon" placeholder:

```tsx
export default function AnalyticsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh]">
      <BarChart2 className="w-16 h-16 text-gray-300 mb-4" />
      <h2 className="text-xl font-semibold text-gray-700">Analytics Coming Soon</h2>
      <p className="text-gray-500 mt-2 max-w-md text-center">
        Usage metrics, cost tracking, and performance analytics will be available in a future update.
      </p>
    </div>
  );
}
```

### `docker-compose.yml`

Keep MLflow-focused version, remove ClickHouse/Temporal/Redpanda services that were added.

---

## Sidebar Navigation Update

After cleanup, sidebar should only show MVP routes:

```tsx
const navigation = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'Suites', href: '/suites', icon: FileText },
  { name: 'Runs', href: '/runs', icon: Play },
  { name: 'Compare', href: '/compare', icon: GitCompare },
  // { name: 'Traces', href: '/traces', icon: Activity },      // Phase B
  // { name: 'Workflows', href: '/workflows', icon: Workflow }, // Phase C
  // { name: 'Analytics', href: '/analytics', icon: BarChart }, // Phase B
];
```

---

## Execution Checklist

### Pre-Archive
- [ ] Document any learnings from the refactor code
- [ ] Note any design decisions to preserve
- [ ] Ensure no active PRs reference these files

### Archive Execution
- [ ] Create `_archive/phase-b-prep/` directory
- [ ] Move backend infrastructure
- [ ] Move frontend components
- [ ] Update imports (remove broken references)
- [ ] Update sidebar navigation
- [ ] Convert analytics to "Coming Soon"
- [ ] Update docker-compose.yml

### Post-Archive
- [ ] Run `bun run build` to ensure no broken imports
- [ ] Run `bun run lint` to check for issues
- [ ] Update README if needed
- [ ] Commit with clear message

### Commit Message

```
chore: archive Phase B/C preparation code

Move premature MooseStack/Temporal refactor code to _archive/phase-b-prep/.
This code will be referenced when we reach Phase B (Observability).

Archived:
- moose-app/ (ClickHouse data layer)
- temporal-workers/ (durable execution)
- packages/sdk/ (evals-as-code)
- frontend/app/traces/, workflows/ (mock pages)

Focus is now on completing MVP (Phase A) with MLflow backend.

See .project/docs/VISION.md for phased evolution strategy.
```

---

## Verification

After cleanup, verify:

1. `bun run build` succeeds
2. `bun run dev` starts without errors
3. All MVP pages load correctly:
   - `/` (Dashboard)
   - `/suites` and `/suites/[id]`
   - `/runs` and `/runs/[id]`
   - `/compare`
4. API endpoints still work
5. No console errors in browser

---

## Timeline

| Task | Effort | Owner |
|------|--------|-------|
| Create archive directory | 5 min | - |
| Move files | 15 min | - |
| Fix broken imports | 30 min | - |
| Update sidebar | 10 min | - |
| Verify build | 15 min | - |
| Commit and push | 5 min | - |
| **Total** | **~1.5 hours** | - |
