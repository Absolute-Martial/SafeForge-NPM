/**
 * Analyzes npm packages to extract CLI commands and library exports
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execa } from 'execa';
import type { Dictionary, Optional } from '@kitiumai/types';
import { isArray, isNil, isObject, isString } from '@kitiumai/utils-ts';
import {
  PackageInfo,
  CLICommand,
  CommandType,
  CLIExample,
  LibraryExports,
  PackageType,
} from 'domain/models/types';
import { LibraryExportDetector } from './LibraryExportDetector';

export class PackageAnalyzer {
  private readonly libraryDetector: LibraryExportDetector;

  constructor() {
    this.libraryDetector = new LibraryExportDetector();
  }

  /**
   * Analyze a package from npm registry or local path
   */
  async analyze(packageSource: string): Promise<PackageInfo> {
    const isLocalPath = await this.isLocalPath(packageSource);

    if (isLocalPath) {
      return await this.analyzeLocalPackage(packageSource);
    } else {
      return await this.analyzeNpmPackage(packageSource);
    }
  }

  /**
   * Analyze a local package directory
   */
  private async analyzeLocalPackage(packagePath: string): Promise<PackageInfo> {
    const packageJsonPath = path.join(packagePath, 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content) as Dictionary<unknown>;

    // Detect library exports for local packages
    const { exports, type } = await this.libraryDetector.detectLibraryExports(packagePath);

    return this.extractPackageInfo(packageJson, exports, type);
  }

  /**
   * Analyze a package from npm registry
   */
  private async analyzeNpmPackage(packageName: string): Promise<PackageInfo> {
    try {
      const { stdout } = await execa('npm', ['view', `${packageName}@latest`, '--json']);
      const packageJson = JSON.parse(stdout) as Dictionary<unknown>;

      // For npm packages, we can't detect library exports from registry
      // (would need to download and inspect files)
      // So we infer package type from package.json metadata
      const type: PackageType = {
        isCLI: !!(
          packageJson.bin &&
          Object.keys((packageJson.bin as Record<string, unknown>) || {}).length > 0
        ),
        isLibrary: !!(packageJson.main || packageJson.exports || packageJson.module),
        hasNoExports: !(
          packageJson.bin ||
          packageJson.main ||
          packageJson.exports ||
          packageJson.module
        ),
      };

      return this.extractPackageInfo(packageJson, undefined, type);
    } catch (error) {
      throw new Error(`Failed to fetch package ${packageName}: ${(error as Error).message}`);
    }
  }

  /**
   * Extract package information from package.json
   */
  private extractPackageInfo(
    packageJson: Dictionary<unknown>,
    exports?: LibraryExports,
    type?: PackageType
  ): PackageInfo {
    const name = packageJson.name as string;
    const version = packageJson.version as string;
    const description = packageJson.description as Optional<string>;
    const dependencies = isObject(packageJson.dependencies)
      ? (packageJson.dependencies as Dictionary<string>)
      : {};
    const peerDependencies = isObject(packageJson.peerDependencies)
      ? (packageJson.peerDependencies as Dictionary<string>)
      : undefined;
    const engines = isObject(packageJson.engines)
      ? (packageJson.engines as Dictionary<string>)
      : undefined;

    const commands = this.extractCommands(packageJson);
    const examples = this.extractExamples(packageJson);

    // Determine package type if not provided
    const packageType: PackageType = type || {
      isCLI: commands.length > 0,
      isLibrary: !!exports || !!(packageJson.main || packageJson.exports || packageJson.module),
      hasNoExports:
        commands.length === 0 &&
        !exports &&
        !(packageJson.main || packageJson.exports || packageJson.module),
    };

    return {
      name,
      version,
      description,
      commands,
      dependencies,
      peerDependencies,
      engines,
      examples,
      exports,
      type: packageType,
    };
  }

  /**
   * Extract CLI commands from bin field
   */
  private extractCommands(packageJson: Dictionary<unknown>): CLICommand[] {
    const bin = packageJson.bin;
    const commands: CLICommand[] = [];

    if (isNil(bin)) {
      return commands;
    }

    if (isString(bin)) {
      // Single command (package name is command name)
      const name = packageJson.name as string;
      commands.push({
        name,
        path: bin,
        type: CommandType.PRIMARY,
      });
    } else if (isObject(bin)) {
      // Multiple commands
      const binEntries = Object.entries(bin as Dictionary<string>);
      const packageName = packageJson.name as string;

      binEntries.forEach(([cmdName, cmdPath], index) => {
        const type = this.determineCommandType(cmdName, packageName, index === 0);
        commands.push({
          name: cmdName,
          path: cmdPath,
          type,
        });
      });
    }

    return commands;
  }

  /**
   * Extract examples from npt.examples field
   */
  private extractExamples(packageJson: Dictionary<unknown>): Optional<CLIExample[]> {
    const npt = isObject(packageJson.npt) ? (packageJson.npt as Dictionary<unknown>) : undefined;

    if (!npt || isNil(npt.examples)) {
      return undefined;
    }

    if (!isArray(npt.examples)) {
      return undefined;
    }

    const examples = npt.examples as Array<Dictionary<unknown>>;

    return examples
      .filter((ex): ex is Dictionary<unknown> => isObject(ex))
      .filter((ex): ex is Dictionary<string> => isString(ex.command) && isString(ex.description))
      .map((ex) => ({
        command: ex.command,
        description: ex.description,
      }));
  }

  /**
   * Determine command type (primary, alias, utility)
   */
  private determineCommandType(
    commandName: string,
    packageName: string,
    isFirst: boolean
  ): CommandType {
    // If command name matches package name, it's primary
    if (commandName === packageName) {
      return CommandType.PRIMARY;
    }

    // If it's a shortened version of package name, it's an alias
    if (packageName.includes(commandName) || commandName.includes(packageName)) {
      return isFirst ? CommandType.PRIMARY : CommandType.ALIAS;
    }

    // Check if command name is an abbreviation (e.g., "cycfix" from "cyclic-dependency-fixer")
    const packageParts = packageName.split('-');
    const initials = packageParts.map((part) => part.charAt(0)).join('');
    const isAbbreviation =
      commandName.startsWith(initials) ||
      packageParts.some((part) => commandName.startsWith(part.substring(0, 3)));
    if (isAbbreviation && !isFirst) {
      return CommandType.ALIAS;
    }

    // First command is usually primary
    if (isFirst) {
      return CommandType.PRIMARY;
    }

    return CommandType.UTILITY;
  }

  /**
   * Check if source is a local path
   */
  private async isLocalPath(source: string): Promise<boolean> {
    try {
      const stats = await fs.stat(source);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}
