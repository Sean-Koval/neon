# CLI Reference

The Neon CLI (`npx neon`) provides command-line tools for running evaluations.

## Installation

The CLI is included with the `@neon/sdk` package:

```bash
bun add @neon/sdk
# or
npm install @neon/sdk
```

## Commands

### neon eval

Run evaluation tests.

```bash
npx neon eval [patterns...] [options]
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `patterns` | Glob patterns for test file discovery. Default: `**/*.eval.js`, `**/eval.js` |

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-f, --filter <pattern>` | Filter tests by name pattern | - |
| `-p, --parallel <number>` | Number of parallel tests | `1` |
| `-t, --timeout <ms>` | Timeout per test in milliseconds | `60000` |
| `--format <type>` | Output format (`console`, `json`) | `console` |
| `--verbose` | Show verbose output | `false` |
| `--cwd <path>` | Working directory for test discovery | Current directory |
| `--no-sync` | Disable syncing results to Neon cloud | `false` |

#### Examples

```bash
# Run all eval files in current directory
npx neon eval

# Run specific file patterns
npx neon eval "tests/**/*.eval.js"

# Run with filter
npx neon eval --filter "weather"

# Run in parallel with increased timeout
npx neon eval -p 5 -t 120000

# JSON output for CI/CD
npx neon eval --format json

# Verbose output for debugging
npx neon eval --verbose

# Disable cloud sync
npx neon eval --no-sync
```

## Test File Discovery

The CLI automatically discovers test files matching these patterns:

- `**/*.eval.js` - Files ending in `.eval.js`
- `**/eval.js` - Files named `eval.js`

The following directories are always ignored:

- `node_modules/`
- `dist/`
- `.git/`

### TypeScript Support

The CLI runs JavaScript files directly. For TypeScript files:

**Option 1: Compile first**

```bash
tsc
npx neon eval "dist/**/*.eval.js"
```

**Option 2: Use tsx**

```bash
npx tsx packages/sdk/src/cli/index.ts eval "**/*.eval.ts"
```

**Option 3: Use bun (recommended)**

```bash
bun run packages/sdk/src/cli/index.ts eval "**/*.eval.ts"
```

## Test File Structure

Test files must export one or more `Suite` objects:

```typescript
// my-tests.eval.ts
import { defineSuite, defineTest, contains } from '@neon/sdk';

const test1 = defineTest({
  name: 'greeting-test',
  input: { query: 'Hello!' },
  expected: { outputContains: ['hello', 'hi'] },
});

export const mySuite = defineSuite({
  name: 'my-agent-tests',
  tests: [test1],
  scorers: {
    keywords: contains(['hello']),
  },
});

// Default export also works
export default mySuite;
```

## Output Formats

### Console (Default)

Human-readable output with colors:

```
Discovering test files...
Found 1 test file(s)

Loaded 1 suite(s)

Suite: my-agent-tests
  ✓ greeting-test (1.2s)
    - keywords: 1.00

Summary
  Total:  1
  Passed: 1
  Failed: 0

Total time: 1.45s
```

### JSON

Machine-readable output for CI/CD:

```bash
npx neon eval --format json
```

```json
[
  {
    "suite": "my-agent-tests",
    "summary": {
      "total": 1,
      "passed": 1,
      "failed": 0,
      "skipped": 0,
      "passRate": 1,
      "avgScore": 1,
      "duration": 1234
    },
    "results": [
      {
        "test": "greeting-test",
        "passed": true,
        "duration": 1234,
        "scores": [
          {
            "name": "keywords",
            "value": 1,
            "passed": true
          }
        ]
      }
    ]
  }
]
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All tests passed |
| `1` | One or more tests failed, or no tests found |

Use exit codes in CI/CD to fail builds on test failures:

```yaml
# GitHub Actions
- name: Run evaluations
  run: npx neon eval
  # Will fail the step if any test fails
```

## Cloud Sync

By default, results are synced to Neon Cloud if configured. Configure with environment variables:

```bash
export NEON_API_URL=https://your-neon-instance.com
export NEON_API_KEY=your-api-key
```

Disable sync with `--no-sync`:

```bash
npx neon eval --no-sync
```

## Troubleshooting

### "No test files found"

- Check your glob patterns match your file locations
- Use `--verbose` to see which patterns are being searched
- Ensure files are `.js` (not `.ts`) or use tsx/bun

### "No suites found in test files"

- Ensure your test file exports a `Suite` object
- Use named export (`export const suite = ...`) or default export (`export default ...`)
- Check for syntax errors in your test file

### TypeScript errors

If you see "Unknown file extension .ts":

```bash
# Option 1: Compile to JS first
npx tsc && npx neon eval "dist/**/*.eval.js"

# Option 2: Use tsx
npx tsx node_modules/@neon/sdk/src/cli/index.ts eval "**/*.eval.ts"

# Option 3: Use bun
bun run node_modules/@neon/sdk/src/cli/index.ts eval "**/*.eval.ts"
```

### Debug mode

Set the `DEBUG` environment variable for stack traces:

```bash
DEBUG=1 npx neon eval
```
