/**
 * Executes test scenarios with setup and validation
 */

import { DockerManager } from './DockerManager';
import {
  TestScenario,
  CommandTestResult,
  CLICommand,
  ProgressEvent,
  TestStage,
} from 'domain/models/types';

export class ScenarioRunner {
  private readonly dockerManager: DockerManager;

  constructor(dockerManager: DockerManager) {
    this.dockerManager = dockerManager;
  }

  /**
   * Run a test scenario
   */
  async runScenario(
    containerId: string,
    _packageName: string,
    commandName: string,
    scenario: TestScenario,
    nodeVersion: string,
    command: CLICommand,
    onProgress?: (event: ProgressEvent) => void
  ): Promise<CommandTestResult> {
    const startTime = Date.now();

    try {
      // Setup phase
      if (scenario.setup) {
        if (onProgress) {
          onProgress({
            stage: TestStage.TESTING_COMMAND,
            message: `Setting up scenario: ${scenario.name}`,
            currentCommand: commandName,
          });
        }

        await this.setupScenario(containerId, scenario.setup);
      }

      // Execute command
      if (onProgress) {
        onProgress({
          stage: TestStage.TESTING_COMMAND,
          message: `Running scenario: ${scenario.name}`,
          currentCommand: commandName,
        });
      }

      const fullCommand = [scenario.command, ...(scenario.args || [])];
      const result = await this.dockerManager.executeCommand(containerId, fullCommand);

      // Validate results
      const validationResult = await this.validateScenario(containerId, scenario, result);

      const duration = Date.now() - startTime;

      return {
        command,
        nodeVersion,
        passed: validationResult.passed,
        duration,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        error: validationResult.error,
        hasHelpOutput: false,
        hasVersionOutput: false,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        command,
        nodeVersion,
        passed: false,
        duration,
        exitCode: 1,
        stdout: '',
        stderr: (error as Error).message,
        error: (error as Error).message,
        hasHelpOutput: false,
        hasVersionOutput: false,
      };
    }
  }

  /**
   * Setup test scenario environment
   */
  private async setupScenario(containerId: string, setup: TestScenario['setup']): Promise<void> {
    if (!setup) {
      return;
    }

    // Create directories
    if (setup.directories) {
      for (const dir of setup.directories) {
        await this.dockerManager.createDirectory(containerId, `/test/${dir}`);
      }
    }

    // Create files
    if (setup.files) {
      for (const file of setup.files) {
        const filePath = `/test/${file.path}`;
        // Ensure parent directory exists
        const parentDir = filePath.substring(0, filePath.lastIndexOf('/'));
        if (parentDir !== '/test') {
          await this.dockerManager.createDirectory(containerId, parentDir);
        }
        await this.dockerManager.createFile(containerId, filePath, file.content);
      }
    }

    // Initialize npm project
    if (setup.initNpm) {
      await this.dockerManager.executeCommand(containerId, ['sh', '-c', 'cd /test && npm init -y']);
    }

    // Install dependencies
    if (setup.dependencies && setup.dependencies.length > 0) {
      const deps = setup.dependencies.join(' ');
      await this.dockerManager.executeCommand(containerId, [
        'sh',
        '-c',
        `cd /test && npm install ${deps}`,
      ]);
    }
  }

  /**
   * Validate scenario results
   */
  private async validateScenario(
    containerId: string,
    scenario: TestScenario,
    result: { exitCode: number; stdout: string; stderr: string }
  ): Promise<{ passed: boolean; error?: string }> {
    const validation = scenario.validate;
    const errors: string[] = [];

    // Check exit code
    const expectedExitCode = validation.exitCode ?? 0;
    if (result.exitCode !== expectedExitCode) {
      errors.push(`Expected exit code ${expectedExitCode}, got ${result.exitCode}`);
    }

    // Check stdout patterns
    if (validation.stdout) {
      for (const pattern of validation.stdout) {
        if (typeof pattern === 'string') {
          if (!result.stdout.includes(pattern)) {
            errors.push(`Stdout missing expected text: "${pattern}"`);
          }
        } else {
          if (!pattern.test(result.stdout)) {
            errors.push(`Stdout doesn't match pattern: ${pattern}`);
          }
        }
      }
    }

    // Check stderr patterns
    if (validation.stderr) {
      for (const pattern of validation.stderr) {
        if (typeof pattern === 'string') {
          if (!result.stderr.includes(pattern)) {
            errors.push(`Stderr missing expected text: "${pattern}"`);
          }
        } else {
          if (!pattern.test(result.stderr)) {
            errors.push(`Stderr doesn't match pattern: ${pattern}`);
          }
        }
      }
    }

    // Check files exist
    if (validation.filesExist) {
      for (const filePath of validation.filesExist) {
        const exists = await this.dockerManager.fileExists(containerId, `/test/${filePath}`);
        if (!exists) {
          errors.push(`Expected file not found: ${filePath}`);
        }
      }
    }

    // Check files don't exist
    if (validation.filesNotExist) {
      for (const filePath of validation.filesNotExist) {
        const exists = await this.dockerManager.fileExists(containerId, `/test/${filePath}`);
        if (exists) {
          errors.push(`File should not exist: ${filePath}`);
        }
      }
    }

    // Check file contents
    if (validation.fileContents) {
      for (const fileCheck of validation.fileContents) {
        try {
          const content = await this.dockerManager.readFile(containerId, `/test/${fileCheck.path}`);

          // Check exact match
          if (fileCheck.equals !== undefined) {
            if (content.trim() !== fileCheck.equals.trim()) {
              errors.push(`File ${fileCheck.path} content doesn't match expected`);
            }
          }

          // Check contains patterns
          if (fileCheck.contains) {
            for (const pattern of fileCheck.contains) {
              if (typeof pattern === 'string') {
                if (!content.includes(pattern)) {
                  errors.push(`File ${fileCheck.path} missing expected text: "${pattern}"`);
                }
              } else {
                if (!pattern.test(content)) {
                  errors.push(`File ${fileCheck.path} doesn't match pattern: ${pattern}`);
                }
              }
            }
          }

          // Check not contains patterns
          if (fileCheck.notContains) {
            for (const pattern of fileCheck.notContains) {
              if (typeof pattern === 'string') {
                if (content.includes(pattern)) {
                  errors.push(`File ${fileCheck.path} contains unexpected text: "${pattern}"`);
                }
              } else {
                if (pattern.test(content)) {
                  errors.push(`File ${fileCheck.path} matches unexpected pattern: ${pattern}`);
                }
              }
            }
          }
        } catch (error) {
          errors.push(`Failed to read file ${fileCheck.path}: ${(error as Error).message}`);
        }
      }
    }

    if (errors.length > 0) {
      return {
        passed: false,
        error: errors.join('; '),
      };
    }

    return { passed: true };
  }
}
