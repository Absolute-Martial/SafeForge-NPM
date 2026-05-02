/**
 * Detects and analyzes library exports from npm packages
 */

import * as fs from 'fs';
import * as path from 'path';
import { LibraryExports, LibraryExport, LibraryExportType, PackageType } from 'domain/models/types';
import { ASTExportParser } from './ASTExportParser';

type PackageJson = Record<string, unknown> & {
  bin?: Record<string, unknown> | string;
  main?: string;
  module?: string;
  exports?: unknown;
  types?: string;
  typings?: string;
};

export class LibraryExportDetector {
  private readonly astParser: ASTExportParser;

  constructor() {
    this.astParser = new ASTExportParser();
  }

  /**
   * Detect package type and library exports
   */
  async detectLibraryExports(packagePath: string): Promise<{
    exports?: LibraryExports;
    type: PackageType;
  }> {
    try {
      const packageJsonPath = path.join(packagePath, 'package.json');

      if (!fs.existsSync(packageJsonPath)) {
        return {
          type: {
            isCLI: false,
            isLibrary: false,
            hasNoExports: true,
          },
        };
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as PackageJson;

      // Determine if it's a CLI package
      const isCLI =
        typeof packageJson.bin === 'string'
          ? packageJson.bin.length > 0
          : !!(packageJson.bin && Object.keys(packageJson.bin).length > 0);

      // Determine if it's a library package (has main or exports field)
      const isLibrary = Boolean(packageJson.main || packageJson.exports || packageJson.module);

      if (!isLibrary) {
        return {
          type: {
            isCLI,
            isLibrary: false,
            hasNoExports: !isCLI,
          },
        };
      }

      // Analyze library exports
      const exports = await this.analyzeExports(packagePath, packageJson);

      return {
        exports,
        type: {
          isCLI,
          isLibrary: true,
          hasNoExports: false,
        },
      };
    } catch {
      return {
        type: {
          isCLI: false,
          isLibrary: false,
          hasNoExports: true,
        },
      };
    }
  }

  /**
   * Analyze exports from the entry point
   */
  private async analyzeExports(
    packagePath: string,
    packageJson: PackageJson
  ): Promise<LibraryExports> {
    const entryPoint = this.resolveEntryPoint(packagePath, packageJson);
    const exportFormat = this.detectExportFormat(packageJson);
    const typesPath = this.resolveTypesPath(packagePath, packageJson);
    const typeDefinitions = typesPath ? fs.existsSync(typesPath) : false;

    // Try to analyze the entry point file
    const namedExports = await this.extractNamedExports(packagePath, entryPoint);
    const hasDefaultExport = await this.checkDefaultExport(packagePath, entryPoint);

    return {
      hasDefaultExport,
      defaultExportType: hasDefaultExport ? 'unknown' : undefined, // Would need AST parsing to determine exact type
      namedExports,
      entryPoint,
      exportFormat,
      typeDefinitions,
      typesPath: typeDefinitions ? typesPath : undefined,
    };
  }

  /**
   * Resolve the main entry point file
   */
  private resolveEntryPoint(_packagePath: string, packageJson: PackageJson): string {
    // Prefer explicit exports field
    if (packageJson.exports) {
      if (typeof packageJson.exports === 'string') {
        return packageJson.exports;
      } else if (
        typeof packageJson.exports === 'object' &&
        packageJson.exports !== null &&
        '.' in packageJson.exports
      ) {
        const exportsObj = (packageJson.exports as Record<string, unknown>)['.'];
        if (typeof exportsObj === 'string') {
          return exportsObj;
        }

        if (
          exportsObj &&
          typeof exportsObj === 'object' &&
          ('import' in exportsObj || 'require' in exportsObj)
        ) {
          const record = exportsObj as Record<string, string>;
          if (record.import) {
            return record.import;
          }
          if (record.require) {
            return record.require;
          }
        }
      }
    }

    // Fall back to module field (ESM)
    if (typeof packageJson.module === 'string') {
      return packageJson.module;
    }

    // Fall back to main field (CommonJS)
    if (typeof packageJson.main === 'string') {
      return packageJson.main;
    }

    // Default
    return 'index.js';
  }

  /**
   * Detect export format (CommonJS, ESM, or hybrid)
   */
  private detectExportFormat(packageJson: PackageJson): 'commonjs' | 'esm' | 'hybrid' {
    const hasExports = packageJson.exports !== undefined;
    const hasModule = packageJson.module !== undefined;
    const hasMain = packageJson.main !== undefined;

    // If explicitly using exports field with multiple conditions
    if (
      hasExports &&
      typeof packageJson.exports === 'object' &&
      packageJson.exports !== null &&
      ('import' in packageJson.exports || 'require' in packageJson.exports)
    ) {
      return 'hybrid';
    }

    // If has both main (CommonJS) and module (ESM)
    if (hasMain && hasModule) {
      return 'hybrid';
    }

    // If only has module field, assume ESM
    if (hasModule && !hasMain) {
      return 'esm';
    }

    // Default to CommonJS
    return 'commonjs';
  }

  /**
   * Resolve TypeScript type definitions path
   */
  private resolveTypesPath(packagePath: string, packageJson: PackageJson): string | undefined {
    // Check types field
    if (typeof packageJson.types === 'string') {
      return path.join(packagePath, packageJson.types);
    }

    // Check typings field (legacy)
    if (typeof packageJson.typings === 'string') {
      return path.join(packagePath, packageJson.typings);
    }

    // Check if d.ts file exists next to main entry
    if (typeof packageJson.main === 'string') {
      const mainPath = path.join(packagePath, packageJson.main);
      const dtsPath = mainPath.replace(/\.(js|ts)$/, '.d.ts');
      if (fs.existsSync(dtsPath)) {
        return dtsPath;
      }
    }

    return undefined;
  }

  /**
   * Extract named exports from entry point
   */
  private async extractNamedExports(
    packagePath: string,
    entryPoint: string
  ): Promise<LibraryExport[]> {
    const exports: LibraryExport[] = [];

    try {
      const entryPath = path.join(packagePath, entryPoint);

      // Check if file exists
      if (!fs.existsSync(entryPath)) {
        return exports;
      }

      // Try AST-based parsing first for .js, .ts, .jsx, .tsx files
      if (['.js', '.ts', '.jsx', '.tsx'].some((ext) => entryPath.endsWith(ext))) {
        const astExports = this.astParser.parseFile(entryPath);
        if (astExports.length > 0) {
          return astExports;
        }
      }

      // Fall back to regex-based extraction
      const content = fs.readFileSync(entryPath, 'utf-8');

      // Extract CommonJS: module.exports = { ... }
      const commonjsMatch = content.match(
        /module\.exports\s*=\s*\{([^}]*)\}|\bexports\.(\w+)\s*=/g
      );
      if (commonjsMatch) {
        commonjsMatch.forEach((match) => {
          // Extract function/variable names
          const names = match.match(/\b(\w+)\s*:/g);
          if (names) {
            names.forEach((name) => {
              const cleanName = name.replace(/[:\s]/g, '');
              if (!exports.find((e) => e.name === cleanName)) {
                exports.push({
                  name: cleanName,
                  type: LibraryExportType.NAMED,
                  description: undefined,
                });
              }
            });
          }
        });
      }

      // Extract ES6: export const/function
      const es6ConstMatches = content.matchAll(/export\s+const\s+(\w+)/g);
      for (const match of es6ConstMatches) {
        if (!exports.find((e) => e.name === match[1])) {
          exports.push({
            name: match[1],
            type: LibraryExportType.CONSTANT,
          });
        }
      }

      // Extract ES6: export function
      const es6FuncMatches = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g);
      for (const match of es6FuncMatches) {
        if (!exports.find((e) => e.name === match[1])) {
          exports.push({
            name: match[1],
            type: LibraryExportType.FUNCTION,
          });
        }
      }

      // Extract ES6: export class
      const es6ClassMatches = content.matchAll(/export\s+(?:abstract\s+)?class\s+(\w+)/g);
      for (const match of es6ClassMatches) {
        if (!exports.find((e) => e.name === match[1])) {
          exports.push({
            name: match[1],
            type: LibraryExportType.CLASS,
          });
        }
      }

      return exports;
    } catch {
      return exports;
    }
  }

  /**
   * Check if entry point has a default export
   */
  private async checkDefaultExport(packagePath: string, entryPoint: string): Promise<boolean> {
    try {
      const entryPath = path.join(packagePath, entryPoint);

      if (!fs.existsSync(entryPath)) {
        return false;
      }

      const content = fs.readFileSync(entryPath, 'utf-8');

      // Check for CommonJS default export
      if (content.includes('module.exports =') && !content.includes('module.exports = {}')) {
        return true;
      }

      // Check for ES6 default export
      if (content.includes('export default')) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get a simple summary of exports for display
   */
  getExportSummary(exports: LibraryExports): string {
    const parts: string[] = [];

    if (exports.hasDefaultExport) {
      parts.push('default export');
    }

    if (exports.namedExports.length > 0) {
      const names = exports.namedExports.slice(0, 3).map((e) => e.name);
      if (exports.namedExports.length > 3) {
        names.push(`+${exports.namedExports.length - 3} more`);
      }
      parts.push(`named exports: {${names.join(', ')}}`);
    }

    if (exports.typeDefinitions) {
      parts.push('TypeScript types');
    }

    return parts.length > 0 ? parts.join(' • ') : 'No exports detected';
  }
}
