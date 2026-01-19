# CI/CD Integration

AgentEval integrates into your CI/CD pipeline to automatically test agent quality and gate deployments.

## GitHub Actions

### Basic Setup

```yaml
# .github/workflows/agent-eval.yml
name: Agent Quality

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

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install -r requirements.txt

      - name: Run Agent Evaluation
        uses: agent-eval/action@v1
        with:
          api-key: ${{ secrets.AGENT_EVAL_API_KEY }}
          suite: core-tests
          fail-on-regression: true
```

### Using the Official Action

```yaml
- name: Run Agent Evaluation
  uses: agent-eval/action@v1
  with:
    api-key: ${{ secrets.AGENT_EVAL_API_KEY }}
    suite: core-tests
    agent: src.myagent:run          # Your agent module
    baseline: latest                 # Compare against latest
    threshold: 0.05                  # 5% regression threshold
    fail-on-regression: true         # Fail PR if regressions
```

### Outputs

Access evaluation results in subsequent steps:

```yaml
- name: Run Agent Evaluation
  id: eval
  uses: agent-eval/action@v1
  with:
    api-key: ${{ secrets.AGENT_EVAL_API_KEY }}
    suite: core-tests

- name: Comment on PR
  if: github.event_name == 'pull_request'
  uses: actions/github-script@v7
  with:
    script: |
      const score = '${{ steps.eval.outputs.score }}';
      const regressions = '${{ steps.eval.outputs.regressions }}';

      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: `## Agent Evaluation\n\nScore: ${score}\nRegressions: ${regressions}`
      });
```

## CLI in CI

If you prefer using the CLI directly:

```yaml
- name: Install agent-eval
  run: pip install agent-eval

- name: Run evaluation
  env:
    AGENT_EVAL_API_KEY: ${{ secrets.AGENT_EVAL_API_KEY }}
  run: |
    # Run evaluation
    agent-eval run start core-tests \
      --agent src.myagent:run \
      --agent-version ${{ github.sha }} \
      --output json > result.json

    # Compare with baseline
    agent-eval compare runs latest $(jq -r '.id' result.json) \
      --threshold 0.05 \
      --fail-on-regression
```

## Quality Gates

### Block PRs on Regression

```yaml
- name: Run Agent Evaluation
  uses: agent-eval/action@v1
  with:
    api-key: ${{ secrets.AGENT_EVAL_API_KEY }}
    suite: core-tests
    fail-on-regression: true  # This will fail the job if regressions detected
```

### Required Status Check

1. Go to repository Settings > Branches
2. Add branch protection rule for `main`
3. Enable "Require status checks to pass before merging"
4. Add "Agent Quality / evaluate" as required check

### Custom Threshold

```yaml
- name: Run Agent Evaluation
  uses: agent-eval/action@v1
  with:
    api-key: ${{ secrets.AGENT_EVAL_API_KEY }}
    suite: core-tests
    threshold: 0.1  # 10% regression threshold (more lenient)
```

## Multiple Suites

Run different suites for different scenarios:

```yaml
jobs:
  core-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: agent-eval/action@v1
        with:
          api-key: ${{ secrets.AGENT_EVAL_API_KEY }}
          suite: core-tests
          fail-on-regression: true

  regression-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: agent-eval/action@v1
        with:
          api-key: ${{ secrets.AGENT_EVAL_API_KEY }}
          suite: regression-tests
          fail-on-regression: true

  edge-cases:
    runs-on: ubuntu-latest
    steps:
      - uses: agent-eval/action@v1
        with:
          api-key: ${{ secrets.AGENT_EVAL_API_KEY }}
          suite: edge-cases
          fail-on-regression: false  # Monitor but don't block
```

## Other CI Systems

### GitLab CI

```yaml
# .gitlab-ci.yml
agent-eval:
  stage: test
  image: python:3.11
  script:
    - pip install agent-eval
    - agent-eval run start core-tests --agent src.myagent:run
    - agent-eval compare runs latest $(cat .run-id) --fail-on-regression
  variables:
    AGENT_EVAL_API_KEY: $AGENT_EVAL_API_KEY
```

### CircleCI

```yaml
# .circleci/config.yml
version: 2.1

jobs:
  agent-eval:
    docker:
      - image: cimg/python:3.11
    steps:
      - checkout
      - run:
          name: Install agent-eval
          command: pip install agent-eval
      - run:
          name: Run evaluation
          command: |
            agent-eval run start core-tests \
              --agent src.myagent:run \
              --fail-on-regression
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AGENT_EVAL_API_KEY` | API key for authentication |
| `AGENT_EVAL_API_URL` | API URL (for self-hosted) |

## Troubleshooting

### "API key not found"

Ensure `AGENT_EVAL_API_KEY` is set in your CI secrets.

### "Suite not found"

Create the suite first:
```bash
agent-eval suite create eval-suites/core-tests.yaml
```

### Timeouts

Increase timeout for slow evaluations:
```yaml
- uses: agent-eval/action@v1
  with:
    timeout-minutes: 30
```
