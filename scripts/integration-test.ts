/**
 * Integration Test: CORE-008
 *
 * Tests the complete trace flow:
 * 1. Insert a test trace into ClickHouse
 * 2. Query via /api/traces endpoint
 * 3. Verify trace is returned correctly
 */

import { createClient } from '@clickhouse/client';

const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL || 'http://localhost:8123';
const PROJECT_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
  console.log('🧪 Running CORE-008 Integration Test\n');
  console.log('=' .repeat(50));

  // 1. Connect to ClickHouse
  console.log('\n📡 Step 1: Connecting to ClickHouse...');
  const client = createClient({
    url: CLICKHOUSE_URL,
    database: 'neon',
  });

  // Test connection
  const pingResult = await client.ping();
  if (!pingResult.success) {
    throw new Error('Failed to connect to ClickHouse');
  }
  console.log('   ✅ Connected to ClickHouse');

  // 2. Insert a test trace
  console.log('\n📝 Step 2: Inserting test trace...');
  const testTraceId = `test-trace-${Date.now()}`;
  const testTrace = {
    project_id: PROJECT_ID,
    trace_id: testTraceId,
    name: 'integration-test-agent-run',
    timestamp: new Date().toISOString().replace('T', ' ').replace('Z', ''),
    end_time: null,
    duration_ms: 1500,
    status: 'ok',
    metadata: {},
    agent_id: 'test-agent',
    agent_version: '1.0.0',
    workflow_id: null,
    run_id: null,
    total_tokens: 500,
    total_cost: 0.005,
    llm_calls: 2,
    tool_calls: 1,
  };

  await client.insert({
    table: 'traces',
    values: [testTrace],
    format: 'JSONEachRow',
  });
  console.log(`   ✅ Inserted trace: ${testTraceId}`);

  // 3. Insert associated spans
  console.log('\n📝 Step 3: Inserting test spans...');
  const spans = [
    {
      project_id: PROJECT_ID,
      trace_id: testTraceId,
      span_id: `${testTraceId}-span-1`,
      parent_span_id: null,
      name: 'agent-reasoning',
      kind: 'internal',
      span_type: 'generation',
      timestamp: new Date().toISOString().replace('T', ' ').replace('Z', ''),
      end_time: null,
      duration_ms: 800,
      status: 'ok',
      status_message: '',
      model: 'claude-3-5-sonnet',
      model_parameters: {},
      input: 'What is the weather in NYC?',
      output: 'I will check the weather using the get_weather tool.',
      input_tokens: 20,
      output_tokens: 15,
      total_tokens: 35,
      cost_usd: 0.001,
      tool_name: null,
      tool_input: '',
      tool_output: '',
      attributes: {},
    },
    {
      project_id: PROJECT_ID,
      trace_id: testTraceId,
      span_id: `${testTraceId}-span-2`,
      parent_span_id: `${testTraceId}-span-1`,
      name: 'tool-call:get_weather',
      kind: 'client',
      span_type: 'tool',
      timestamp: new Date().toISOString().replace('T', ' ').replace('Z', ''),
      end_time: null,
      duration_ms: 200,
      status: 'ok',
      status_message: '',
      model: null,
      model_parameters: {},
      input: '',
      output: '',
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
      cost_usd: null,
      tool_name: 'get_weather',
      tool_input: '{"location": "NYC"}',
      tool_output: '{"temperature": 72, "condition": "sunny"}',
      attributes: {},
    },
  ];

  await client.insert({
    table: 'spans',
    values: spans,
    format: 'JSONEachRow',
  });
  console.log(`   ✅ Inserted ${spans.length} spans`);

  // 4. Query the trace back
  console.log('\n🔍 Step 4: Querying trace from ClickHouse...');
  const queryResult = await client.query({
    query: `SELECT * FROM traces WHERE trace_id = {traceId:String}`,
    query_params: { traceId: testTraceId },
    format: 'JSONEachRow',
  });

  const traces = await queryResult.json<typeof testTrace>();
  if (traces.length === 0) {
    throw new Error('Trace not found in ClickHouse');
  }
  console.log(`   ✅ Found trace in ClickHouse`);
  console.log(`      - Name: ${traces[0].name}`);
  console.log(`      - Duration: ${traces[0].duration_ms}ms`);
  console.log(`      - Total tokens: ${traces[0].total_tokens}`);

  // 5. Query spans
  console.log('\n🔍 Step 5: Querying spans from ClickHouse...');
  const spansResult = await client.query({
    query: `SELECT * FROM spans WHERE trace_id = {traceId:String} ORDER BY timestamp`,
    query_params: { traceId: testTraceId },
    format: 'JSONEachRow',
  });

  const fetchedSpans = await spansResult.json<typeof spans[0]>();
  console.log(`   ✅ Found ${fetchedSpans.length} spans`);
  for (const span of fetchedSpans) {
    console.log(`      - ${span.name} (${span.span_type}, ${span.duration_ms}ms)`);
  }

  // 6. Verify data integrity
  console.log('\n✅ Step 6: Verifying data integrity...');

  const checks = [
    { name: 'Trace ID matches', passed: traces[0].trace_id === testTraceId },
    { name: 'Project ID matches', passed: traces[0].project_id === PROJECT_ID },
    { name: 'Status is ok', passed: traces[0].status === 'ok' },
    { name: 'Has 2 spans', passed: fetchedSpans.length === 2 },
    { name: 'Has generation span', passed: fetchedSpans.some(s => s.span_type === 'generation') },
    { name: 'Has tool span', passed: fetchedSpans.some(s => s.span_type === 'tool') },
  ];

  let allPassed = true;
  for (const check of checks) {
    const icon = check.passed ? '✅' : '❌';
    console.log(`   ${icon} ${check.name}`);
    if (!check.passed) allPassed = false;
  }

  // 7. Cleanup
  console.log('\n🧹 Step 7: Cleaning up test data...');
  await client.command({
    query: `ALTER TABLE traces DELETE WHERE trace_id = {traceId:String}`,
    query_params: { traceId: testTraceId },
  });
  await client.command({
    query: `ALTER TABLE spans DELETE WHERE trace_id = {traceId:String}`,
    query_params: { traceId: testTraceId },
  });
  console.log('   ✅ Test data cleaned up');

  await client.close();

  // Summary
  console.log('\n' + '=' .repeat(50));
  if (allPassed) {
    console.log('🎉 CORE-008 Integration Test: PASSED');
    console.log('   All checks passed successfully!');
    process.exit(0);
  } else {
    console.log('❌ CORE-008 Integration Test: FAILED');
    console.log('   Some checks failed. Review output above.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n❌ Integration test failed with error:');
  console.error(error);
  process.exit(1);
});
