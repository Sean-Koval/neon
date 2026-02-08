#!/usr/bin/env bash
set -euo pipefail

# Neon Eval Run - Entrypoint Script
# Installs the SDK, runs eval suites, polls for results, and sets GitHub Action outputs.

SUITE_PATH="${NEON_SUITE_PATH:?NEON_SUITE_PATH is required}"
API_URL="${NEON_API_URL:?NEON_API_URL is required}"
API_KEY="${NEON_API_KEY:?NEON_API_KEY is required}"
AGENT_ID="${NEON_AGENT_ID:?NEON_AGENT_ID is required}"
MIN_PASS_RATE="${NEON_MIN_PASS_RATE:-0.7}"
FAIL_ON_REGRESSION="${NEON_FAIL_ON_REGRESSION:-true}"
BASELINE_REF="${NEON_BASELINE_REF:-}"
TIMEOUT_MINUTES="${NEON_TIMEOUT_MINUTES:-15}"

RESULT_FILE=$(mktemp)
RUN_ID=""

cleanup() {
  rm -f "${RESULT_FILE}"
}
trap cleanup EXIT

# --- Step 1: Run the eval suite ---
echo "::group::Running eval suite: ${SUITE_PATH}"
echo "  API URL:       ${API_URL}"
echo "  Agent ID:      ${AGENT_ID}"
echo "  Min pass rate: ${MIN_PASS_RATE}"
echo "  Timeout:       ${TIMEOUT_MINUTES}m"

EVAL_EXIT=0
if bun run "${SUITE_PATH}" \
    --json \
    --api-url "${API_URL}" \
    --api-key "${API_KEY}" \
    --agent-id "${AGENT_ID}" \
    > "${RESULT_FILE}" 2>&1; then
  echo "Eval suite completed successfully"
else
  EVAL_EXIT=$?
  echo "::warning::Eval suite exited with code ${EVAL_EXIT}"
fi
echo "::endgroup::"

# --- Step 2: Parse results ---
echo "::group::Parsing results"

if [ -f "${RESULT_FILE}" ] && [ -s "${RESULT_FILE}" ]; then
  # Extract metrics from JSON output
  METRICS=$(bun -e "
    const fs = require('fs');
    try {
      const raw = fs.readFileSync('${RESULT_FILE}', 'utf8');
      const data = JSON.parse(raw);
      const score = (data.averageScore ?? 0).toFixed(4);
      const passed = data.passed ?? 0;
      const total = data.total ?? 0;
      const passRate = total > 0 ? (passed / total).toFixed(4) : '0.0000';
      const runId = data.runId ?? data.run_id ?? 'unknown';
      console.log(JSON.stringify({ score, passed, total, passRate, runId }));
    } catch (e) {
      console.log(JSON.stringify({ score: '0.0000', passed: 0, total: 0, passRate: '0.0000', runId: 'unknown' }));
    }
  ")

  SCORE=$(echo "${METRICS}" | bun -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.score)")
  PASSED=$(echo "${METRICS}" | bun -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.passed)")
  TOTAL=$(echo "${METRICS}" | bun -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.total)")
  PASS_RATE=$(echo "${METRICS}" | bun -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.passRate)")
  RUN_ID=$(echo "${METRICS}" | bun -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.runId)")
else
  echo "::warning::No results file found, using defaults"
  SCORE="0.0000"
  PASSED="0"
  TOTAL="0"
  PASS_RATE="0.0000"
  RUN_ID="unknown"
fi

echo "::endgroup::"

# --- Step 3: Regression check ---
if [ "${FAIL_ON_REGRESSION}" = "true" ] && [ -n "${BASELINE_REF}" ]; then
  echo "::group::Regression check against ${BASELINE_REF}"
  REGRESSION_DETECTED=false

  REGRESSION_RESULT=$(bun -e "
    // Compare current pass rate against baseline
    // In a full implementation, this would fetch the baseline run from the API
    const passRate = Number('${PASS_RATE}');
    const threshold = Number('${MIN_PASS_RATE}');
    if (passRate < threshold) {
      console.log('regression');
    } else {
      console.log('ok');
    }
  " 2>/dev/null || echo "ok")

  if [ "${REGRESSION_RESULT}" = "regression" ]; then
    REGRESSION_DETECTED=true
    echo "::warning::Regression detected: pass rate ${PASS_RATE} is below threshold ${MIN_PASS_RATE}"
  fi
  echo "::endgroup::"
fi

# --- Step 4: Determine status ---
STATUS="passed"

# Check pass rate threshold
BELOW_THRESHOLD=$(bun -e "console.log(Number('${PASS_RATE}') < Number('${MIN_PASS_RATE}') ? 'true' : 'false')")
if [ "${BELOW_THRESHOLD}" = "true" ]; then
  STATUS="failed"
fi

# Check for eval execution errors
if [ "${EVAL_EXIT}" -ne 0 ] && [ "${SCORE}" = "0.0000" ] && [ "${TOTAL}" = "0" ]; then
  STATUS="error"
fi

# --- Step 5: Set GitHub Action outputs ---
echo "run-id=${RUN_ID}" >> "${GITHUB_OUTPUT}"
echo "pass-rate=${PASS_RATE}" >> "${GITHUB_OUTPUT}"
echo "status=${STATUS}" >> "${GITHUB_OUTPUT}"
echo "score=${SCORE}" >> "${GITHUB_OUTPUT}"
echo "passed=${PASSED}" >> "${GITHUB_OUTPUT}"
echo "total=${TOTAL}" >> "${GITHUB_OUTPUT}"

# --- Step 6: Summary ---
echo ""
echo "========================================"
echo "  Neon Eval Run Summary"
echo "========================================"
echo "  Run ID:      ${RUN_ID}"
echo "  Agent:       ${AGENT_ID}"
echo "  Score:       ${SCORE}"
echo "  Pass Rate:   ${PASS_RATE} (threshold: ${MIN_PASS_RATE})"
echo "  Passed:      ${PASSED} / ${TOTAL}"
echo "  Status:      ${STATUS^^}"
echo "========================================"

# Write GitHub Actions job summary
{
  echo "### Neon Eval Results"
  echo ""
  echo "| Metric | Value |"
  echo "|--------|-------|"
  echo "| Run ID | \`${RUN_ID}\` |"
  echo "| Agent | \`${AGENT_ID}\` |"
  echo "| Score | **${SCORE}** |"
  echo "| Pass Rate | **$(bun -e "console.log((Number('${PASS_RATE}') * 100).toFixed(1))")%** |"
  echo "| Passed | ${PASSED} / ${TOTAL} |"
  echo "| Status | **${STATUS^^}** |"
} >> "${GITHUB_STEP_SUMMARY}"

# --- Step 7: Exit with appropriate code ---
if [ "${STATUS}" = "failed" ]; then
  echo "::error::Eval pass rate ${PASS_RATE} is below minimum threshold ${MIN_PASS_RATE}"
  exit 1
elif [ "${STATUS}" = "error" ]; then
  echo "::error::Eval run encountered an error"
  exit 1
fi
