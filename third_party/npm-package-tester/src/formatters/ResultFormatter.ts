/**
 * Formats test results for CLI output
 */

import chalk from 'chalk';
import {
  PackageTestSummary,
  CommandTestResult,
  ProgressEvent,
  TypeValidationReport,
  ComplianceReport,
  PolicyReport,
} from 'domain/models/types';

export class ResultFormatter {
  /**
   * Format progress event
   */
  formatProgress(event: ProgressEvent): string {
    const icon = this.getStageIcon(event.stage);
    return `${icon} ${event.message}`;
  }

  /**
   * Format complete test summary
   */
  formatSummary(summary: PackageTestSummary): string {
    const lines: string[] = [];

    lines.push('');
    lines.push(chalk.bold('📦 Package: ') + chalk.cyan(summary.package.name));
    lines.push(chalk.gray(`   Version: ${summary.package.version}`));
    if (summary.package.description) {
      lines.push(chalk.gray(`   ${summary.package.description}`));
    }
    lines.push('');

    // Group results by Node version (only CLI tests)
    const cliResults = summary.results.filter((r): r is CommandTestResult => 'command' in r);
    const byNodeVersion = this.groupByNodeVersion(cliResults);

    for (const [nodeVersion, results] of Object.entries(byNodeVersion)) {
      lines.push(chalk.bold(`🐳 Node ${nodeVersion}`));

      for (const result of results) {
        lines.push(this.formatTestResult(result));
      }

      lines.push('');
    }

    // Summary
    lines.push(chalk.bold('📊 Summary'));
    lines.push(chalk.gray('─'.repeat(50)));
    lines.push(`  Total: ${summary.total} tests`);
    lines.push(`  ${chalk.green('Passed')}: ${summary.passed}`);
    lines.push(`  ${chalk.red('Failed')}: ${summary.failed}`);
    lines.push(`  Duration: ${summary.duration}ms`);
    lines.push('');

    // Detailed test breakdown
    lines.push(chalk.bold('📋 Test Details'));
    lines.push(chalk.gray('─'.repeat(50)));
    lines.push('');

    // Separate CLI and library tests
    const inferredCliResults = summary.results.filter(
      (result): result is CommandTestResult => 'command' in result
    );
    const cliTests = summary.cliResults ?? inferredCliResults;
    const libraryTests = summary.libraryResults ?? [];

    // CLI Tests Section
    if (cliTests.length > 0) {
      lines.push(chalk.bold.blue('  🔧 CLI Tests'));

      // Group CLI tests by type
      const cliAiTests = cliTests.filter((r) => r.testType === 'ai-generated');
      const cliDefaultTests = cliTests.filter((r) => r.testType === 'default');
      const cliCustomTests = cliTests.filter((r) => r.testType === 'custom');

      if (cliDefaultTests.length > 0) {
        lines.push(chalk.bold.yellow('    🎯 Default Tests'));
        for (const test of cliDefaultTests) {
          const icon = test.passed ? chalk.green('    ✓') : chalk.red('    ✗');
          lines.push(
            `    ${icon} ${test.scenarioName || (test as CommandTestResult).command.name} ${chalk.gray(`(${test.duration}ms)`)}`
          );
          if (!test.passed && test.error) {
            lines.push(`        ${chalk.red(test.error)}`);
          }
        }
      }

      if (cliAiTests.length > 0) {
        lines.push(chalk.bold.cyan('    🤖 AI-Generated Tests'));
        for (const test of cliAiTests) {
          const icon = test.passed ? chalk.green('    ✓') : chalk.red('    ✗');
          const args =
            (test as CommandTestResult).args && (test as CommandTestResult).args!.length > 0
              ? ` ${(test as CommandTestResult).args!.join(' ')}`
              : '';
          lines.push(
            `    ${icon} ${test.scenarioName || (test as CommandTestResult).command.name}${args} ${chalk.gray(`(${test.duration}ms)`)}`
          );
          if (!test.passed && test.error) {
            lines.push(`        ${chalk.red(test.error)}`);
          }
        }
      }

      if (cliCustomTests.length > 0) {
        lines.push(chalk.bold.magenta('    🎨 Custom Tests'));
        for (const test of cliCustomTests) {
          const icon = test.passed ? chalk.green('    ✓') : chalk.red('    ✗');
          lines.push(
            `    ${icon} ${test.scenarioName || (test as CommandTestResult).command.name} ${chalk.gray(`(${test.duration}ms)`)}`
          );
          if (!test.passed && test.error) {
            lines.push(`        ${chalk.red(test.error)}`);
          }
        }
      }

      lines.push('');
    }

    // Library Tests Section
    if (libraryTests.length > 0) {
      lines.push(chalk.bold.green('  📚 Library Tests'));

      // Group library tests by type
      const libAiTests = libraryTests.filter((r) => r.testType === 'ai-generated');
      const libDefaultTests = libraryTests.filter((r) => r.testType === 'library');

      if (libDefaultTests.length > 0) {
        lines.push(chalk.bold.yellow('    🎯 Default Tests'));
        for (const test of libDefaultTests) {
          const icon = test.passed ? chalk.green('    ✓') : chalk.red('    ✗');
          lines.push(`    ${icon} ${test.name} ${chalk.gray(`(${test.duration}ms)`)}`);
          if (!test.passed && test.error) {
            lines.push(`        ${chalk.red(test.error)}`);
          }
        }
      }

      if (libAiTests.length > 0) {
        lines.push(chalk.bold.cyan('    🤖 AI-Generated Tests'));
        for (const test of libAiTests) {
          const icon = test.passed ? chalk.green('    ✓') : chalk.red('    ✗');
          lines.push(`    ${icon} ${test.name} ${chalk.gray(`(${test.duration}ms)`)}`);
          if (!test.passed && test.error) {
            lines.push(`        ${chalk.red(test.error)}`);
          }
        }
      }

      lines.push('');
    }

    // Type validation results
    if (summary.typeValidation) {
      lines.push(chalk.bold('🔍 Type Validation & Documentation'));
      lines.push(chalk.gray('─'.repeat(50)));
      lines.push(this.formatTypeValidation(summary.typeValidation));
      lines.push('');
    }

    if (summary.policy) {
      lines.push(chalk.bold('🛡️ Policy Checks'));
      lines.push(chalk.gray('─'.repeat(50)));
      lines.push(this.formatPolicy(summary.policy));
      lines.push('');
    }

    if (summary.compliance) {
      lines.push(chalk.bold('📜 Compliance & Security'));
      lines.push(chalk.gray('─'.repeat(50)));
      lines.push(this.formatCompliance(summary.compliance));
      lines.push('');
    }

    // Final result
    if (summary.success) {
      lines.push(chalk.green.bold('✅ All tests passed!'));
    } else {
      lines.push(chalk.red.bold('❌ Some tests failed'));
    }

    lines.push('');

    return lines.join('\n');
  }

  /**
   * Format individual test result
   */
  private formatTestResult(result: CommandTestResult): string {
    const icon = result.passed ? chalk.green('✓') : chalk.red('✗');
    const commandDesc = this.getCommandDescription(result);
    const duration = chalk.gray(`(${result.duration}ms)`);

    let line = `  ${icon} ${commandDesc} ${duration}`;

    // Add extra info for failed tests
    if (!result.passed && result.error) {
      line += `\n    ${chalk.red(result.error)}`;
    }

    return line;
  }

  private formatCompliance(report: ComplianceReport): string {
    const lines: string[] = [];
    if (report.sbom) {
      lines.push(`  SBOM generated with ${report.sbom.components.length} components`);
    }
    if (report.vulnerabilities) {
      const total = report.vulnerabilities.findings.length;
      lines.push(`  Vulnerability scan: ${total === 0 ? 'no findings' : `${total} finding(s)`}`);
    }
    if (report.licenses) {
      lines.push(`  License entries: ${report.licenses.issues.length}`);
    }

    return lines.join('\n');
  }

  private formatPolicy(report: PolicyReport): string {
    if (report.passed) {
      return '  ✅ All policy checks passed';
    }

    const violations = report.violations.map((v) => `  ❌ ${v.rule}: ${v.message}`);
    return violations.join('\n');
  }

  /**
   * Get command description
   */
  private getCommandDescription(result: CommandTestResult): string {
    const cmd = result.command.name;

    // Determine what was tested
    if (result.hasHelpOutput && result.stdout.includes('--help')) {
      return `${cmd} --help`;
    } else if (result.hasVersionOutput) {
      return `${cmd} --version`;
    } else if (result.stdout === '' && result.stderr === '') {
      return `${cmd} [no args]`;
    } else {
      return cmd;
    }
  }

  /**
   * Group results by Node version
   */
  private groupByNodeVersion(
    results: readonly CommandTestResult[]
  ): Record<string, CommandTestResult[]> {
    const grouped: Record<string, CommandTestResult[]> = {};

    for (const result of results) {
      if (!grouped[result.nodeVersion]) {
        grouped[result.nodeVersion] = [];
      }
      grouped[result.nodeVersion].push(result);
    }

    return grouped;
  }

  /**
   * Get icon for test stage
   */
  private getStageIcon(stage: string): string {
    switch (stage) {
      case 'analyzing':
        return '🔍';
      case 'detecting-commands':
        return '📋';
      case 'pulling-image':
        return '⬇️ ';
      case 'creating-container':
        return '🐳';
      case 'installing-package':
        return '📥';
      case 'testing-command':
        return '🧪';
      case 'cleaning-up':
        return '🧹';
      case 'completed':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '•';
    }
  }

  /**
   * Format type validation results
   */
  private formatTypeValidation(validation: TypeValidationReport): string {
    const lines: string[] = [];

    // Overall validation status
    const statusIcon = validation.valid ? chalk.green('✓') : chalk.yellow('⚠️');
    lines.push(
      `${statusIcon} ${validation.valid ? 'Type definitions valid' : 'Some type issues found'}`
    );
    lines.push('');

    // Export statistics
    lines.push(`  Typed Exports: ${chalk.green(validation.typedExports)}`);
    lines.push(`  Untyped Exports: ${chalk.yellow(validation.untypedExports)}`);
    lines.push(`  Undocumented Exports: ${chalk.yellow(validation.undocumentedExports)}`);
    lines.push(
      `  Documentation Coverage: ${this.getCoverageBar(validation.documentationCoverage)}`
    );
    lines.push('');

    // Issues summary
    if (validation.issues.length > 0) {
      const errors = validation.issues.filter((i) => i.severity === 'error');
      const warnings = validation.issues.filter((i) => i.severity === 'warning');
      const infos = validation.issues.filter((i) => i.severity === 'info');

      if (errors.length > 0) {
        lines.push(`  ${chalk.red(`❌ Errors (${errors.length})`)}`);
        for (const issue of errors.slice(0, 3)) {
          lines.push(`    • ${chalk.red(issue.message)}`);
        }
        if (errors.length > 3) {
          lines.push(`    • ${chalk.gray(`+${errors.length - 3} more errors`)}`);
        }
      }

      if (warnings.length > 0) {
        lines.push(`  ${chalk.yellow(`⚠️  Warnings (${warnings.length})`)}`);
        for (const issue of warnings.slice(0, 3)) {
          lines.push(`    • ${chalk.yellow(issue.message)}`);
        }
        if (warnings.length > 3) {
          lines.push(`    • ${chalk.gray(`+${warnings.length - 3} more warnings`)}`);
        }
      }

      if (infos.length > 0 && errors.length === 0 && warnings.length === 0) {
        lines.push(`  ${chalk.blue(`ℹ️  Info (${infos.length})`)}`);
        for (const issue of infos.slice(0, 3)) {
          lines.push(`    • ${chalk.blue(issue.message)}`);
        }
        if (infos.length > 3) {
          lines.push(`    • ${chalk.gray(`+${infos.length - 3} more info`)}`);
        }
      }
    } else {
      lines.push(chalk.green('  ✓ No issues found'));
    }

    return lines.join('\n');
  }

  /**
   * Get a visual coverage bar
   */
  private getCoverageBar(coverage: number): string {
    const percentage = Math.round(coverage);
    const bars = Math.round(percentage / 5);
    const empty = 20 - bars;
    const bar = '█'.repeat(bars) + '░'.repeat(empty);

    const color = percentage >= 75 ? chalk.green : percentage >= 50 ? chalk.yellow : chalk.red;

    return `${color(bar)} ${percentage}%`;
  }
}
