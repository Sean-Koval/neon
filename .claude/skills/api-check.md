# /api-check - API Smoke Test

Layer 1 of the dev verification loop. Hits every API endpoint and reports status codes.

## Usage

```
/api-check                    # Check all API endpoints on localhost:3000
/api-check <base-url>         # Check against a custom base URL
```

## Execution

When this command is invoked, follow these steps:

### Step 1: Discover API Endpoints

Use Glob to find all route handler files:

```
frontend/app/api/**/route.ts
```

For each route file, determine:
- The URL path (from the file path, e.g., `frontend/app/api/alerts/route.ts` -> `/api/alerts`)
- The HTTP methods exported (GET, POST, PUT, DELETE, PATCH)

Read each route file briefly to identify which methods are exported.

### Step 2: Hit Each Endpoint

For each discovered endpoint, use Bash with curl:

```bash
# For GET endpoints
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/alerts

# For POST endpoints (with minimal body)
curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' http://localhost:3000/api/runs
```

Run all curl commands in parallel for speed (use `&` and `wait`).

### Step 3: Classify Results

Classify each response:
- **2xx**: OK
- **400**: WARNING - validation issue (may need request body)
- **401**: CRITICAL - auth not configured for local dev
- **404**: CRITICAL - route handler missing or misconfigured
- **405**: INFO - method not allowed (expected for wrong HTTP method)
- **500**: CRITICAL - server error

### Step 4: Report

Output a concise report:

```
## API Smoke Test Results

Base URL: http://localhost:3000
Endpoints tested: 23
Time: 3.2s

### CRITICAL (must fix)
- GET /api/alerts -> 401 (auth required, no JWT_SECRET configured)
- GET /api/skills/summaries -> 404 (route not implemented)

### WARNING (investigate)
- POST /api/trpc/feedback.create -> 400 (validation: missing required fields)

### OK (18 endpoints)
- GET /api/dashboard -> 200
- GET /api/settings -> 200
...
```

## Notes

- The dev server must be running (`bun run dev` or `bun run frontend`)
- This test runs WITHOUT authentication by default
- 401s in local dev indicate auth middleware that needs a dev bypass
- 404s indicate routes referenced by the frontend that don't exist
- This is the fastest layer (~5 seconds) and should be run first
