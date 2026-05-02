#!/usr/bin/env node

/**
 * CLI interface for npm-package-tester
 */

import { Command } from 'commander';
import { getLogger, initializeLogger, LogLevel } from '@kitiumai/logger';
import { TestRunner } from 'application/TestRunner';
import { ResultFormatter } from 'formatters/ResultFormatter';
import { TestConfig } from 'domain/models/types';

// Initialize logger with minimal config
initializeLogger({
  serviceName: 'npm-package-tester',
  environment:
    (process.env['NODE_ENV'] as 'development' | 'staging' | 'production') ?? 'development',
  logLevel: (process.env['NPT_LOG_LEVEL'] as LogLevel | undefined) ?? LogLevel.INFO,
  loki: {
    enabled: false,
    host: 'localhost',
    port: 3100,
    protocol: 'http',
    labels: {
      service: 'npm-package-tester',
      environment: 'development',
    },
    batchSize: 250,
    interval: 5000,
    timeout: 15000,
  },
  enableConsoleTransport: true,
  enableFileTransport: false,
  fileLogPath: './logs',
  maxFileSize: '25m',
  maxFiles: 5,
  includeTimestamp: true,
  includeMeta: true,
});

const logger = getLogger();
const program = new Command();

interface CliOptions {
  node: string;
  parallel?: boolean;
  keepContainers?: boolean;
  timeout: string;
  npmToken?: string;
  npmRegistry?: string;
  aiProvider?: string;
  aiToken?: string;
  aiModel?: string;
  verbose?: boolean;
  help?: boolean;
  version?: boolean;
  baseImage?: string;
  allowedRegistry?: string;
  complianceArtifacts?: string;
  audit?: boolean;
  sbom?: boolean;
  licenseCheck?: boolean;
}

program
  .name('npt')
  .description('Test npm packages by discovering and running CLI commands in Docker')
  .version('0.1.0');

program
  .command('test <package>')
  .description('Test an npm package or local directory')
  .option('-n, --node <versions>', 'Node versions to test (comma-separated)', '20')
  .option('-p, --parallel', 'Run tests in parallel', false)
  .option('-k, --keep-containers', 'Keep containers after test', false)
  .option('-t, --timeout <ms>', 'Timeout per test in milliseconds', '30000')
  .option('--npm-token <token>', 'npm authentication token for private packages')
  .option('--npm-registry <url>', 'Custom npm registry URL')
  .option('--no-help', 'Skip --help tests')
  .option('--no-version', 'Skip --version tests')
  .option('--ai-provider <provider>', 'AI provider (anthropic, openai, google, groq)')
  .option('--ai-token <token>', 'AI API token/key')
  .option('--ai-model <model>', 'AI model name (optional, auto-detects best)')
  .option('--base-image <image>', 'Custom base Docker image to use for tests')
  .option('--allowed-registry <url>', 'Enforce a single allowed registry')
  .option(
    '--compliance-artifacts <dir>',
    'Directory to persist compliance artifacts inside container'
  )
  .option('--no-audit', 'Disable vulnerability scan')
  .option('--no-sbom', 'Disable SBOM generation')
  .option('--no-license-check', 'Disable license checks')
  .option('-v, --verbose', 'Verbose output')
  .action(async (packageSource: string, options: CliOptions) => {
    logger.info('Starting tests...');
    let currentStage = '';

    try {
      const testRunner = new TestRunner();
      const formatter = new ResultFormatter();

      // Build AI config if provided
      let aiConfig;
      if (options.aiProvider && options.aiToken) {
        aiConfig = {
          provider: options.aiProvider,
          apiKey: options.aiToken,
          model: options.aiModel,
        };
      }

      const config: Partial<TestConfig> = {
        package: packageSource,
        nodeVersions: options.node.split(',').map((v: string) => v.trim()),
        parallel: options.parallel,
        keepContainers: options.keepContainers,
        timeout: parseInt(options.timeout, 10),
        skipDefaultTests: options.aiProvider ? true : false, // Skip default tests if using AI
        ai: aiConfig,
        npmToken: options.npmToken,
        npmRegistry: options.npmRegistry,
        baseImage: options.baseImage,
        compliance: {
          enabled: true,
          sbom: options.sbom ?? true,
          audit: options.audit ?? true,
          licenseCheck: options.licenseCheck ?? true,
          artifactDir: options.complianceArtifacts,
        },
        policy: {
          allowedRegistries: options.allowedRegistry ? [options.allowedRegistry] : undefined,
        },
      };

      const result = await testRunner.testPackage(packageSource, config, (event) => {
        // Update logger with progress
        if (options.verbose) {
          if (event.stage !== currentStage) {
            if (currentStage) {
              // Previous stage completed
            }
            currentStage = event.stage;
            logger.info(formatter.formatProgress(event));
          } else {
            // logger.info(formatter.formatProgress(event));
          }
        } else {
          logger.info(event.message);
        }
      });

      // spinner.stop();

      // Check if no tests were run
      if (result.total === 0) {
        logger.warn('⚠️  No tests were executed');

        logger.info('Package information:');
        logger.info(`  Name: ${result.package.name}`);
        logger.info(`  Version: ${result.package.version}`);

        if (result.package.type?.isCLI) {
          logger.info('🔧 CLI Package detected, but no CLI commands found');
        } else if (result.package.type?.isLibrary) {
          logger.info('📚 Library Package detected');
          logger.info(
            '   Run with --ai-provider <provider> --ai-token <token> for AI-powered library testing'
          );
        } else {
          logger.info('📚 Tip: This package has no detectable CLI commands or library exports');
          logger.info('   • For CLI packages, ensure it has a "bin" field in package.json');
          logger.info('   • For library packages, ensure it has a "main" or "exports" field');
        }

        process.exit(0);
      }

      // Display results
      logger.info(formatter.formatSummary(result));

      // Exit with appropriate code
      process.exit(result.success ? 0 : 1);
    } catch (error) {
      logger.error('Test failed');
      logger.error(`Error: ${(error as Error).message}`);

      if (options.verbose && (error as Error).stack) {
        logger.debug((error as Error).stack || '');
      }

      process.exit(1);
    }
  });

program
  .command('analyze <package>')
  .description('Analyze a package to see detected CLI commands')
  .action(async (packageSource: string) => {
    logger.info('Analyzing package...');

    try {
      const { PackageAnalyzer: packageAnalyzerClass } = await import(
        '../application/PackageAnalyzer'
      );
      const analyzer = new packageAnalyzerClass();

      const packageInfo = await analyzer.analyze(packageSource);

      logger.info(`Analyzed ${packageInfo.name}`);

      logger.info('📦 Package Information');
      logger.info('─'.repeat(50));
      logger.info(`  Name: ${packageInfo.name}`);
      logger.info(`  Version: ${packageInfo.version}`);
      if (packageInfo.description) {
        logger.info(`  Description: ${packageInfo.description}`);
      }

      logger.info('🔧 CLI Commands');
      logger.info('─'.repeat(50));

      if (packageInfo.commands.length === 0) {
        logger.warn('⚠️  No CLI commands detected');
        if (packageInfo.type?.isLibrary) {
          logger.info('📚 This is a library package (has exports or main field)');
          logger.info('   Use: npt test <package> for automated testing');
        } else {
          logger.info('If you believe this is a CLI package, check that:');
          logger.info('  • The package has a "bin" field in package.json');
          logger.info('  • The "bin" field points to valid executable files');
        }
      } else {
        packageInfo.commands.forEach((cmd) => {
          logger.info(`  ${cmd.name} [${cmd.type}]`);
          logger.info(`    Path: ${cmd.path}`);
        });
      }

      // Display library exports if available
      if (packageInfo.exports) {
        logger.info('📚 Library Exports');
        logger.info('─'.repeat(50));

        if (packageInfo.exports.hasDefaultExport) {
          logger.info(`  default (${packageInfo.exports.defaultExportType || 'unknown'})`);
        }

        if (packageInfo.exports.namedExports && packageInfo.exports.namedExports.length > 0) {
          logger.info('  Named exports:');
          for (const exp of packageInfo.exports.namedExports) {
            // Format the export with type and description
            let exportLine = `    ${exp.name} [${exp.type}]`;

            // Add signature for functions
            if (exp.signature) {
              exportLine += ` ${exp.signature}`;
            }

            // Add description
            if (exp.description) {
              exportLine += ` - ${exp.description}`;
            }

            logger.info(exportLine);

            // Show methods for classes
            if (exp.methods && exp.methods.length > 0) {
              logger.info('      Methods:');
              for (const method of exp.methods) {
                const methodLine = `        ${method.name}${method.signature ? ` ${method.signature}` : ''}${method.description ? ` - ${method.description}` : ''}`;
                logger.info(methodLine);
              }
            }

            // Show properties for types/interfaces
            if (exp.properties && exp.properties.length > 0) {
              logger.info('      Properties:');
              for (const prop of exp.properties) {
                const propLine = `        ${prop.name}${prop.optional ? '?' : ''}: ${prop.type || 'unknown'}${prop.description ? ` - ${prop.description}` : ''}`;
                logger.info(propLine);
              }
            }
          }
        }

        if (packageInfo.exports.typeDefinitions) {
          logger.info('✓ TypeScript type definitions available');
          if (packageInfo.exports.typesPath) {
            logger.info(`    Path: ${packageInfo.exports.typesPath}`);
          }
        }
      }

      // Display package type summary
      if (packageInfo.type) {
        logger.info('📊 Package Type');
        logger.info('─'.repeat(50));

        if (packageInfo.type.isCLI) {
          logger.info('✓ CLI Package');
        }

        if (packageInfo.type.isLibrary) {
          logger.info('✓ Library Package');
        }

        if (packageInfo.type.hasNoExports) {
          logger.warn('⚠️  No testable exports found');
        }
      }
    } catch (error) {
      logger.error('Analysis failed');
      logger.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program.parse();
