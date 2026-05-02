/**
 * Generates library test scenarios using AI
 */

import {
  PackageInfo,
  LibraryTestScenario,
  AIConfig,
  LibraryExports,
  CLIExample,
} from 'domain/models/types';
import { AIProviderFactory } from './AIProvider';

export interface AILibraryProviderClient {
  generateLibraryScenarios(
    packageName: string,
    packageDescription: string,
    readme: string,
    libraryExports: LibraryExports,
    examples?: readonly CLIExample[]
  ): Promise<LibraryTestScenario[]>;
}

export class LibraryScenarioGenerator {
  /**
   * Generate library test scenarios using AI
   */
  async generateScenarios(
    packageInfo: PackageInfo,
    libraryExports: LibraryExports,
    aiConfig: AIConfig
  ): Promise<LibraryTestScenario[]> {
    // Get README (if available from npm)
    const readme = await this.fetchReadme(packageInfo.name);

    // Use AI to generate scenarios
    const aiProvider = AIProviderFactory.create(aiConfig);

    const scenarios = await this.generateWithAI(
      packageInfo.name,
      packageInfo.description || '',
      readme,
      libraryExports,
      packageInfo.examples,
      aiProvider
    );

    return scenarios;
  }

  /**
   * Generate scenarios using AI provider
   */
  private async generateWithAI(
    packageName: string,
    packageDescription: string,
    readme: string,
    libraryExports: LibraryExports,
    examples: readonly CLIExample[] | undefined,
    aiProvider: AILibraryProviderClient
  ): Promise<LibraryTestScenario[]> {
    const response = await aiProvider.generateLibraryScenarios(
      packageName,
      packageDescription,
      readme,
      libraryExports,
      examples
    );

    return response;
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
