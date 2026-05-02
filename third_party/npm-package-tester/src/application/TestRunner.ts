/**
 * Runs CLI command tests and library tests in Docker containers
 */

import {
  PackageInfo,
  CommandTestResult,
  LibraryTestResult,
  PackageTestSummary,
  TestConfig,
  ProgressEvent,
  TestStage,
  TestEnvironment,
  PackageManager,
  CLICommand,
  LibraryTestScenario,
  LibraryExports,
  TypeValidationReport,
  ValidationIssue,
  ComplianceReport,
  PolicyReport,
} from 'domain/models/types';
import { DockerManager } from './DockerManager';
import { PackageAnalyzer } from './PackageAnalyzer';
import { ScenarioRunner } from './ScenarioRunner';
import { ScenarioGenerator } from 'ai/ScenarioGenerator';
import { LibraryScenarioRunner } from './LibraryScenarioRunner';
import { LibraryScenarioGenerator } from 'ai/LibraryScenarioGenerator';
import { JSDocAnalyzer } from './JSDocAnalyzer';
import { getLogger } from '@kitiumai/logger';
import { deepMerge, compact } from '@kitiumai/utils-ts';
import { ComplianceManager } from './ComplianceManager';
import { PolicyManager } from './PolicyManager';
import {
  createPackageAnalysisError,
  createDockerError,
  createPolicyError,
  extractErrorMetadata,
} from '../utils/errors';

export class TestRunner {
  private readonly dockerManager: DockerManager;
  private readonly packageAnalyzer: PackageAnalyzer;
  private readonly scenarioRunner: ScenarioRunner;
  private readonly scenarioGenerator: ScenarioGenerator;
  private readonly libraryScenarioRunner: LibraryScenarioRunner;
  private readonly libraryScenarioGenerator: LibraryScenarioGenerator;
  private readonly jsDocAnalyzer: JSDocAnalyzer;
  private readonly complianceManager: ComplianceManager;
  private readonly policyManager: PolicyManager;
  private readonly logger = getLogger();

  constructor() {
    this.dockerManager = new DockerManager();
    this.packageAnalyzer = new PackageAnalyzer();
    this.scenarioRunner = new ScenarioRunner(this.dockerManager);
    this.scenarioGenerator = new ScenarioGenerator(this.dockerManager);
    this.libraryScenarioRunner = new LibraryScenarioRunner(this.dockerManager);
    this.libraryScenarioGenerator = new LibraryScenarioGenerator();
    this.jsDocAnalyzer = new JSDocAnalyzer();
    this.complianceManager = new ComplianceManager(this.dockerManager);
    this.policyManager = new PolicyManager();
  }

  /**
   * Test a package with given configuration
   */
  async testPackage(
    packageSource: string,
    config: Partial<TestConfig>,
    onProgress?: (event: ProgressEvent) => void
  ): Promise<PackageTestSummary> {
    const startTime = Date.now();
    const policyViolations: PolicyReport[] = [];
    let compliance: ComplianceReport | undefined;

    this.logger.info('Starting package testing', {
      packageSource,
      nodeVersions: config.nodeVersions?.join(','),
    });

    try {
      // Analyze package
      this.emitProgress(onProgress, {
        stage: TestStage.ANALYZING,
        message: `Analyzing package: ${packageSource}`,
      });

      let packageInfo: PackageInfo;
      try {
        packageInfo = await this.packageAnalyzer.analyze(packageSource);
        this.logger.debug('Package analysis completed', {
          packageName: packageInfo.name,
          version: packageInfo.version,
          commandCount: packageInfo.commands.length,
          isLibrary: packageInfo.type?.isLibrary,
          isCLI: packageInfo.type?.isCLI,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const analysisError = createPackageAnalysisError('analyze', packageSource, errorMsg);
        const errorMetadata = extractErrorMetadata(analysisError);
        this.logger.error('Package analysis failed', { ...errorMetadata });
        throw analysisError;
      }

      this.emitProgress(onProgress, {
        stage: TestStage.DETECTING_COMMANDS,
        message: `Found ${packageInfo.commands.length} CLI command(s)`,
      });

      // Check Docker
      const dockerAvailable = await this.dockerManager.isDockerAvailable();
      if (!dockerAvailable) {
        const dockerError = createDockerError('isDockerAvailable', 'Docker daemon not responding');
        const errorMetadata = extractErrorMetadata(dockerError);
        this.logger.error('Docker is not available', { ...errorMetadata });
        throw dockerError;
      }

      this.logger.debug('Docker is available and ready');

      // Prepare test config
      const testConfig = this.prepareConfig(config);

      const registryPolicy = this.policyManager.validateRegistry(
        testConfig.policy,
        testConfig.npmRegistry
      );
      if (registryPolicy && !registryPolicy.passed) {
        const violations = compact(registryPolicy.violations.map((v) => v.message));
        const policyViolationError = createPolicyError('registry', violations.join('; '), {
          registry: testConfig.npmRegistry,
        });
        const errorMetadata = extractErrorMetadata(policyViolationError);
        this.logger.warn('Registry policy validation failed', {
          ...errorMetadata,
          violations: violations.length,
        });
        throw policyViolationError;
      }

      // Run tests
      const { cliResults, libraryResults, complianceReport, policyReport } = await this.runTests(
        packageInfo,
        testConfig,
        onProgress
      );
      const allResults = [...cliResults, ...libraryResults];
      compliance = complianceReport ?? compliance;
      if (policyReport) {
        policyViolations.push(policyReport);
      }

      // Validate types if library package
      this.emitProgress(onProgress, {
        stage: TestStage.TESTING_COMMAND,
        message: packageInfo.type?.isLibrary ? '🔍 Validating types and documentation...' : '',
      });

      let typeValidation: TypeValidationReport | undefined;
      if (packageInfo.type?.isLibrary && packageInfo.exports) {
        typeValidation = this.performTypeValidation(packageInfo);
      }

      const duration = Date.now() - startTime;

      // Create summary
      const summary: PackageTestSummary = {
        package: packageInfo,
        results: allResults,
        cliResults: cliResults.length > 0 ? cliResults : undefined,
        libraryResults: libraryResults.length > 0 ? libraryResults : undefined,
        typeValidation,
        compliance,
        policy:
          policyViolations.length > 0
            ? {
                passed: policyViolations.every((p) => p.passed),
                violations: policyViolations.flatMap((p) => p.violations),
              }
            : undefined,
        total: allResults.length,
        passed: allResults.filter((r) => r.passed).length,
        failed: allResults.filter((r) => !r.passed).length,
        success: allResults.every((r) => r.passed),
        duration,
      };

      this.emitProgress(onProgress, {
        stage: TestStage.COMPLETED,
        message: `Testing completed: ${summary.passed}/${summary.total} passed`,
      });
      this.logger.info('Package testing completed', {
        packageName: packageInfo.name,
        duration,
        totalTests: summary.total,
        passed: summary.passed,
        failed: summary.failed,
        success: summary.success,
        policyViolations: policyViolations.length,
      });

      return summary;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('Package testing failed', {
        packageSource,
        duration,
        error: errorMsg,
      });
      throw error;
    } finally {
      // Cleanup
      this.emitProgress(onProgress, {
        stage: TestStage.CLEANING_UP,
        message: 'Cleaning up containers',
      });

      try {
        await this.dockerManager.cleanup(config.keepContainers || false);
        this.logger.debug('Cleanup completed');
      } catch (cleanupError) {
        const errorMsg =
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        this.logger.warn('Cleanup failed', { error: errorMsg });
      }
    }
  }

  /**
   * Run all tests (CLI and library)
   */
  private async runTests(
    packageInfo: PackageInfo,
    config: TestConfig,
    onProgress?: (event: ProgressEvent) => void
  ): Promise<{
    cliResults: CommandTestResult[];
    libraryResults: LibraryTestResult[];
    complianceReport?: ComplianceReport;
    policyReport?: PolicyReport;
  }> {
    const cliResults: CommandTestResult[] = [];
    const libraryResults: LibraryTestResult[] = [];
    let complianceReport: ComplianceReport | undefined;
    let policyReport: PolicyReport | undefined;

    // Determine if we should test library exports
    const hasLibrary = packageInfo.type?.isLibrary && packageInfo.exports;
    const hasCLI = packageInfo.commands.length > 0;

    for (const nodeVersion of config.nodeVersions) {
      const baseImage = config.baseImage ?? `node:${nodeVersion}-alpine`;
      policyReport = this.policyManager.evaluate(config.policy, nodeVersion, baseImage);
      if (policyReport && !policyReport.passed) {
        throw new Error(
          `Policy violation: ${policyReport.violations.map((v) => v.message).join('; ')}`
        );
      }

      const environment: TestEnvironment = {
        nodeVersion,
        packageManager: PackageManager.NPM,
        baseImage,
      };

      // Create container
      const container = await this.dockerManager.createTestContainer(
        environment,
        packageInfo.name,
        onProgress
      );

      // Install package with authentication if needed
      await this.dockerManager.installPackage(
        container.id,
        packageInfo.name,
        onProgress,
        config.npmToken,
        config.npmRegistry
      );

      const complianceResult = await this.complianceManager.runCompliance(
        container.id,
        packageInfo.name,
        config.compliance
      );
      complianceReport = complianceResult ?? complianceReport;

      // Generate AI scenarios if configured
      if (config.ai) {
        this.emitProgress(onProgress, {
          stage: TestStage.TESTING_COMMAND,
          message: '🤖 Generating test scenarios with AI...',
        });

        try {
          const aiScenarios = await this.scenarioGenerator.generateScenarios(
            packageInfo,
            config.ai,
            container.id
          );

          this.emitProgress(onProgress, {
            stage: TestStage.TESTING_COMMAND,
            message: `✨ Generated ${aiScenarios.length} AI test scenarios`,
          });

          // Run AI-generated scenarios for CLI if available
          if (hasCLI) {
            for (const scenario of aiScenarios) {
              const command = packageInfo.commands[0]; // Use first command
              const result = await this.scenarioRunner.runScenario(
                container.id,
                packageInfo.name,
                command.name,
                scenario,
                nodeVersion,
                command,
                onProgress
              );
              // Mark as AI-generated test
              cliResults.push({
                ...result,
                scenarioName: scenario.name,
                testType: 'ai-generated' as const,
                args: scenario.args || [],
              });
            }
          }
        } catch (error) {
          this.emitProgress(onProgress, {
            stage: TestStage.ERROR,
            message: `AI scenario generation failed: ${(error as Error).message}`,
          });
          this.logger.error('AI Error:', error);
        }
      }

      // Run default CLI tests if not skipped
      if (!config.skipDefaultTests && hasCLI) {
        // Test each command
        for (const command of packageInfo.commands) {
          this.emitProgress(onProgress, {
            stage: TestStage.TESTING_COMMAND,
            message: `Testing ${command.name} in Node ${nodeVersion}`,
            currentCommand: command.name,
          });

          // Test --help
          const helpResult = await this.testCommand(
            container.id,
            command.name,
            ['--help'],
            nodeVersion,
            command
          );
          cliResults.push({
            ...helpResult,
            scenarioName: `${command.name} --help`,
            testType: 'default' as const,
            args: ['--help'],
          });

          // Test --version
          const versionResult = await this.testCommand(
            container.id,
            command.name,
            ['--version'],
            nodeVersion,
            command
          );
          cliResults.push({
            ...versionResult,
            scenarioName: `${command.name} --version`,
            testType: 'default' as const,
            args: ['--version'],
          });

          // Test no args
          const noArgsResult = await this.testCommand(
            container.id,
            command.name,
            [],
            nodeVersion,
            command
          );
          cliResults.push({
            ...noArgsResult,
            scenarioName: `${command.name} (no args)`,
            testType: 'default' as const,
            args: [],
          });
        }
      }

      // Run library tests if available
      if (hasLibrary && packageInfo.exports) {
        try {
          await this.runLibraryTests(
            packageInfo,
            container.id,
            nodeVersion,
            config,
            libraryResults,
            onProgress
          );
        } catch (error) {
          this.emitProgress(onProgress, {
            stage: TestStage.ERROR,
            message: `Library testing failed: ${(error as Error).message}`,
          });
          this.logger.error('Library test error:', error);
        }
      }
    }

    return { cliResults, libraryResults, complianceReport, policyReport };
  }

  /**
   * Run library tests for a package
   */
  private async runLibraryTests(
    packageInfo: PackageInfo,
    containerId: string,
    nodeVersion: string,
    config: TestConfig,
    libraryResults: LibraryTestResult[],
    onProgress?: (event: ProgressEvent) => void
  ): Promise<void> {
    if (!packageInfo.exports) {
      return;
    }

    // Generate library test scenarios
    let scenarios: LibraryTestScenario[] = [];

    if (config.ai) {
      this.emitProgress(onProgress, {
        stage: TestStage.TESTING_COMMAND,
        message: '🤖 Generating library test scenarios with AI...',
      });

      try {
        scenarios = await this.libraryScenarioGenerator.generateScenarios(
          packageInfo,
          packageInfo.exports,
          config.ai
        );

        this.emitProgress(onProgress, {
          stage: TestStage.TESTING_COMMAND,
          message: `✨ Generated ${scenarios.length} library test scenarios`,
        });
      } catch (error) {
        this.emitProgress(onProgress, {
          stage: TestStage.ERROR,
          message: `AI library scenario generation failed: ${(error as Error).message}`,
        });
        this.logger.error('AI library generation error:', error);
        // Continue without AI scenarios
      }
    } else {
      // Generate basic default library tests (import and instantiate)
      scenarios = this.generateBasicLibraryScenarios(packageInfo, packageInfo.exports);
    }

    // Run library test scenarios
    for (const scenario of scenarios) {
      this.emitProgress(onProgress, {
        stage: TestStage.TESTING_COMMAND,
        message: `Testing library scenario: ${scenario.name}`,
      });

      const result = await this.libraryScenarioRunner.runScenario(
        containerId,
        scenario,
        nodeVersion
      );

      libraryResults.push(result);
    }
  }

  /**
   * Generate basic library test scenarios (default tests without AI)
   */
  private generateBasicLibraryScenarios(
    packageInfo: PackageInfo,
    libraryExports: LibraryExports
  ): LibraryTestScenario[] {
    const scenarios: LibraryTestScenario[] = [];

    // Test default import
    scenarios.push({
      name: 'import-default',
      description: 'Test importing the package',
      importStatement: `const pkg = require('${packageInfo.name}')`,
      testCode: `console.log(typeof pkg); console.log('TEST_PASSED');`,
      expectedOutput: 'object',
      expectError: false,
    });

    // Test named imports if available
    if (libraryExports.namedExports && libraryExports.namedExports.length > 0) {
      const firstExport = libraryExports.namedExports[0];
      scenarios.push({
        name: 'import-named',
        description: `Test importing named export "${firstExport.name}"`,
        importStatement: `const { ${firstExport.name} } = require('${packageInfo.name}')`,
        testCode: `console.log(typeof ${firstExport.name}); console.log('TEST_PASSED');`,
        expectError: false,
      });
    }

    return scenarios;
  }

  /**
   * Test a single command
   */
  private async testCommand(
    containerId: string,
    commandName: string,
    args: string[],
    nodeVersion: string,
    command: CLICommand
  ): Promise<CommandTestResult> {
    const startTime = Date.now();

    try {
      const fullCommand = [commandName, ...args];
      const result = await this.dockerManager.executeCommand(containerId, fullCommand);

      const duration = Date.now() - startTime;

      // Determine if test passed
      const passed = this.isTestPassed(result, args);

      return {
        command,
        nodeVersion,
        passed,
        duration,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        hasHelpOutput: this.hasHelpOutput(result.stdout, result.stderr),
        hasVersionOutput: this.hasVersionOutput(result.stdout, result.stderr),
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
   * Determine if test passed
   */
  private isTestPassed(
    result: { exitCode: number; stdout: string; stderr: string },
    args: string[]
  ): boolean {
    // For --help and --version, exit code 0 is expected
    if (args.includes('--help') || args.includes('--version')) {
      return result.exitCode === 0;
    }

    // For no args, we just check it doesn't crash completely
    // Some CLIs exit with 1 when no args provided (which is acceptable)
    return result.exitCode === 0 || result.exitCode === 1;
  }

  /**
   * Check if output contains help information
   */
  private hasHelpOutput(stdout: string, stderr: string): boolean {
    const output = (stdout + stderr).toLowerCase();
    return (
      output.includes('usage') ||
      output.includes('options') ||
      output.includes('commands') ||
      output.includes('help')
    );
  }

  /**
   * Check if output contains version information
   */
  private hasVersionOutput(stdout: string, stderr: string): boolean {
    const output = (stdout + stderr).toLowerCase();
    // Match version patterns like "1.0.0" or "v1.0.0"
    return /v?\d+\.\d+\.\d+/.test(output);
  }

  /**
   * Prepare test configuration with defaults
   */
  private prepareConfig(partial: Partial<TestConfig>): TestConfig {
    const defaults: TestConfig = {
      package: partial.package ?? '',
      nodeVersions: ['20'],
      parallel: false,
      timeout: 30000,
      keepContainers: false,
      customTests: [],
      scenarios: partial.scenarios,
      skipDefaultTests: false,
      ai: partial.ai,
      npmToken: partial.npmToken,
      npmRegistry: partial.npmRegistry,
      compliance: partial.compliance,
      policy: partial.policy,
      baseImage: partial.baseImage,
    };

    // deepMerge expects a record; cast to and from unknown to satisfy the constraint
    return deepMerge(
      defaults as unknown as Record<string, unknown>,
      partial as unknown as Partial<Record<string, unknown>>
    ) as unknown as TestConfig;
  }

  /**
   * Emit progress event
   */
  private emitProgress(
    callback: ((event: ProgressEvent) => void) | undefined,
    event: ProgressEvent
  ): void {
    if (callback) {
      callback(event);
    }
  }

  /**
   * Perform type validation and documentation analysis
   */
  private performTypeValidation(packageInfo: PackageInfo): TypeValidationReport {
    if (!packageInfo.exports) {
      return {
        valid: true,
        typedExports: 0,
        untypedExports: 0,
        undocumentedExports: 0,
        documentationCoverage: 0,
        issues: [],
      };
    }

    // Analyze JSDoc documentation
    const jsDocAnalysis = this.jsDocAnalyzer.analyzeExports(packageInfo.exports);

    // Build issues list
    const issues: ValidationIssue[] = [];

    // Check documentation coverage
    for (const exportAnalysis of jsDocAnalysis.exports) {
      if (!exportAnalysis.hasJSDoc && !exportAnalysis.hasDescription) {
        issues.push({
          type: 'undocumented',
          exportName: exportAnalysis.name,
          message: `Export "${exportAnalysis.name}" has no documentation`,
          severity: 'info',
        });
      }

      if (exportAnalysis.issues.length > 0) {
        for (const issue of exportAnalysis.issues) {
          issues.push({
            type: issue.severity === 'error' ? 'untyped' : 'undocumented',
            exportName: exportAnalysis.name,
            message: issue.message,
            severity: issue.severity,
          });
        }
      }
    }

    // Count untyped exports (exports without JSDoc or type info)
    const untypedCount = packageInfo.exports.namedExports.filter(
      (e) => !e.jsDoc && !e.signature && !e.description
    ).length;

    return {
      valid: issues.filter((i) => i.severity === 'error').length === 0,
      typedExports: packageInfo.exports.namedExports.length - untypedCount,
      untypedExports: untypedCount,
      undocumentedExports: jsDocAnalysis.summary.undocumented,
      documentationCoverage: jsDocAnalysis.summary.averageCompleteness,
      issues,
    };
  }
}
