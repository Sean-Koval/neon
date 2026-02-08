/**
 * CLI Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// We'll test the reporter functions directly since they're exported
import {
  createCLIReporter,
  printError,
  printWarning,
  printInfo,
} from "../cli/reporter.js";
import {
  generateCIOutput,
  formatCIOutput,
  JSON_SCHEMA_VERSION,
  type CIOutput,
} from "../cli/reporters/json-reporter.js";
import { EXIT_CODES } from "../cli/commands/eval.js";
import type { Suite, Test, TestResult, SuiteResult } from "../test/index.js";

describe("CLI Reporter", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createCLIReporter", () => {
    it("creates console reporter by default", () => {
      const reporter = createCLIReporter();
      expect(reporter.onSuiteStart).toBeDefined();
      expect(reporter.onTestStart).toBeDefined();
      expect(reporter.onTestComplete).toBeDefined();
      expect(reporter.onSuiteComplete).toBeDefined();
    });

    it("creates silent reporter when format is silent", () => {
      const reporter = createCLIReporter({ format: "silent" });
      expect(reporter.onSuiteStart).toBeDefined();
      expect(reporter.onTestStart).toBeDefined();
      expect(reporter.onTestComplete).toBeDefined();
      expect(reporter.onSuiteComplete).toBeDefined();
    });

    it("creates JSON reporter when format is json", () => {
      const reporter = createCLIReporter({ format: "json" });
      expect(reporter.onSuiteComplete).toBeDefined();
    });
  });

  describe("console reporter callbacks", () => {
    it("onSuiteStart logs suite info", () => {
      const reporter = createCLIReporter();
      const suite: Suite = {
        name: "test-suite",
        tests: [{ name: "test1", input: {} }],
      };

      reporter.onSuiteStart?.(suite);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("test-suite");
    });

    it("onTestComplete logs pass status for passing test", () => {
      const reporter = createCLIReporter();
      const test: Test = { name: "test1", input: {} };
      const result: TestResult = {
        name: "test1",
        passed: true,
        scores: [],
        durationMs: 100,
      };

      reporter.onTestComplete?.(test, result);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("PASS");
    });

    it("onTestComplete logs fail status for failing test", () => {
      const reporter = createCLIReporter();
      const test: Test = { name: "test1", input: {} };
      const result: TestResult = {
        name: "test1",
        passed: false,
        scores: [],
        durationMs: 100,
        error: "Test failed",
      };

      reporter.onTestComplete?.(test, result);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("FAIL");
      expect(output).toContain("Test failed");
    });

    it("onTestComplete shows scores when enabled", () => {
      const reporter = createCLIReporter({ showScores: true });
      const test: Test = { name: "test1", input: {} };
      const result: TestResult = {
        name: "test1",
        passed: true,
        scores: [{ name: "accuracy", value: 0.85 }],
        durationMs: 100,
      };

      reporter.onTestComplete?.(test, result);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("accuracy");
      expect(output).toContain("85%");
    });
  });

  describe("helper functions", () => {
    it("printError logs red error message", () => {
      printError("Something went wrong");

      expect(consoleErrorSpy).toHaveBeenCalled();
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain("Something went wrong");
    });

    it("printWarning logs yellow warning message", () => {
      printWarning("Be careful");

      expect(consoleWarnSpy).toHaveBeenCalled();
      const output = consoleWarnSpy.mock.calls[0][0];
      expect(output).toContain("Be careful");
    });

    it("printInfo logs cyan info message", () => {
      printInfo("Information");

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain("Information");
    });
  });
});

describe("Suite extraction", () => {
  // Test the isSuite type guard logic
  const validSuite: Suite = {
    name: "test-suite",
    tests: [{ name: "test1", input: {} }],
  };

  it("identifies valid suite objects", () => {
    expect(validSuite.name).toBe("test-suite");
    expect(validSuite.tests.length).toBe(1);
  });

  it("rejects non-suite objects", () => {
    const notASuite = { foo: "bar" };
    expect("tests" in notASuite).toBe(false);
  });
});

describe("JSON Reporter", () => {
  const createMockSuiteResult = (
    name: string,
    tests: TestResult[]
  ): SuiteResult => {
    const passed = tests.filter((t) => t.passed).length;
    const failed = tests.length - passed;
    let totalScore = 0;
    let scoreCount = 0;
    for (const test of tests) {
      for (const score of test.scores) {
        totalScore += score.value;
        scoreCount++;
      }
    }

    return {
      name,
      results: tests,
      summary: {
        total: tests.length,
        passed,
        failed,
        passRate: tests.length > 0 ? passed / tests.length : 0,
        avgScore: scoreCount > 0 ? totalScore / scoreCount : 0,
      },
      durationMs: 1000,
    };
  };

  describe("generateCIOutput", () => {
    it("includes schema version", () => {
      const result = generateCIOutput([]);

      expect(result.version).toBe(JSON_SCHEMA_VERSION);
    });

    it("includes ISO timestamp", () => {
      const result = generateCIOutput([]);

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("passes when all tests pass threshold", () => {
      const suiteResult = createMockSuiteResult("test-suite", [
        {
          name: "test-1",
          passed: true,
          scores: [{ name: "accuracy", value: 0.9 }],
          durationMs: 100,
        },
      ]);

      const result = generateCIOutput([suiteResult], {
        thresholdConfig: { global: 0.7 },
      });

      expect(result.passed).toBe(true);
      expect(result.suites[0].passed).toBe(true);
      expect(result.suites[0].tests[0].passed).toBe(true);
    });

    it("fails when any test fails threshold", () => {
      const suiteResult = createMockSuiteResult("test-suite", [
        {
          name: "test-1",
          passed: true,
          scores: [{ name: "accuracy", value: 0.5 }],
          durationMs: 100,
        },
      ]);

      const result = generateCIOutput([suiteResult], {
        thresholdConfig: { global: 0.7 },
      });

      expect(result.passed).toBe(false);
      expect(result.suites[0].tests[0].passed).toBe(false);
    });

    it("includes threshold in score results", () => {
      const suiteResult = createMockSuiteResult("test-suite", [
        {
          name: "test-1",
          passed: true,
          scores: [{ name: "accuracy", value: 0.85 }],
          durationMs: 100,
        },
      ]);

      const result = generateCIOutput([suiteResult], {
        thresholdConfig: { global: 0.8 },
      });

      expect(result.threshold).toBe(0.8);
      expect(result.suites[0].tests[0].scores[0].threshold).toBe(0.8);
    });

    it("aggregates summary across suites", () => {
      const suite1 = createMockSuiteResult("suite-1", [
        { name: "t1", passed: true, scores: [{ name: "s", value: 0.8 }], durationMs: 100 },
        { name: "t2", passed: false, scores: [{ name: "s", value: 0.5 }], durationMs: 100 },
      ]);
      const suite2 = createMockSuiteResult("suite-2", [
        { name: "t3", passed: true, scores: [{ name: "s", value: 0.9 }], durationMs: 100 },
      ]);

      const result = generateCIOutput([suite1, suite2], {
        thresholdConfig: { global: 0.7 },
      });

      expect(result.summary.totalSuites).toBe(2);
      expect(result.summary.totalTests).toBe(3);
      expect(result.summary.passed).toBe(2); // t1 and t3 pass based on original passed status
      expect(result.summary.failed).toBe(1);
    });

    it("handles empty suites array", () => {
      const result = generateCIOutput([]);

      expect(result.passed).toBe(true);
      expect(result.suites).toEqual([]);
      expect(result.summary.totalSuites).toBe(0);
      expect(result.summary.totalTests).toBe(0);
    });

    it("includes error in test results", () => {
      const suiteResult = createMockSuiteResult("test-suite", [
        {
          name: "test-1",
          passed: false,
          scores: [],
          durationMs: 100,
          error: "Test execution failed",
        },
      ]);

      const result = generateCIOutput([suiteResult]);

      expect(result.suites[0].tests[0].error).toBe("Test execution failed");
    });

    it("includes traceId when available", () => {
      const suiteResult = createMockSuiteResult("test-suite", [
        {
          name: "test-1",
          passed: true,
          scores: [{ name: "s", value: 0.8 }],
          durationMs: 100,
          traceId: "trace-123",
        },
      ]);

      const result = generateCIOutput([suiteResult]);

      expect(result.suites[0].tests[0].traceId).toBe("trace-123");
    });
  });

  describe("formatCIOutput", () => {
    it("outputs single line by default", () => {
      const output: CIOutput = {
        version: "1.0.0",
        timestamp: "2024-01-15T10:00:00.000Z",
        passed: true,
        threshold: 0.7,
        suites: [],
        summary: {
          totalSuites: 0,
          totalTests: 0,
          passed: 0,
          failed: 0,
          passRate: 0,
          avgScore: 0,
          durationMs: 0,
        },
      };

      const json = formatCIOutput(output);

      expect(json).not.toContain("\n");
    });

    it("outputs pretty JSON when requested", () => {
      const output: CIOutput = {
        version: "1.0.0",
        timestamp: "2024-01-15T10:00:00.000Z",
        passed: true,
        threshold: 0.7,
        suites: [],
        summary: {
          totalSuites: 0,
          totalTests: 0,
          passed: 0,
          failed: 0,
          passRate: 0,
          avgScore: 0,
          durationMs: 0,
        },
      };

      const json = formatCIOutput(output, true);

      expect(json).toContain("\n");
      expect(json).toContain("  ");
    });

    it("is valid JSON", () => {
      const output: CIOutput = {
        version: "1.0.0",
        timestamp: "2024-01-15T10:00:00.000Z",
        passed: false,
        threshold: 0.8,
        suites: [{
          name: "suite",
          passed: false,
          tests: [{
            name: "test",
            passed: false,
            scores: [{ name: "score", value: 0.5, passed: false, threshold: 0.8 }],
            durationMs: 100,
          }],
          summary: { total: 1, passed: 0, failed: 1, passRate: 0, avgScore: 0.5 },
          durationMs: 100,
        }],
        summary: {
          totalSuites: 1,
          totalTests: 1,
          passed: 0,
          failed: 1,
          passRate: 0,
          avgScore: 0.5,
          durationMs: 100,
        },
      };

      const json = formatCIOutput(output);
      const parsed = JSON.parse(json);

      expect(parsed.passed).toBe(false);
      expect(parsed.threshold).toBe(0.8);
    });
  });
});

describe("Exit codes", () => {
  it("SUCCESS is 0", () => {
    expect(EXIT_CODES.SUCCESS).toBe(0);
  });

  it("FAILURE is 1", () => {
    expect(EXIT_CODES.FAILURE).toBe(1);
  });

  it("ERROR is 2", () => {
    expect(EXIT_CODES.ERROR).toBe(2);
  });
});
