# AgentEval GitHub Action

Run agent evaluations in your CI/CD pipeline and gate deployments on quality.

## Usage

```yaml
name: Agent Quality
on: [pull_request]

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: pip install -r requirements.txt

      - name: Run Agent Evaluation
        uses: agent-eval/action@v1
        with:
          api-key: ${{ secrets.AGENT_EVAL_API_KEY }}
          suite: core-tests
          agent: src.agent:run
          fail-on-regression: true
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `api-key` | AgentEval API key | Yes | - |
| `suite` | Eval suite name or path to YAML | Yes | - |
| `agent` | Agent module path | No | - |
| `baseline` | Baseline run ID or "latest" | No | `latest` |
| `threshold` | Regression threshold (0-1) | No | `0.05` |
| `fail-on-regression` | Fail if regressions detected | No | `true` |
| `api-url` | API URL (for self-hosted) | No | `https://api.agent-eval.example.com` |

## Outputs

| Output | Description |
|--------|-------------|
| `run-id` | The eval run ID |
| `passed` | Whether evaluation passed |
| `score` | Average score |
| `regressions` | Number of regressions |

## Examples

### Basic Usage

```yaml
- uses: agent-eval/action@v1
  with:
    api-key: ${{ secrets.AGENT_EVAL_API_KEY }}
    suite: core-tests
```

### With Custom Agent

```yaml
- uses: agent-eval/action@v1
  with:
    api-key: ${{ secrets.AGENT_EVAL_API_KEY }}
    suite: eval-suites/tests.yaml
    agent: myapp.agent:run
    threshold: 0.1
```

### Self-Hosted

```yaml
- uses: agent-eval/action@v1
  with:
    api-key: ${{ secrets.AGENT_EVAL_API_KEY }}
    api-url: https://agenteval.mycompany.com
    suite: core-tests
```

## Setting Up

1. Get an API key from AgentEval dashboard
2. Add it as a repository secret: `AGENT_EVAL_API_KEY`
3. Create an eval suite with test cases
4. Add the action to your workflow
