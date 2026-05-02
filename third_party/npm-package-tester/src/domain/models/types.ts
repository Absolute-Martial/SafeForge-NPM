/**
 * Core domain types for npm-package-tester
 */

import type { Dictionary, Optional } from '@kitiumai/types';

/**
 * npm package information
 */
export interface PackageInfo {
  /** Package name */
  readonly name: string;
  /** Package version */
  readonly version: string;
  /** Package description */
  readonly description?: Optional<string>;
  /** CLI commands available */
  readonly commands: readonly CLICommand[];
  /** Dependencies */
  readonly dependencies: Dictionary<string>;
  /** Peer dependencies */
  readonly peerDependencies?: Dictionary<string>;
  /** Engines specification */
  readonly engines?: Dictionary<string>;
  /** Example commands from npt.examples field */
  readonly examples?: Optional<readonly CLIExample[]>;
  /** Library exports (if package exports a library) */
  readonly exports?: Optional<LibraryExports>;
  /** Package type info */
  readonly type?: Optional<PackageType>;
}

/**
 * Package type detection
 */
export interface PackageType {
  /** Is this a CLI package (has bin field) */
  readonly isCLI: boolean;
  /** Is this a library package (has main/exports field) */
  readonly isLibrary: boolean;
  /** Has no testable exports or commands */
  readonly hasNoExports: boolean;
}

/**
 * Library export type
 */
export enum LibraryExportType {
  DEFAULT = 'default',
  NAMED = 'named',
  CLASS = 'class',
  FUNCTION = 'function',
  CONSTANT = 'constant',
  TYPE = 'type',
}

/**
 * Single exported entity from a library
 */
export interface LibraryExport {
  /** Export name */
  readonly name: string;
  /** Type of export */
  readonly type: LibraryExportType;
  /** Description of what it does (from JSDoc or auto-detected) */
  readonly description?: string;
  /** Number of parameters (for functions) */
  readonly paramCount?: number;
  /** Whether it's async (for functions) */
  readonly isAsync?: boolean;
  /** Function signature including parameters and return type */
  readonly signature?: string;
  /** JSDoc comment if available */
  readonly jsDoc?: string;
  /** For classes: public methods */
  readonly methods?: readonly ClassMethod[];
  /** For types/interfaces: properties */
  readonly properties?: readonly TypeProperty[];
}

/**
 * Class method information
 */
export interface ClassMethod {
  /** Method name */
  readonly name: string;
  /** Method signature */
  readonly signature?: string;
  /** Method description from JSDoc */
  readonly description?: string;
  /** Is constructor */
  readonly isConstructor?: boolean;
  /** Is private */
  readonly isPrivate?: boolean;
}

/**
 * Type property information
 */
export interface TypeProperty {
  /** Property name */
  readonly name: string;
  /** Property type */
  readonly type?: string;
  /** Is optional */
  readonly optional?: boolean;
  /** Property description */
  readonly description?: string;
}

/**
 * All library exports from a package
 */
export interface LibraryExports {
  /** Package has a default export */
  readonly hasDefaultExport: boolean;
  /** Type of default export (class, function, object, etc) */
  readonly defaultExportType?: string;
  /** Named exports available */
  readonly namedExports: readonly LibraryExport[];
  /** Main entry point file */
  readonly entryPoint: string;
  /** Export format (CommonJS or ESM) */
  readonly exportFormat: 'commonjs' | 'esm' | 'hybrid';
  /** Has TypeScript type definitions */
  readonly typeDefinitions: boolean;
  /** Path to type definitions file if available */
  readonly typesPath?: string;
}

/**
 * Library test scenario
 */
export interface LibraryTestScenario {
  /** Scenario name */
  readonly name: string;
  /** What this test validates */
  readonly description?: string;
  /** Import statement (e.g., const { func } = require('pkg')) */
  readonly importStatement: string;
  /** JavaScript/TypeScript test code to execute */
  readonly testCode: string;
  /** Expected output pattern */
  readonly expectedOutput?: string | RegExp;
  /** Expect an error to be thrown */
  readonly expectError?: boolean;
  /** Optional setup (file creation, etc) */
  readonly setup?: TestSetup;
}

/**
 * Library test result
 */
export interface LibraryTestResult {
  /** Test scenario name */
  readonly name: string;
  /** Node version tested */
  readonly nodeVersion: string;
  /** Test passed */
  readonly passed: boolean;
  /** Duration in ms */
  readonly duration: number;
  /** Standard output */
  readonly stdout: string;
  /** Standard error */
  readonly stderr: string;
  /** Error message if failed */
  readonly error?: string;
  /** Exit code */
  readonly exitCode: number;
  /** Test type */
  readonly testType: 'library' | 'ai-generated';
  /** Exported entity being tested */
  readonly exportTested?: string;
}

/**
 * Example CLI command from npt.examples field
 */
export interface CLIExample {
  /** The command to run */
  readonly command: string;
  /** Description of what it does */
  readonly description: string;
}

/**
 * CLI command extracted from package.json bin field
 */
export interface CLICommand {
  /** Command name */
  readonly name: string;
  /** Path to executable */
  readonly path: string;
  /** Detected command type */
  readonly type: CommandType;
}

/**
 * Types of CLI commands
 */
export enum CommandType {
  /** Main CLI tool */
  PRIMARY = 'primary',
  /** Alternative/alias command */
  ALIAS = 'alias',
  /** Sub-command or utility */
  UTILITY = 'utility',
}

/**
 * Test configuration
 */
export interface TestConfig {
  /** npm package name or path */
  readonly package: string;
  /** Node.js versions to test */
  readonly nodeVersions: readonly string[];
  /** Whether to test in parallel */
  readonly parallel: boolean;
  /** Timeout per test (ms) */
  readonly timeout: number;
  /** Keep containers after test */
  readonly keepContainers: boolean;
  /** Additional test scenarios */
  readonly customTests?: readonly CustomTest[];
  /** Realistic test scenarios with setup and validation */
  readonly scenarios?: readonly TestScenario[];
  /** Skip default CLI tests (--help, --version) */
  readonly skipDefaultTests?: boolean;
  /** AI configuration for automatic scenario generation */
  readonly ai?: AIConfig;
  /** npm authentication token for private packages */
  readonly npmToken?: string;
  /** Custom npm registry URL */
  readonly npmRegistry?: string;
  /** Optional compliance and governance controls */
  readonly compliance?: ComplianceConfig;
  /** Optional policy enforcement gates */
  readonly policy?: PolicyConfig;
  /** Override base Docker image */
  readonly baseImage?: string;
}

/**
 * Compliance and security configuration
 */
export interface ComplianceConfig {
  /** Enable compliance checks */
  readonly enabled?: boolean;
  /** Generate SBOM */
  readonly sbom?: boolean;
  /** Run vulnerability scan */
  readonly audit?: boolean;
  /** Run lightweight license check */
  readonly licenseCheck?: boolean;
  /** Path to persist compliance artifacts */
  readonly artifactDir?: string;
}

/**
 * Policy enforcement configuration
 */
export interface PolicyConfig {
  /** Allowed registries */
  readonly allowedRegistries?: readonly string[];
  /** Allowed Node versions */
  readonly allowedNodeVersions?: readonly string[];
  /** Require offline/blocked network */
  readonly enforceOffline?: boolean;
  /** Allowed Docker base images */
  readonly allowedBaseImages?: readonly string[];
}

/**
 * AI Provider configuration
 */
export interface AIConfig {
  /** AI provider */
  readonly provider: AIProvider;
  /** API key/token */
  readonly apiKey: string;
  /** Model name (optional - auto-detect best model) */
  readonly model?: string;
  /** Base URL for API (optional) */
  readonly baseUrl?: string;
}

/**
 * Supported AI providers
 */
export enum AIProvider {
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai',
  GOOGLE = 'google',
  GROQ = 'groq',
}

/**
 * Custom test scenario
 */
export interface CustomTest {
  /** Test name */
  readonly name: string;
  /** Command to run */
  readonly command: string;
  /** Expected behavior */
  readonly expect: TestExpectation;
}

/**
 * Expected test behavior
 */
export interface TestExpectation {
  /** Expected exit code */
  readonly exitCode?: number;
  /** Expected stdout pattern */
  readonly stdout?: string | RegExp;
  /** Expected stderr pattern */
  readonly stderr?: string | RegExp;
  /** Should not timeout */
  readonly completes?: boolean;
}

/**
 * Realistic test scenario with setup and validation
 */
export interface TestScenario {
  /** Scenario name */
  readonly name: string;
  /** Description of what this tests */
  readonly description?: string;
  /** Setup phase - create files/directories */
  readonly setup?: TestSetup;
  /** Command to execute */
  readonly command: string;
  /** Command arguments */
  readonly args?: readonly string[];
  /** Validation checks */
  readonly validate: TestValidation;
}

/**
 * Test setup configuration
 */
export interface TestSetup {
  /** Files to create before test */
  readonly files?: readonly TestFile[];
  /** Directories to create */
  readonly directories?: readonly string[];
  /** npm packages to install in test project */
  readonly dependencies?: readonly string[];
  /** Initialize as npm project */
  readonly initNpm?: boolean;
}

/**
 * File to create in test environment
 */
export interface TestFile {
  /** File path relative to test directory */
  readonly path: string;
  /** File content */
  readonly content: string;
}

/**
 * Validation configuration
 */
export interface TestValidation {
  /** Expected exit code (default: 0) */
  readonly exitCode?: number;
  /** Expected stdout patterns */
  readonly stdout?: readonly (string | RegExp)[];
  /** Expected stderr patterns */
  readonly stderr?: readonly (string | RegExp)[];
  /** Files that should exist after execution */
  readonly filesExist?: readonly string[];
  /** Files that should not exist */
  readonly filesNotExist?: readonly string[];
  /** File content validations */
  readonly fileContents?: readonly FileContentValidation[];
}

/**
 * Validation for file content
 */
export interface FileContentValidation {
  /** File path to check */
  readonly path: string;
  /** Content should match these patterns */
  readonly contains?: readonly (string | RegExp)[];
  /** Content should not match these patterns */
  readonly notContains?: readonly (string | RegExp)[];
  /** Exact content match */
  readonly equals?: string;
}

/**
 * Test result for a single command
 */
export interface CommandTestResult {
  /** Command that was tested */
  readonly command: CLICommand;
  /** Node version used */
  readonly nodeVersion: string;
  /** Test passed */
  readonly passed: boolean;
  /** Duration in ms */
  readonly duration: number;
  /** Exit code */
  readonly exitCode: number;
  /** Standard output */
  readonly stdout: string;
  /** Standard error */
  readonly stderr: string;
  /** Error message if failed */
  readonly error?: string;
  /** Help output detected */
  readonly hasHelpOutput: boolean;
  /** Version output detected */
  readonly hasVersionOutput: boolean;
  /** Test scenario name (if from AI or custom scenario) */
  readonly scenarioName?: string;
  /** Test type (default, ai-generated, custom) */
  readonly testType?: 'default' | 'ai-generated' | 'custom';
  /** Command arguments used */
  readonly args?: readonly string[];
}

/**
 * Type validation result for library exports
 */
export interface TypeValidationReport {
  /** Whether all validations passed */
  readonly valid: boolean;
  /** Number of typed exports */
  readonly typedExports: number;
  /** Number of untyped exports */
  readonly untypedExports: number;
  /** Number of exports without documentation */
  readonly undocumentedExports: number;
  /** Documentation coverage percentage (0-100) */
  readonly documentationCoverage: number;
  /** Validation issues */
  readonly issues: ValidationIssue[];
}

/**
 * Single validation issue
 */
export interface ValidationIssue {
  /** Issue type */
  readonly type: 'missing-type' | 'missing-export' | 'untyped' | 'undocumented' | 'deprecated';
  /** Export name */
  readonly exportName: string;
  /** Issue description */
  readonly message: string;
  /** Severity level */
  readonly severity: 'error' | 'warning' | 'info';
}

/**
 * Test summary for entire package
 */
export interface PackageTestSummary {
  /** Package info */
  readonly package: PackageInfo;
  /** All test results (CLI and/or library tests) */
  readonly results: readonly (CommandTestResult | LibraryTestResult)[];
  /** Total tests run */
  readonly total: number;
  /** Tests passed */
  readonly passed: number;
  /** Tests failed */
  readonly failed: number;
  /** Overall success */
  readonly success: boolean;
  /** Total duration */
  readonly duration: number;
  /** CLI test results (if any) */
  readonly cliResults?: readonly CommandTestResult[];
  /** Library test results (if any) */
  readonly libraryResults?: readonly LibraryTestResult[];
  /** Type validation results (if library package) */
  readonly typeValidation?: TypeValidationReport;
  /** Compliance and security posture for the run */
  readonly compliance?: ComplianceReport;
  /** Policy evaluation */
  readonly policy?: PolicyReport;
}

/**
 * Compliance report
 */
export interface ComplianceReport {
  /** SBOM contents */
  readonly sbom?: SBOMReport;
  /** Vulnerability report */
  readonly vulnerabilities?: VulnerabilityReport;
  /** License findings */
  readonly licenses?: LicenseReport;
}

/**
 * SBOM report (lightweight)
 */
export interface SBOMReport {
  /** Package name */
  readonly packageName: string;
  /** When generated */
  readonly generatedAt: string;
  /** Components */
  readonly components: readonly SBOMComponent[];
}

export interface SBOMComponent {
  /** Dependency name */
  readonly name: string;
  /** Version */
  readonly version: string;
  /** Resolved from */
  readonly path?: string;
}

export interface VulnerabilityReport {
  /** Vulnerability findings */
  readonly findings: readonly SecurityFinding[];
  /** Raw report */
  readonly raw?: unknown;
}

export interface SecurityFinding {
  /** Title */
  readonly title: string;
  /** Severity */
  readonly severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
  /** Dependency */
  readonly dependency: string;
  /** Via/identifier */
  readonly via?: string;
  /** Advisory URL */
  readonly url?: string;
}

export interface LicenseReport {
  /** License issues */
  readonly issues: readonly LicenseIssue[];
}

export interface LicenseIssue {
  /** Dependency */
  readonly dependency: string;
  /** License */
  readonly license: string;
  /** Message */
  readonly message: string;
}

export interface PolicyReport {
  /** Whether all policies passed */
  readonly passed: boolean;
  /** Violations */
  readonly violations: readonly PolicyViolation[];
}

export interface PolicyViolation {
  /** Rule violated */
  readonly rule: string;
  /** Description */
  readonly message: string;
}

/**
 * Test environment in Docker
 */
export interface TestEnvironment {
  /** Node.js version */
  readonly nodeVersion: string;
  /** Package manager (npm, yarn, pnpm) */
  readonly packageManager: PackageManager;
  /** Base Docker image */
  readonly baseImage: string;
  /** Additional setup commands */
  readonly setup?: readonly string[];
}

/**
 * Package managers supported
 */
export enum PackageManager {
  NPM = 'npm',
  YARN = 'yarn',
  PNPM = 'pnpm',
}

/**
 * Docker container state
 */
export interface ContainerState {
  /** Container ID */
  readonly id: string;
  /** Node version */
  readonly nodeVersion: string;
  /** Package installed */
  readonly packageName: string;
  /** Container status */
  readonly status: 'created' | 'running' | 'exited' | 'error';
}

/**
 * Progress event
 */
export interface ProgressEvent {
  /** Stage of testing */
  readonly stage: TestStage;
  /** Message */
  readonly message: string;
  /** Progress (0-100) */
  readonly progress?: number;
  /** Current command being tested */
  readonly currentCommand?: string;
}

/**
 * Test stages
 */
export enum TestStage {
  ANALYZING = 'analyzing',
  DETECTING_COMMANDS = 'detecting-commands',
  PULLING_IMAGE = 'pulling-image',
  CREATING_CONTAINER = 'creating-container',
  INSTALLING_PACKAGE = 'installing-package',
  TESTING_COMMAND = 'testing-command',
  CLEANING_UP = 'cleaning-up',
  COMPLETED = 'completed',
  ERROR = 'error',
}

/**
 * Command test strategy
 */
export interface CommandTestStrategy {
  /** Try --help flag */
  readonly testHelp: boolean;
  /** Try --version flag */
  readonly testVersion: boolean;
  /** Try running without arguments */
  readonly testNoArgs: boolean;
  /** Custom test arguments */
  readonly customArgs?: readonly string[][];
}
