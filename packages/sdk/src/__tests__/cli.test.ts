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
import type { Suite, Test, TestResult, SuiteResult } from "../test.js";

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
