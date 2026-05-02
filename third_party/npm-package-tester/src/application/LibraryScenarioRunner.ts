/**
 * Executes library test scenarios in Docker containers
 */

import { LibraryTestScenario, LibraryTestResult, TestSetup } from 'domain/models/types';
import { DockerManager } from './DockerManager';

export class LibraryScenarioRunner {
  constructor(private readonly dockerManager: DockerManager) {}

  /**
   * Run a library test scenario in a Docker container
   */
  async runScenario(
    containerId: string,
    scenario: LibraryTestScenario,
    nodeVersion: string
  ): Promise<LibraryTestResult> {
    const startTime = Date.now();

    try {
      // Setup test environment if needed
      if (scenario.setup) {
        await this.setupTestEnvironment(containerId, scenario.setup);
      }

      // Generate test file with the scenario code
      const testCode = this.generateTestCode(scenario);

      // Write test file to container
      await this.dockerManager.createFile(containerId, '/tmp/test.js', testCode);

      // Execute the test code
      const result = await this.dockerManager.executeCommand(containerId, ['node', '/tmp/test.js']);

      // Validate output
      const passed = this.validateOutput(result.stdout, result.stderr, scenario);

      const duration = Date.now() - startTime;

      return {
        name: scenario.name,
        nodeVersion,
        passed,
        duration,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        error: passed ? undefined : this.getErrorMessage(result, scenario),
        testType: 'ai-generated',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        name: scenario.name,
        nodeVersion,
        passed: false,
        duration,
        stdout: '',
        stderr: (error as Error).message,
        exitCode: 1,
        error: (error as Error).message,
        testType: 'ai-generated',
      };
    }
  }

  /**
   * Setup test environment (create files, directories, install deps)
   */
  private async setupTestEnvironment(containerId: string, setup: TestSetup): Promise<void> {
    // Create directories
    if (setup.directories) {
      for (const dir of setup.directories) {
        try {
          await this.dockerManager.executeCommand(containerId, ['mkdir', '-p', dir]);
        } catch {
          // Directory might already exist
        }
      }
    }

    // Create files
    if (setup.files) {
      for (const file of setup.files) {
        await this.dockerManager.createFile(containerId, file.path, file.content);
      }
    }

    // Install npm dependencies
    if (setup.dependencies && setup.dependencies.length > 0) {
      try {
        await this.dockerManager.executeCommand(containerId, [
          'npm',
          'install',
          ...setup.dependencies,
        ]);
      } catch {
        // Installation might fail, but we'll continue
      }
    }

    // Initialize npm project if needed
    if (setup.initNpm) {
      try {
        await this.dockerManager.executeCommand(containerId, ['npm', 'init', '-y']);
      } catch {
        // Already initialized
      }
    }
  }

  /**
   * Generate executable test code from scenario
   */
  private generateTestCode(scenario: LibraryTestScenario): string {
    return `
// Auto-generated test code for: ${scenario.name}
// Description: ${scenario.description || 'Library test scenario'}

const assert = require('assert');

try {
  ${scenario.importStatement}

  // Test code
  ${scenario.testCode}

  // Mark as passed if no error was thrown
  console.log('TEST_PASSED');
} catch (error) {
  console.error('TEST_ERROR:', error.message);
  process.exit(1);
}
`;
  }

  /**
   * Validate test output against expectations
   */
  private validateOutput(stdout: string, stderr: string, scenario: LibraryTestScenario): boolean {
    // If we expect an error
    if (scenario.expectError) {
      return stderr.length > 0;
    }

    // Check for success marker
    if (stdout.includes('TEST_PASSED')) {
      // If expected output is specified, validate it
      if (scenario.expectedOutput) {
        return this.matchesPattern(stdout, scenario.expectedOutput);
      }
      return true;
    }

    // If expected output is specified, check it
    if (scenario.expectedOutput) {
      return this.matchesPattern(stdout + stderr, scenario.expectedOutput);
    }

    // No error means pass if no expected output
    return stderr.length === 0;
  }

  /**
   * Check if output matches expected pattern
   */
  private matchesPattern(output: string, pattern: string | RegExp): boolean {
    try {
      if (pattern instanceof RegExp) {
        return pattern.test(output);
      } else if (typeof pattern === 'string') {
        return output.includes(pattern);
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Generate error message from test failure
   */
  private getErrorMessage(
    result: { stdout: string; stderr: string; exitCode: number },
    scenario: LibraryTestScenario
  ): string {
    if (result.stderr) {
      return result.stderr.split('\n')[0];
    }

    if (scenario.expectedOutput && !this.matchesPattern(result.stdout, scenario.expectedOutput)) {
      return `Output does not match expected pattern: ${scenario.expectedOutput}`;
    }

    return 'Test failed';
  }
}
