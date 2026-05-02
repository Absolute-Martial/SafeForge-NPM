import type { PolicyConfig, PolicyReport, PolicyViolation } from 'domain/models/types';

export class PolicyManager {
  evaluate(config: PolicyConfig | undefined, nodeVersion: string, baseImage: string): PolicyReport {
    if (!config) {
      return { passed: true, violations: [] };
    }

    const violations: PolicyViolation[] = [];

    if (config.allowedNodeVersions && !config.allowedNodeVersions.includes(nodeVersion)) {
      violations.push({
        rule: 'node-version',
        message: `Node version ${nodeVersion} not allowed by policy`,
      });
    }

    if (config.allowedBaseImages && !config.allowedBaseImages.includes(baseImage)) {
      violations.push({
        rule: 'base-image',
        message: `Base image ${baseImage} is outside allowed list`,
      });
    }

    return { passed: violations.length === 0, violations };
  }

  validateRegistry(policy: PolicyConfig | undefined, registry?: string): PolicyReport | undefined {
    if (!policy || !policy.allowedRegistries) {
      return undefined;
    }

    if (registry && !policy.allowedRegistries.includes(registry)) {
      return {
        passed: false,
        violations: [
          {
            rule: 'registry',
            message: `Registry ${registry} is not in allowed list`,
          },
        ],
      };
    }

    return { passed: true, violations: [] };
  }
}
