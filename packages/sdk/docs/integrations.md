# Integrations

This guide covers integrating the Neon SDK with CI/CD pipelines and popular agent frameworks.

## CI/CD Integration

### GitHub Actions

Create `.github/workflows/eval.yml`:

```yaml
name: Agent Evaluations

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  eval:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Build (if TypeScript)
        run: npm run build

      - name: Run evaluations
        run: npx neon eval --format json > eval-results.json
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          NEON_API_KEY: ${{ secrets.NEON_API_KEY }}

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: eval-results
          path: eval-results.json

      - name: Check for failures
        run: |
          if grep -q '"failed": [1-9]' eval-results.json; then
            echo "Evaluation failures detected"
            exit 1
          fi
```

#### With Threshold Checks

```yaml
- name: Run evaluations with threshold
  run: |
    npx neon eval --format json > results.json

    # Check minimum average score
    AVG_SCORE=$(jq '.[].summary.avgScore' results.json | awk '{sum+=$1} END {print sum/NR}')
    if (( $(echo "$AVG_SCORE < 0.8" | bc -l) )); then
      echo "Average score $AVG_SCORE is below threshold 0.8"
      exit 1
    fi
```

#### PR Comments

```yaml
- name: Comment on PR
  if: github.event_name == 'pull_request'
  uses: actions/github-script@v7
  with:
    script: |
      const fs = require('fs');
      const results = JSON.parse(fs.readFileSync('eval-results.json', 'utf8'));

      let body = '## Evaluation Results\n\n';
      for (const suite of results) {
        const { total, passed, failed, avgScore } = suite.summary;
        const emoji = failed > 0 ? '❌' : '✅';
        body += `${emoji} **${suite.suite}**: ${passed}/${total} passed (avg score: ${avgScore.toFixed(2)})\n`;
      }

      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: body
      });
```

### GitLab CI

Create `.gitlab-ci.yml`:

```yaml
stages:
  - test
  - eval

eval:
  stage: eval
  image: node:20
  script:
    - npm ci
    - npm run build
    - npx neon eval --format json > eval-results.json
  artifacts:
    paths:
      - eval-results.json
    reports:
      junit: eval-results.xml  # If you convert to JUnit format
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  variables:
    ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY
    NEON_API_KEY: $NEON_API_KEY
```

### CircleCI

Create `.circleci/config.yml`:

```yaml
version: 2.1

jobs:
  eval:
    docker:
      - image: cimg/node:20.0
    steps:
      - checkout
      - run:
          name: Install dependencies
          command: npm ci
      - run:
          name: Build
          command: npm run build
      - run:
          name: Run evaluations
          command: npx neon eval --format json > eval-results.json
      - store_artifacts:
          path: eval-results.json

workflows:
  evaluate:
    jobs:
      - eval
```

### Jenkins

Create `Jenkinsfile`:

```groovy
pipeline {
    agent {
        docker {
            image 'node:20'
        }
    }

    environment {
        ANTHROPIC_API_KEY = credentials('anthropic-api-key')
        NEON_API_KEY = credentials('neon-api-key')
    }

    stages {
        stage('Install') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }

        stage('Evaluate') {
            steps {
                sh 'npx neon eval --format json > eval-results.json'
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'eval-results.json'
        }
    }
}
```

## Agent Framework Integration

### LangChain

Evaluate LangChain agents with the Neon SDK:

```typescript
import { defineSuite, defineTest, run, llmJudge, contains } from '@neon/sdk';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';

// Your LangChain agent setup
const llm = new ChatOpenAI({ model: 'gpt-4' });
const agent = createOpenAIFunctionsAgent({ llm, tools, prompt });
const executor = AgentExecutor.fromAgentAndTools({ agent, tools });

// Define tests
const weatherTest = defineTest({
  name: 'weather-query',
  input: { query: 'What is the weather in NYC?' },
  expected: {
    toolCalls: ['get_weather'],
    outputContains: ['temperature', 'NYC'],
  },
});

// Define suite with agent runner
const suite = defineSuite({
  name: 'langchain-agent-v1',
  tests: [weatherTest],
  scorers: {
    quality: llmJudge({
      prompt: 'Rate the response quality 0-1: {{output}}',
    }),
  },
});

// Run evaluation
const result = await run(suite, {
  agent: async (input) => {
    const startTime = Date.now();
    const response = await executor.invoke({ input: input.query });

    return {
      output: response.output,
      toolCalls: response.intermediateSteps?.map(s => s.action.tool) || [],
      metadata: {
        duration: Date.now() - startTime,
        steps: response.intermediateSteps,
      },
    };
  },
});

console.log(result.summary);
```

### CrewAI

Evaluate CrewAI crews:

```typescript
import { defineSuite, defineTest, run } from '@neon/sdk';
// Assuming CrewAI has a JS/TS SDK or you're calling a Python service

const researchTest = defineTest({
  name: 'research-task',
  input: {
    task: 'Research the latest AI developments',
    context: 'Focus on agent architectures',
  },
  expected: {
    outputContains: ['agent', 'AI', 'development'],
  },
});

const suite = defineSuite({
  name: 'crewai-research-crew',
  tests: [researchTest],
});

const result = await run(suite, {
  agent: async (input) => {
    // Call your CrewAI service
    const response = await fetch('http://localhost:8000/crew/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const data = await response.json();
    return {
      output: data.result,
      toolCalls: data.tools_used || [],
      metadata: data.metadata,
    };
  },
});
```

### AutoGen

Evaluate AutoGen conversations:

```typescript
import { defineSuite, defineTest, run, llmJudge } from '@neon/sdk';

const conversationTest = defineTest({
  name: 'multi-agent-conversation',
  input: {
    task: 'Write a Python function to calculate fibonacci numbers',
  },
  expected: {
    outputContains: ['def', 'fibonacci', 'return'],
  },
});

const suite = defineSuite({
  name: 'autogen-coding-team',
  tests: [conversationTest],
  scorers: {
    code_quality: llmJudge({
      prompt: `Rate the code quality 0-1:

      Code: {{output}}

      Consider: correctness, readability, efficiency.
      Return JSON: {"score": 0-1, "reason": "explanation"}`,
    }),
  },
});

const result = await run(suite, {
  agent: async (input) => {
    // Call your AutoGen service
    const response = await fetch('http://localhost:8000/autogen/chat', {
      method: 'POST',
      body: JSON.stringify({ message: input.task }),
    });

    const data = await response.json();
    return {
      output: data.final_response,
      metadata: {
        conversation: data.messages,
        agent_count: data.agents_involved,
      },
    };
  },
});
```

### Custom HTTP Agents

For any agent accessible via HTTP:

```typescript
import { defineSuite, defineTest, run, type AgentOutput } from '@neon/sdk';

// Generic HTTP agent adapter
async function httpAgent(url: string, input: Record<string, unknown>): Promise<AgentOutput> {
  const startTime = Date.now();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.AGENT_API_KEY}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Agent request failed: ${response.status}`);
  }

  const data = await response.json();

  return {
    output: data.response || data.output || data.result,
    toolCalls: data.tool_calls || data.tools || [],
    traceId: data.trace_id,
    metadata: {
      ...data.metadata,
      duration: Date.now() - startTime,
      statusCode: response.status,
    },
  };
}

// Use in suite
const result = await run(suite, {
  agent: (input) => httpAgent('https://my-agent.example.com/run', input),
});
```

## Neon Cloud Integration

### Configuring Cloud Sync

Set environment variables to sync results to Neon Cloud:

```bash
export NEON_API_URL=https://your-neon-instance.com
export NEON_API_KEY=your-api-key
export NEON_PROJECT_ID=your-project-id
```

### Programmatic Sync

```typescript
import {
  run,
  syncResultsToCloud,
  createCloudClientFromEnv,
  isCloudSyncConfigured
} from '@neon/sdk';

// Run tests
const result = await run(suite, { agent: myAgent });

// Sync to cloud
if (isCloudSyncConfigured()) {
  const client = createCloudClientFromEnv();
  const syncResult = await syncResultsToCloud([result], {
    metadata: {
      branch: process.env.GITHUB_REF,
      commit: process.env.GITHUB_SHA,
    },
  });

  console.log(`Results synced: ${syncResult.url}`);
}
```

### Background Sync

Non-blocking sync that doesn't slow down CI:

```typescript
import { createBackgroundSync, formatSyncStatus } from '@neon/sdk';

const result = await run(suite, { agent: myAgent });

// Start background sync (returns immediately)
const syncPromise = createBackgroundSync([result], {
  metadata: { ci: true },
});

// Do other work while sync happens...
console.log('Evaluation complete');

// Optionally wait for sync
const syncResults = await syncPromise;
console.log(formatSyncStatus(syncResults));
```

## Monitoring & Alerting

### Datadog Integration

```typescript
import { run } from '@neon/sdk';
import { metrics } from 'datadog-metrics';

const result = await run(suite, { agent: myAgent });

// Send metrics to Datadog
metrics.gauge('neon.eval.pass_rate', result.summary.passRate, [
  `suite:${suite.name}`,
  `env:${process.env.NODE_ENV}`,
]);

metrics.gauge('neon.eval.avg_score', result.summary.avgScore, [
  `suite:${suite.name}`,
]);

metrics.increment('neon.eval.total', result.summary.total, [
  `suite:${suite.name}`,
]);
```

### Slack Notifications

```typescript
import { run } from '@neon/sdk';

const result = await run(suite, { agent: myAgent });

// Send Slack notification on failures
if (result.summary.failed > 0) {
  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `⚠️ Evaluation failures in ${suite.name}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${result.summary.failed}* of *${result.summary.total}* tests failed\nAverage score: *${result.summary.avgScore.toFixed(2)}*`,
          },
        },
      ],
    }),
  });
}
```

### PagerDuty Integration

```typescript
if (result.summary.passRate < 0.5) {
  await fetch('https://events.pagerduty.com/v2/enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      routing_key: process.env.PAGERDUTY_ROUTING_KEY,
      event_action: 'trigger',
      payload: {
        summary: `Critical: Agent evaluation pass rate dropped to ${result.summary.passRate}`,
        severity: 'critical',
        source: suite.name,
        custom_details: result.summary,
      },
    }),
  });
}
```

## Best Practices

### 1. Separate Dev and CI Configs

```typescript
// evals/config.ts
export const config = {
  parallel: process.env.CI ? 1 : 5,  // Serial in CI for predictability
  timeout: process.env.CI ? 120000 : 60000,  // Longer timeout in CI
  verbose: !process.env.CI,
};
```

### 2. Use Environment-Based Thresholds

```typescript
const THRESHOLDS = {
  development: 0.6,
  staging: 0.75,
  production: 0.9,
};

const threshold = THRESHOLDS[process.env.NODE_ENV] || 0.7;
```

### 3. Cache Agent Responses in Dev

```typescript
import { createHash } from 'crypto';
import fs from 'fs';

async function cachedAgent(input: Record<string, unknown>) {
  if (process.env.CI) {
    // Always call real agent in CI
    return realAgent(input);
  }

  const cacheKey = createHash('md5').update(JSON.stringify(input)).digest('hex');
  const cachePath = `.cache/${cacheKey}.json`;

  if (fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  }

  const result = await realAgent(input);
  fs.mkdirSync('.cache', { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(result));
  return result;
}
```

### 4. Tag Results for Tracking

```typescript
await run(suite, {
  agent: myAgent,
  metadata: {
    version: process.env.npm_package_version,
    commit: process.env.GITHUB_SHA,
    branch: process.env.GITHUB_REF,
    buildNumber: process.env.BUILD_NUMBER,
    timestamp: new Date().toISOString(),
  },
});
```
