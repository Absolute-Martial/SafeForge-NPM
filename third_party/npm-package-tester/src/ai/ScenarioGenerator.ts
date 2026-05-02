/**
 * Generates test scenarios using AI
 */

import { PackageInfo, TestScenario, AIConfig } from 'domain/models/types';
import { AIProviderFactory } from './AIProvider';
import { DockerManager } from 'application/DockerManager';

export class ScenarioGenerator {
  private readonly dockerManager: DockerManager;

  constructor(dockerManager: DockerManager) {
    this.dockerManager = dockerManager;
  }

  /**
   * Generate test scenarios for a package using AI
   */
  async generateScenarios(
    packageInfo: PackageInfo,
    aiConfig: AIConfig,
    containerId?: string
  ): Promise<TestScenario[]> {
    // Get CLI help output
    let cliHelp = '';
    if (containerId && packageInfo.commands.length > 0) {
      try {
        const helpResult = await this.dockerManager.executeCommand(containerId, [
          packageInfo.commands[0].name,
          '--help',
        ]);
        cliHelp = helpResult.stdout + helpResult.stderr;
      } catch {
        // Ignore help errors
      }
    }

    // Get README (if available from npm)
    const readme = await this.fetchReadme(packageInfo.name);

    // Use AI to generate scenarios
    const aiProvider = AIProviderFactory.create(aiConfig);

    const scenarios = await aiProvider.generateScenarios(
      packageInfo.name,
      packageInfo.description || '',
      readme,
      cliHelp,
      packageInfo.commands.map((c) => c.name),
      packageInfo.examples
    );

    return scenarios;
  }

  /**
   * Fetch README from npm
   */
  private async fetchReadme(packageName: string): Promise<string> {
    try {
      const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
      if (!response.ok) {
        return '';
      }
      const data = (await response.json()) as { readme?: string };
      return typeof data.readme === 'string' ? data.readme : '';
    } catch {
      return '';
    }
  }
}
