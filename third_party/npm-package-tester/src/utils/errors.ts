/**
 * Centralized error handling with KitiumError factory functions
 * Provides structured error types for npm-package-tester operations
 */

import { KitiumError, type ErrorSeverity } from '@kitiumai/error';

/**
 * Error metadata for structured logging and error tracking
 */
export interface ErrorMetadata {
  code: string;
  kind: string;
  severity: ErrorSeverity;
  statusCode: number;
  retryable: boolean;
  help?: string;
  docs?: string;
}

/**
 * Extract error metadata from KitiumError for logging
 */
export function extractErrorMetadata(error: unknown): ErrorMetadata {
  if (error instanceof KitiumError) {
    const kitiumError = error as any;
    return {
      code: kitiumError.code,
      kind: kitiumError.kind,
      severity: kitiumError.severity,
      statusCode: kitiumError.statusCode,
      retryable: kitiumError.retryable,
      help: kitiumError.help,
      docs: kitiumError.docs,
    };
  }

  return {
    code: 'npt/unknown',
    kind: 'unknown',
    severity: 'error',
    statusCode: 500,
    retryable: false,
  };
}

/**
 * Package analysis error (npm lookup, parsing, export detection)
 */
export function createPackageAnalysisError(
  operation: string,
  packageName: string,
  reason: string,
  context?: Record<string, unknown>
): KitiumError {
  return new KitiumError({
    code: 'npt/package-analysis',
    message: `Failed to analyze package: ${operation} for ${packageName} - ${reason}`,
    statusCode: 400,
    severity: 'error',
    kind: 'package_analysis_error',
    retryable: true,
    help: 'Verify the package name is correct and accessible on npm registry',
    docs: 'https://docs.kitium.ai/errors/npt/package-analysis',
    context: { operation, packageName, reason, ...context },
  });
}

/**
 * Docker unavailable or connection error
 */
export function createDockerError(
  operation: string,
  reason: string,
  context?: Record<string, unknown>
): KitiumError {
  return new KitiumError({
    code: 'npt/docker',
    message: `Docker operation failed: ${operation} - ${reason}`,
    statusCode: 503,
    severity: 'error',
    kind: 'docker_error',
    retryable: true,
    help: 'Ensure Docker is installed, running, and accessible. Check docker daemon status',
    docs: 'https://docs.kitium.ai/errors/npt/docker',
    context: { operation, reason, ...context },
  });
}

/**
 * Container creation or management error
 */
export function createContainerError(
  operation: string,
  containerId?: string,
  reason?: string,
  context?: Record<string, unknown>
): KitiumError {
  return new KitiumError({
    code: 'npt/container',
    message: `Container operation failed: ${operation}${reason ? ` - ${reason}` : ''}`,
    statusCode: 500,
    severity: 'error',
    kind: 'container_error',
    retryable: true,
    help: 'Check Docker disk space and system resources. Try removing unused containers',
    docs: 'https://docs.kitium.ai/errors/npt/container',
    context: { operation, containerId, reason, ...context },
  });
}

/**
 * Command execution error during testing
 */
export function createCommandExecutionError(
  command: string,
  exitCode: number,
  stderr?: string,
  context?: Record<string, unknown>
): KitiumError {
  return new KitiumError({
    code: 'npt/command-execution',
    message: `Command failed: ${command} (exit code: ${exitCode})${stderr ? ` - ${stderr.slice(0, 100)}` : ''}`,
    statusCode: 422,
    severity: 'warning',
    kind: 'command_execution_error',
    retryable: false,
    help: 'Check the package is properly installed and the command is correct',
    docs: 'https://docs.kitium.ai/errors/npt/command-execution',
    context: { command, exitCode, stderr, ...context },
  });
}

/**
 * Library test scenario error
 */
export function createLibraryTestError(
  scenario: string,
  reason: string,
  context?: Record<string, unknown>
): KitiumError {
  return new KitiumError({
    code: 'npt/library-test',
    message: `Library test failed: ${scenario} - ${reason}`,
    statusCode: 422,
    severity: 'warning',
    kind: 'library_test_error',
    retryable: false,
    help: 'Verify the library exports are correctly defined and accessible',
    docs: 'https://docs.kitium.ai/errors/npt/library-test',
    context: { scenario, reason, ...context },
  });
}

/**
 * Type validation error
 */
export function createTypeValidationError(
  file: string,
  issue: string,
  context?: Record<string, unknown>
): KitiumError {
  return new KitiumError({
    code: 'npt/type-validation',
    message: `Type validation failed in ${file}: ${issue}`,
    statusCode: 422,
    severity: 'warning',
    kind: 'type_validation_error',
    retryable: false,
    help: 'Check TypeScript definitions and type annotations in your code',
    docs: 'https://docs.kitium.ai/errors/npt/type-validation',
    context: { file, issue, ...context },
  });
}

/**
 * AI provider error (scenario generation)
 */
export function createAIProviderError(
  providerName: string,
  operation: string,
  reason: string,
  context?: Record<string, unknown>
): KitiumError {
  return new KitiumError({
    code: 'npt/ai-provider',
    message: `AI provider error (${providerName}): ${operation} - ${reason}`,
    statusCode: 503,
    severity: 'warning',
    kind: 'ai_provider_error',
    retryable: true,
    help: 'Verify API credentials are valid and rate limits are not exceeded',
    docs: 'https://docs.kitium.ai/errors/npt/ai-provider',
    context: { providerName, operation, reason, ...context },
  });
}

/**
 * Compliance check error
 */
export function createComplianceError(
  check: string,
  reason: string,
  context?: Record<string, unknown>
): KitiumError {
  return new KitiumError({
    code: 'npt/compliance',
    message: `Compliance check failed: ${check} - ${reason}`,
    statusCode: 422,
    severity: 'warning',
    kind: 'compliance_error',
    retryable: false,
    help: 'Review compliance requirements and package configuration',
    docs: 'https://docs.kitium.ai/errors/npt/compliance',
    context: { check, reason, ...context },
  });
}

/**
 * Policy validation error
 */
export function createPolicyError(
  policy: string,
  violation: string,
  context?: Record<string, unknown>
): KitiumError {
  return new KitiumError({
    code: 'npt/policy',
    message: `Policy violation: ${policy} - ${violation}`,
    statusCode: 409,
    severity: 'warning',
    kind: 'policy_error',
    retryable: false,
    help: 'Update package configuration to comply with policies',
    docs: 'https://docs.kitium.ai/errors/npt/policy',
    context: { policy, violation, ...context },
  });
}

/**
 * Test configuration error
 */
export function createConfigurationError(
  field: string,
  reason: string,
  context?: Record<string, unknown>
): KitiumError {
  return new KitiumError({
    code: 'npt/configuration',
    message: `Configuration error in field '${field}': ${reason}`,
    statusCode: 400,
    severity: 'error',
    kind: 'configuration_error',
    retryable: false,
    help: 'Check test configuration and CLI arguments',
    docs: 'https://docs.kitium.ai/errors/npt/configuration',
    context: { field, reason, ...context },
  });
}

/**
 * Backward compatibility error classes
 * These are kept for gradual migration to KitiumError
 */

export class PackageAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackageAnalysisError';
  }
}

export class DockerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DockerError';
  }
}

export class ContainerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContainerError';
  }
}

export class CommandExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandExecutionError';
  }
}

export class LibraryTestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibraryTestError';
  }
}

export class TypeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TypeValidationError';
  }
}

export class AIProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIProviderError';
  }
}

export class ComplianceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComplianceError';
  }
}

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyError';
  }
}
