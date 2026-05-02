/**
 * Public API for npm-package-tester
 */

// Export domain types
export type {
  PackageInfo,
  CLICommand,
  CommandType,
  TestConfig,
  CommandTestResult,
  PackageTestSummary,
  TestEnvironment,
  PackageManager,
  ProgressEvent,
  TestStage,
  ComplianceConfig,
  ComplianceReport,
  SBOMReport,
  VulnerabilityReport,
  PolicyConfig,
  PolicyReport,
} from './domain/models/types';

// Export main components
export { PackageAnalyzer } from './application/PackageAnalyzer';
export { TestRunner } from './application/TestRunner';
export { DockerManager } from './application/DockerManager';
export { ResultFormatter } from './formatters/ResultFormatter';

// Convenience function
import { TestRunner } from './application/TestRunner';
import type { TestConfig, PackageTestSummary, PackageInfo } from './domain/models/types';

/**
 * Test a package with simplified API
 */
export async function testPackage(
  packageSource: string,
  config?: Partial<TestConfig>
): Promise<PackageTestSummary> {
  const runner = new TestRunner();
  return await runner.testPackage(packageSource, config || {});
}

/**
 * Analyze a package to detect CLI commands
 */
export async function analyzePackage(packageSource: string): Promise<PackageInfo> {
  const { PackageAnalyzer: packageAnalyzerClass } = await import('./application/PackageAnalyzer');
  const analyzer = new packageAnalyzerClass();
  return await analyzer.analyze(packageSource);
}
