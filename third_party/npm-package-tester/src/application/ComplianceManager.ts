import { DockerManager } from './DockerManager';
import type {
  ComplianceConfig,
  ComplianceReport,
  LicenseIssue,
  LicenseReport,
  SBOMComponent,
  SBOMReport,
  SecurityFinding,
  VulnerabilityReport,
} from 'domain/models/types';

/**
 * Runs compliance and security checks inside a container
 */
export class ComplianceManager {
  constructor(private readonly dockerManager: DockerManager) {}

  async runCompliance(
    containerId: string,
    packageName: string,
    config?: ComplianceConfig
  ): Promise<ComplianceReport | undefined> {
    if (!config || config.enabled === false) {
      return undefined;
    }

    const sbom =
      config.sbom !== false ? await this.generateSBOM(containerId, packageName) : undefined;
    const vulnerabilities = config.audit !== false ? await this.runAudit(containerId) : undefined;
    const licenses =
      config.licenseCheck !== false
        ? await this.collectLicenses(containerId, packageName)
        : undefined;

    const reportData: Record<string, unknown> = {};
    if (sbom) {
      (reportData as Record<string, SBOMReport>).sbom = sbom;
    }
    if (vulnerabilities) {
      (reportData as Record<string, VulnerabilityReport>).vulnerabilities = vulnerabilities;
    }
    if (licenses) {
      (reportData as Record<string, LicenseReport>).licenses = licenses;
    }

    const report: ComplianceReport = reportData as ComplianceReport;

    if (config.artifactDir) {
      await this.persistArtifacts(containerId, config.artifactDir, report);
    }

    return report;
  }

  private async generateSBOM(containerId: string, packageName: string): Promise<SBOMReport> {
    const result = await this.dockerManager.executeCommand(containerId, ['npm', 'list', '--json']);

    let components: SBOMComponent[] = [];
    try {
      const parsed = JSON.parse(result.stdout || '{}');
      components = this.flattenDependencies(parsed.dependencies ?? {});
    } catch {
      components = [];
    }

    return {
      packageName,
      generatedAt: new Date().toISOString(),
      components,
    };
  }

  private flattenDependencies(deps: Record<string, unknown>, prefix = ''): SBOMComponent[] {
    const components: SBOMComponent[] = [];

    for (const [name, info] of Object.entries(deps)) {
      let version = 'unknown';
      if (typeof info === 'object' && info !== null && 'version' in info) {
        const versionValue = (info as Record<string, unknown>).version;
        version = typeof versionValue === 'string' ? versionValue : String(versionValue);
      }
      components.push({ name, version, path: prefix });

      if (typeof info === 'object' && info !== null && 'dependencies' in info) {
        const depValue = (info as Record<string, unknown>).dependencies;
        if (typeof depValue === 'object' && depValue !== null) {
          components.push(
            ...this.flattenDependencies(depValue as Record<string, unknown>, `${prefix}${name}>`)
          );
        }
      }
    }

    return components;
  }

  private async runAudit(containerId: string): Promise<VulnerabilityReport> {
    const result = await this.dockerManager.executeCommand(containerId, [
      'npm',
      'audit',
      '--json',
      '--audit-level=low',
    ]);

    try {
      const parsed = JSON.parse(result.stdout || '{}') as Record<string, unknown>;
      const findings: SecurityFinding[] = [];

      // Process advisories if present
      const advisories = parsed.advisories;
      if (advisories && typeof advisories === 'object') {
        for (const advisory of Object.values(advisories)) {
          if (advisory && typeof advisory === 'object') {
            const adv = advisory as Record<string, unknown>;
            const severity = this.normalizeSeverity(adv.severity);
            findings.push({
              title: String(adv.title ?? 'Advisory'),
              severity,
              dependency: String(adv.module_name ?? 'unknown'),
              via: this.extractCveString(adv.cves),
              url: adv.url ? String(adv.url) : undefined,
            });
          }
        }
      }

      // Process vulnerabilities if present
      const vulnerabilities = parsed.vulnerabilities;
      if (Array.isArray(vulnerabilities)) {
        for (const vuln of vulnerabilities) {
          if (vuln && typeof vuln === 'object') {
            const v = vuln as Record<string, unknown>;
            const severity = this.normalizeSeverity(v.severity);
            findings.push({
              title: String(v.title ?? v.name ?? 'Vulnerability'),
              severity,
              dependency: String(v.name ?? 'unknown'),
              via: this.extractViaString(v.via),
              url: v.url ? String(v.url) : undefined,
            });
          }
        }
      }

      return { findings, raw: parsed };
    } catch {
      return { findings: [], raw: result.stdout };
    }
  }

  private normalizeSeverity(severity: unknown): 'critical' | 'high' | 'medium' | 'low' | 'unknown' {
    if (typeof severity === 'string' && ['critical', 'high', 'medium', 'low'].includes(severity)) {
      return severity as 'critical' | 'high' | 'medium' | 'low';
    }
    return 'unknown';
  }

  private extractCveString(cves: unknown): string | undefined {
    if (Array.isArray(cves) && cves.length > 0) {
      return String(cves[0]);
    }
    return undefined;
  }

  private extractViaString(via: unknown): string | undefined {
    if (Array.isArray(via) && via.length > 0) {
      const viaItem = via[0];
      if (viaItem && typeof viaItem === 'object') {
        const source = (viaItem as Record<string, unknown>).source;
        return String(source ?? 'unknown');
      }
    }
    return undefined;
  }

  private async collectLicenses(containerId: string, packageName: string): Promise<LicenseReport> {
    const result = await this.dockerManager.executeCommand(containerId, [
      'npm',
      'view',
      packageName,
      'license',
      '--json',
    ]);

    const issues: LicenseIssue[] = [];
    try {
      const licenseValue = JSON.parse(result.stdout || '"unknown"');
      if (licenseValue && typeof licenseValue === 'string') {
        issues.push({
          dependency: packageName,
          license: licenseValue,
          message: `Root package license: ${licenseValue}`,
        });
      }
    } catch {
      issues.push({
        dependency: packageName,
        license: 'unknown',
        message: 'Unable to resolve license',
      });
    }

    return { issues };
  }

  private async persistArtifacts(
    containerId: string,
    dir: string,
    report: ComplianceReport
  ): Promise<void> {
    await this.dockerManager.createDirectory(containerId, dir);
    await this.dockerManager.createFile(
      containerId,
      `${dir.replace(/\/$/, '')}/compliance-report.json`,
      JSON.stringify(report, null, 2)
    );
  }
}
