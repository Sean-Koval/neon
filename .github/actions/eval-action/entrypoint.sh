#!/usr/bin/env bash
set -euo pipefail

# Neon Eval Action - Entrypoint Script
# Runs an eval suite and outputs results for GitHub Actions.

SUITE_PATH="${SUITE_PATH:?SUITE_PATH is required}"
THRESHOLD="${NEON_THRESHOLD:-0.7}"

echo "::group::Running eval suite: ${SUITE_PATH}"

# Run the eval suite with JSON output
RESULT_FILE=$(mktemp)
if bun run "${SUITE_PATH}" --json > "${RESULT_FILE}" 2>&1; then
  echo "Eval suite completed successfully"
else
  EXIT_CODE=$?
  echo "::warning::Eval suite exited with code ${EXIT_CODE}"
fi

echo "::endgroup::"

# Parse results from JSON output
if [ -f "${RESULT_FILE}" ] && [ -s "${RESULT_FILE}" ]; then
  # Extract metrics from the JSON output
  SCORE=$(bun -e "
    const fs = require('fs');
    try {
      const data = JSON.parse(fs.readFileSync('${RESULT_FILE}', 'utf8'));
      console.log(data.averageScore?.toFixed(4) ?? '0.0000');
    } catch { console.log('0.0000'); }
  ")

  PASSED=$(bun -e "
    const fs = require('fs');
    try {
      const data = JSON.parse(fs.readFileSync('${RESULT_FILE}', 'utf8'));
      console.log(data.passed ?? 0);
    } catch { console.log('0'); }
  ")

  TOTAL=$(bun -e "
    const fs = require('fs');
    try {
      const data = JSON.parse(fs.readFileSync('${RESULT_FILE}', 'utf8'));
      console.log(data.total ?? 0);
    } catch { console.log('0'); }
  ")
else
  echo "::warning::No results file found, using defaults"
  SCORE="0.0000"
  PASSED="0"
  TOTAL="0"
fi

# Determine pass/fail
RESULT=$(bun -e "console.log(Number('${SCORE}') >= Number('${THRESHOLD}') ? 'pass' : 'fail')")

# Set outputs for GitHub Actions
echo "score=${SCORE}" >> "${GITHUB_OUTPUT}"
echo "passed=${PASSED}" >> "${GITHUB_OUTPUT}"
echo "total=${TOTAL}" >> "${GITHUB_OUTPUT}"
echo "result=${RESULT}" >> "${GITHUB_OUTPUT}"

# Print summary
echo ""
echo "================================"
echo "  Eval Results Summary"
echo "================================"
echo "  Score:     ${SCORE}"
echo "  Passed:    ${PASSED} / ${TOTAL}"
echo "  Threshold: ${THRESHOLD}"
echo "  Result:    ${RESULT^^}"
echo "================================"

# Clean up
rm -f "${RESULT_FILE}"

# Fail the step if below threshold
if [ "${RESULT}" = "fail" ]; then
  echo "::error::Eval score ${SCORE} is below threshold ${THRESHOLD}"
  exit 1
fi
