/**
 * Unit tests for ResultFormatter
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ResultFormatter } from 'formatters/ResultFormatter';
import { PackageTestSummary, CLICommand, CommandType, TestStage } from 'domain/models/types';

describe('ResultFormatter', () => {
  let formatter: ResultFormatter;

  beforeEach(() => {
    formatter = new ResultFormatter();
  });

  const mockCommand: CLICommand = {
    name: 'test-cli',
    path: './cli.js',
    type: CommandType.PRIMARY,
  };

  describe('formatSummary', () => {
    it('should format summary with AI-generated tests', () => {
      const summary: PackageTestSummary = {
        package: {
          name: 'test-package',
          version: '1.0.0',
          description: 'Test package',
          commands: [mockCommand],
          dependencies: {},
        },
        results: [
          {
            command: mockCommand,
            nodeVersion: '20',
            passed: true,
            duration: 1500,
            exitCode: 0,
            stdout: 'output',
            stderr: '',
            hasHelpOutput: false,
            hasVersionOutput: false,
            scenarioName: 'basic-scenario',
            testType: 'ai-generated',
            args: ['--input', 'test.txt'],
          },
        ],
        total: 1,
        passed: 1,
        failed: 0,
        success: true,
        duration: 1500,
      };

      const output = formatter.formatSummary(summary);

      expect(output).toContain('test-package');
      expect(output).toContain('1.0.0');
      expect(output).toContain('Test package');
      expect(output).toContain('📋 Test Details');
      expect(output).toContain('🤖 AI-Generated Tests');
      expect(output).toContain('basic-scenario');
      expect(output).toContain('--input test.txt');
      expect(output).toContain('✅ All tests passed!');
    });

    it('should format summary with default tests', () => {
      const summary: PackageTestSummary = {
        package: {
          name: 'test-package',
          version: '1.0.0',
          commands: [mockCommand],
          dependencies: {},
        },
        results: [
          {
            command: mockCommand,
            nodeVersion: '20',
            passed: true,
            duration: 100,
            exitCode: 0,
            stdout: '',
            stderr: '',
            hasHelpOutput: true,
            hasVersionOutput: false,
            scenarioName: 'test-cli --help',
            testType: 'default',
            args: ['--help'],
          },
          {
            command: mockCommand,
            nodeVersion: '20',
            passed: true,
            duration: 50,
            exitCode: 0,
            stdout: '1.0.0',
            stderr: '',
            hasHelpOutput: false,
            hasVersionOutput: true,
            scenarioName: 'test-cli --version',
            testType: 'default',
            args: ['--version'],
          },
        ],
        total: 2,
        passed: 2,
        failed: 0,
        success: true,
        duration: 150,
      };

      const output = formatter.formatSummary(summary);

      expect(output).toContain('🎯 Default Tests');
      expect(output).toContain('test-cli --help');
      expect(output).toContain('test-cli --version');
      expect(output).toContain('Total: 2 tests');
      expect(output).toMatch(/Passed.*2/); // Match with any formatting between
    });

    it('should format summary with custom tests', () => {
      const summary: PackageTestSummary = {
        package: {
          name: 'test-package',
          version: '1.0.0',
          commands: [mockCommand],
          dependencies: {},
        },
        results: [
          {
            command: mockCommand,
            nodeVersion: '20',
            passed: true,
            duration: 300,
            exitCode: 0,
            stdout: 'custom output',
            stderr: '',
            hasHelpOutput: false,
            hasVersionOutput: false,
            scenarioName: 'custom-test-scenario',
            testType: 'custom',
            args: ['custom', 'args'],
          },
        ],
        total: 1,
        passed: 1,
        failed: 0,
        success: true,
        duration: 300,
      };

      const output = formatter.formatSummary(summary);

      expect(output).toContain('🎨 Custom Tests');
      expect(output).toContain('custom-test-scenario');
      expect(output).toContain('300ms'); // Check for duration instead
    });

    it('should format summary with mixed test types', () => {
      const summary: PackageTestSummary = {
        package: {
          name: 'test-package',
          version: '1.0.0',
          commands: [mockCommand],
          dependencies: {},
        },
        results: [
          {
            command: mockCommand,
            nodeVersion: '20',
            passed: true,
            duration: 1000,
            exitCode: 0,
            stdout: '',
            stderr: '',
            hasHelpOutput: false,
            hasVersionOutput: false,
            scenarioName: 'ai-test',
            testType: 'ai-generated',
            args: [],
          },
          {
            command: mockCommand,
            nodeVersion: '20',
            passed: true,
            duration: 100,
            exitCode: 0,
            stdout: '',
            stderr: '',
            hasHelpOutput: true,
            hasVersionOutput: false,
            scenarioName: 'test-cli --help',
            testType: 'default',
            args: ['--help'],
          },
          {
            command: mockCommand,
            nodeVersion: '20',
            passed: true,
            duration: 200,
            exitCode: 0,
            stdout: '',
            stderr: '',
            hasHelpOutput: false,
            hasVersionOutput: false,
            scenarioName: 'custom-test',
            testType: 'custom',
            args: [],
          },
        ],
        total: 3,
        passed: 3,
        failed: 0,
        success: true,
        duration: 1300,
      };

      const output = formatter.formatSummary(summary);

      expect(output).toContain('🤖 AI-Generated Tests');
      expect(output).toContain('🎯 Default Tests');
      expect(output).toContain('🎨 Custom Tests');
      expect(output).toContain('Total: 3 tests');
    });

    it('should show failed tests with error messages', () => {
      const summary: PackageTestSummary = {
        package: {
          name: 'test-package',
          version: '1.0.0',
          commands: [mockCommand],
          dependencies: {},
        },
        results: [
          {
            command: mockCommand,
            nodeVersion: '20',
            passed: false,
            duration: 500,
            exitCode: 1,
            stdout: '',
            stderr: 'Error occurred',
            error: 'Command failed with exit code 1',
            hasHelpOutput: false,
            hasVersionOutput: false,
            scenarioName: 'failing-test',
            testType: 'ai-generated',
            args: ['--fail'],
          },
        ],
        total: 1,
        passed: 0,
        failed: 1,
        success: false,
        duration: 500,
      };

      const output = formatter.formatSummary(summary);

      expect(output).toContain('failing-test');
      expect(output).toContain('Command failed with exit code 1');
      expect(output).toContain('❌ Some tests failed');
      expect(output).toMatch(/Failed.*1/); // Match with any formatting between
    });

    it('should handle tests without scenario names', () => {
      const summary: PackageTestSummary = {
        package: {
          name: 'test-package',
          version: '1.0.0',
          commands: [mockCommand],
          dependencies: {},
        },
        results: [
          {
            command: mockCommand,
            nodeVersion: '20',
            passed: true,
            duration: 100,
            exitCode: 0,
            stdout: '',
            stderr: '',
            hasHelpOutput: false,
            hasVersionOutput: false,
            testType: 'default',
            args: [],
          },
        ],
        total: 1,
        passed: 1,
        failed: 0,
        success: true,
        duration: 100,
      };

      const output = formatter.formatSummary(summary);

      expect(output).toContain('test-cli');
      expect(output).toContain('✓');
    });

    it('should display test arguments correctly', () => {
      const summary: PackageTestSummary = {
        package: {
          name: 'test-package',
          version: '1.0.0',
          commands: [mockCommand],
          dependencies: {},
        },
        results: [
          {
            command: mockCommand,
            nodeVersion: '20',
            passed: true,
            duration: 200,
            exitCode: 0,
            stdout: '',
            stderr: '',
            hasHelpOutput: false,
            hasVersionOutput: false,
            scenarioName: 'complex-args-test',
            testType: 'ai-generated',
            args: ['--input', 'file.txt', '--output', 'result.json', '--verbose'],
          },
        ],
        total: 1,
        passed: 1,
        failed: 0,
        success: true,
        duration: 200,
      };

      const output = formatter.formatSummary(summary);

      expect(output).toContain('--input file.txt --output result.json --verbose');
    });

    it('should handle empty args array', () => {
      const summary: PackageTestSummary = {
        package: {
          name: 'test-package',
          version: '1.0.0',
          commands: [mockCommand],
          dependencies: {},
        },
        results: [
          {
            command: mockCommand,
            nodeVersion: '20',
            passed: true,
            duration: 100,
            exitCode: 0,
            stdout: '',
            stderr: '',
            hasHelpOutput: false,
            hasVersionOutput: false,
            scenarioName: 'no-args-test',
            testType: 'ai-generated',
            args: [],
          },
        ],
        total: 1,
        passed: 1,
        failed: 0,
        success: true,
        duration: 100,
      };

      const output = formatter.formatSummary(summary);

      expect(output).toContain('no-args-test');
      expect(output).toContain('100ms'); // Should show duration
    });
  });

  describe('formatProgress', () => {
    it('should format progress with icon', () => {
      const result = formatter.formatProgress({
        stage: TestStage.ANALYZING,
        message: 'Analyzing package',
      });

      expect(result).toContain('🔍');
      expect(result).toContain('Analyzing package');
    });

    it('should format testing stage', () => {
      const result = formatter.formatProgress({
        stage: TestStage.TESTING_COMMAND,
        message: 'Testing command',
      });

      expect(result).toContain('🧪');
      expect(result).toContain('Testing command');
    });
  });
});
