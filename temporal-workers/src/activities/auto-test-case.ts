/**
 * Auto Test Case Generation Activity
 *
 * Generates test cases from anomalous production traces.
 */

const NEON_API_URL = process.env.NEON_API_URL || "http://localhost:3000";

export interface GeneratedTestCase {
  name: string;
  input: string;
  expectedOutput: string;
  tools: string[];
  sourceTraceId: string;
  metadata: Record<string, unknown>;
}

/**
 * Generate a test case from a trace by extracting input/output.
 */
export async function generateTestCaseFromTrace(
  projectId: string,
  traceId: string
): Promise<GeneratedTestCase> {
  const response = await fetch(
    `${NEON_API_URL}/api/traces/${traceId}?project_id=${projectId}`
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch trace ${traceId}: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  const { trace, spans } = data;

  // Extract first user input from root span's input field
  const rootSpan = spans?.[0];
  const input = rootSpan?.input || rootSpan?.tool_input || "{}";

  // Extract final output from last generation span
  const generationSpans = (spans || []).filter(
    (s: { span_type: string }) => s.span_type === "generation"
  );
  const lastGenSpan = generationSpans[generationSpans.length - 1];
  const expectedOutput =
    lastGenSpan?.output || rootSpan?.output || rootSpan?.tool_output || "{}";

  // Extract tool list from tool-type spans
  const toolNames = new Set<string>();
  for (const span of spans || []) {
    if (span.span_type === "tool" && span.tool_name) {
      toolNames.add(span.tool_name);
    }
  }

  return {
    name: `${trace?.name || "trace"} - ${traceId.slice(0, 8)}`,
    input,
    expectedOutput,
    tools: [...toolNames],
    sourceTraceId: traceId,
    metadata: {
      generatedFrom: "anomaly-detection",
      originalStatus: trace?.status,
      originalDurationMs: trace?.duration_ms,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Add generated test cases to a regression suite.
 */
export async function addToRegressionSuite(
  suiteId: string,
  testCases: GeneratedTestCase[]
): Promise<{ added: number; errors: string[] }> {
  const errors: string[] = [];
  let added = 0;

  for (const testCase of testCases) {
    try {
      const response = await fetch(
        `${NEON_API_URL}/api/trpc/suites.addCase`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            json: {
              suiteId,
              name: testCase.name,
              input: testCase.input,
              expectedOutput: testCase.expectedOutput,
              metadata: testCase.metadata,
            },
          }),
        }
      );

      if (!response.ok) {
        errors.push(
          `Failed to add case "${testCase.name}": ${response.statusText}`
        );
      } else {
        added++;
      }
    } catch (err) {
      errors.push(
        `Error adding case "${testCase.name}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { added, errors };
}
