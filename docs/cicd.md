# CI/CD Integration

Integrate Neon into your CI/CD pipeline to automatically test agent quality and gate deployments on evaluation results.

## GitHub Actions

### Basic Setup

```yaml
# .github/workflows/eval.yml
name: Agent Evaluation

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install

      - name: Run evaluations
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          NEON_API_URL: ${{ secrets.NEON_API_URL }}
        run: |
          bun run eval --suite core-tests --output json > results.json

      - name: Check for regressions
        run: |
          # Fail if any test failed
          if jq -e '.failed > 0' results.json > /dev/null; then
            echo "❌ Evaluation failed"
            jq '.results[] | select(.passed == false)' results.json
            exit 1
          fi
          echo "✅ All evaluations passed"
```

### With Baseline Comparison

Compare against a baseline to detect regressions:

```yaml
jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install

      - name: Run evaluation
        id: eval
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          # Run current version
          bun run eval --suite core-tests --output json > candidate.json
          echo "run_id=$(jq -r '.run_id' candidate.json)" >> $GITHUB_OUTPUT

      - name: Compare with baseline
        if: github.event_name == 'pull_request'
        env:
          NEON_API_URL: ${{ secrets.NEON_API_URL }}
        run: |
          # Compare against main branch baseline
          bun run eval:compare \
            --baseline main \
            --candidate ${{ steps.eval.outputs.run_id }} \
            --threshold 0.05 \
            --fail-on-regression
```

### Comment Results on PR

```yaml
      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('results.json', 'utf8'));

            const passed = results.passed;
            const failed = results.failed;
            const avgScore = (results.avg_score * 100).toFixed(1);

            const status = failed === 0 ? '✅' : '❌';
            const body = `## ${status} Agent Evaluation Results

            | Metric | Value |
            |--------|-------|
            | Passed | ${passed} |
            | Failed | ${failed} |
            | Avg Score | ${avgScore}% |

            ${failed > 0 ? '### Failed Cases\n' + results.results
              .filter(r => !r.passed)
              .map(r => `- **${r.case_name}**: ${(r.avg_score * 100).toFixed(1)}%`)
              .join('\n') : ''}
            `;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });
```

## Quality Gates

### Block PRs on Regression

Configure branch protection to require passing evaluations:

1. Go to **Settings → Branches → Branch protection rules**
2. Add rule for `main`
3. Enable **Require status checks to pass**
4. Add **Agent Evaluation / evaluate** as required

### Configurable Thresholds

```yaml
env:
  # Minimum passing score (0.0 - 1.0)
  MIN_SCORE: 0.8
  # Maximum allowed regression from baseline
  REGRESSION_THRESHOLD: 0.05
  # Fail on any test failure
  STRICT_MODE: true

steps:
  - name: Run evaluation
    run: |
      bun run eval --suite core-tests \
        --min-score $MIN_SCORE \
        --output json > results.json

  - name: Enforce quality gate
    run: |
      AVG_SCORE=$(jq '.avg_score' results.json)
      if (( $(echo "$AVG_SCORE < $MIN_SCORE" | bc -l) )); then
        echo "❌ Average score $AVG_SCORE below threshold $MIN_SCORE"
        exit 1
      fi
```

## Multiple Suites

Run different suites for different scenarios:

```yaml
jobs:
  core-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run eval --suite core-tests --fail-on-failure

  regression-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run eval --suite regression-tests --fail-on-failure

  performance-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      # Performance tests don't block, just report
      - run: bun run eval --suite performance-tests || true
```

## GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - test

agent-eval:
  stage: test
  image: oven/bun:latest
  script:
    - bun install
    - bun run eval --suite core-tests --output json > results.json
    - |
      if [ $(jq '.failed' results.json) -gt 0 ]; then
        echo "Evaluation failed"
        exit 1
      fi
  variables:
    ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY
  artifacts:
    reports:
      dotenv: results.json
```

## CircleCI

```yaml
# .circleci/config.yml
version: 2.1

jobs:
  evaluate:
    docker:
      - image: oven/bun:latest
    steps:
      - checkout
      - run:
          name: Install dependencies
          command: bun install
      - run:
          name: Run evaluations
          command: |
            bun run eval --suite core-tests --output json > results.json
      - run:
          name: Check results
          command: |
            if [ $(jq '.failed' results.json) -gt 0 ]; then
              exit 1
            fi
      - store_artifacts:
          path: results.json

workflows:
  main:
    jobs:
      - evaluate
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API key for LLM judges | For LLM scorers |
| `OPENAI_API_KEY` | OpenAI API key | Alternative |
| `NEON_API_URL` | Neon API endpoint | For remote storage |
| `NEON_PROJECT_ID` | Project identifier | For multi-project |

## Best Practices

### 1. Cache Dependencies

```yaml
- name: Cache dependencies
  uses: actions/cache@v3
  with:
    path: ~/.bun/install/cache
    key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lockb') }}
```

### 2. Run Critical Tests First

```yaml
jobs:
  critical:
    runs-on: ubuntu-latest
    steps:
      - run: bun run eval --suite core-tests --tags critical

  full:
    needs: critical  # Only run if critical passes
    runs-on: ubuntu-latest
    steps:
      - run: bun run eval --suite core-tests
```

### 3. Store Results as Artifacts

```yaml
- name: Upload results
  uses: actions/upload-artifact@v3
  with:
    name: eval-results
    path: results.json
    retention-days: 30
```

### 4. Notify on Failures

```yaml
- name: Notify Slack on failure
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "❌ Agent evaluation failed on ${{ github.ref }}"
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

## Troubleshooting

### "API key not found"

Ensure secrets are configured in your repository:
- GitHub: Settings → Secrets → Actions
- GitLab: Settings → CI/CD → Variables
- CircleCI: Project Settings → Environment Variables

### Timeouts

Increase timeout for slow evaluations:

```yaml
- name: Run evaluation
  timeout-minutes: 30
  run: bun run eval --suite core-tests
```

### Rate Limits

If hitting LLM rate limits, add delays or reduce parallelism:

```yaml
- run: bun run eval --suite core-tests --parallel 2 --delay 1000
```
