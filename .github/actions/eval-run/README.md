# Neon Eval Run Action

A reusable GitHub Action that runs agent evaluation suites using the Neon platform and reports results as PR status checks.

## Quick Start

```yaml
- uses: ./.github/actions/eval-run
  with:
    api-url: ${{ secrets.NEON_API_URL }}
    api-key: ${{ secrets.NEON_API_KEY }}
    suite-path: ./evals/
    agent-id: my-agent
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-url` | Yes | - | Neon API URL |
| `api-key` | Yes | - | Neon API key for authentication |
| `suite-path` | Yes | - | Path to eval suite file or directory |
| `agent-id` | Yes | - | Agent identifier for the eval run |
| `fail-on-regression` | No | `true` | Fail if regressions detected vs baseline |
| `min-pass-rate` | No | `0.7` | Minimum pass rate threshold (0-1) |
| `sdk-version` | No | `latest` | `@neon/sdk` version to install |
| `bun-version` | No | `1.2.0` | Bun version to use |
| `baseline-ref` | No | - | Git ref to compare against (e.g., `main`) |
| `timeout-minutes` | No | `15` | Maximum eval run time in minutes |

## Outputs

| Output | Description |
|--------|-------------|
| `run-id` | The eval run ID |
| `pass-rate` | Overall pass rate (0-1) |
| `status` | Run status: `passed`, `failed`, or `error` |
| `score` | Average score across all test cases |
| `passed` | Number of test cases that passed |
| `total` | Total number of test cases |

## Examples

### Basic usage on pull requests

```yaml
name: Agent Eval
on: [pull_request]

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/eval-run
        with:
          api-url: ${{ secrets.NEON_API_URL }}
          api-key: ${{ secrets.NEON_API_KEY }}
          suite-path: ./evals/core-tests.eval.ts
          agent-id: my-agent
```

### With regression detection

```yaml
- uses: ./.github/actions/eval-run
  with:
    api-url: ${{ secrets.NEON_API_URL }}
    api-key: ${{ secrets.NEON_API_KEY }}
    suite-path: ./evals/
    agent-id: my-agent
    fail-on-regression: 'true'
    baseline-ref: main
    min-pass-rate: '0.8'
```

### Using outputs in downstream steps

```yaml
- uses: ./.github/actions/eval-run
  id: eval
  with:
    api-url: ${{ secrets.NEON_API_URL }}
    api-key: ${{ secrets.NEON_API_KEY }}
    suite-path: ./evals/
    agent-id: my-agent

- name: Use results
  run: |
    echo "Run ID: ${{ steps.eval.outputs.run-id }}"
    echo "Pass rate: ${{ steps.eval.outputs.pass-rate }}"
    if [ "${{ steps.eval.outputs.status }}" = "passed" ]; then
      echo "All good!"
    fi
```

### Multiple suite runs

```yaml
jobs:
  critical-evals:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/eval-run
        with:
          api-url: ${{ secrets.NEON_API_URL }}
          api-key: ${{ secrets.NEON_API_KEY }}
          suite-path: ./evals/critical.eval.ts
          agent-id: my-agent
          min-pass-rate: '0.9'

  full-evals:
    needs: critical-evals
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/eval-run
        with:
          api-url: ${{ secrets.NEON_API_URL }}
          api-key: ${{ secrets.NEON_API_KEY }}
          suite-path: ./evals/
          agent-id: my-agent
          min-pass-rate: '0.7'
```

## How It Works

1. **Setup**: Installs Bun and the `@neon/sdk` package
2. **Execute**: Runs the eval suite against the specified agent
3. **Parse**: Extracts scores, pass rates, and run IDs from JSON output
4. **Compare** (optional): Checks for regressions against a baseline ref
5. **Report**: Posts results as a PR comment and writes a job summary
6. **Gate**: Fails the step if pass rate is below the threshold

## PR Comments

When triggered on a pull request, the action posts a comment with eval results:

| Metric | Value |
|--------|-------|
| Run ID | `abc-123` |
| Score | **0.8500** |
| Pass Rate | **85.0%** |
| Passed | 17 / 20 |
| Threshold | 70.0% |
| Status | **PASSED** |

The comment is updated on subsequent runs (not duplicated).

## Secrets

Configure these in your repository settings (Settings > Secrets > Actions):

| Secret | Description |
|--------|-------------|
| `NEON_API_URL` | Your Neon platform API endpoint |
| `NEON_API_KEY` | API key from the Neon dashboard |
| `ANTHROPIC_API_KEY` | Required if using LLM judge scorers |

## Troubleshooting

**Action fails with "NEON_API_URL is required"**
Ensure the `api-url` input is provided and the secret is configured.

**Score is 0.0000 with status "error"**
The eval suite failed to execute. Check the action logs for the underlying error.

**PR comment not posted**
The action must be triggered by a `pull_request` event. Comments require write permissions.

**Timeout**
Increase `timeout-minutes` for large eval suites with many test cases or LLM judge scorers.
