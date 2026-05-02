/**
 * Validates runtime exports against TypeScript type definitions
 */

import { LibraryExportType, LibraryExports } from 'domain/models/types';
import { TypeDefinitionParser, TypeDefinitionInfo } from './TypeDefinitionParser';

export interface TypeValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  summary: ValidationSummary;
}

export interface ValidationError {
  type: 'missing-type' | 'missing-export' | 'type-mismatch';
  exportName: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  type: 'untyped-export' | 'deprecated' | 'undocumented';
  exportName: string;
  message: string;
}

export interface ValidationSummary {
  totalExports: number;
  typedExports: number;
  untypedExports: number;
  deprecatedExports: number;
  documentationCoverage: number; // 0-100
}

type RuntimeExport =
  | LibraryExports['namedExports'][number]
  | { name: 'default'; type: LibraryExportType.DEFAULT; description?: string };

export class TypeValidator {
  private parser: TypeDefinitionParser;

  constructor() {
    this.parser = new TypeDefinitionParser();
  }

  private hasDescription(exportItem: RuntimeExport): boolean {
    return Boolean('description' in exportItem && exportItem.description);
  }

  /**
   * Validate runtime exports against type definitions
   */
  validateExports(libraryExports: LibraryExports, typeDefContent?: string): TypeValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    let typeDefInfo: TypeDefinitionInfo | undefined;
    if (typeDefContent) {
      typeDefInfo = this.parser.parseTypeDefinitionContent(typeDefContent, 'index.d.ts');
    }

    const allExports: RuntimeExport[] = [
      ...(libraryExports.hasDefaultExport
        ? [{ name: 'default', type: LibraryExportType.DEFAULT }]
        : []),
      ...libraryExports.namedExports,
    ];

    // Check each runtime export for type definitions
    for (const exportItem of allExports) {
      if (!typeDefInfo) {
        warnings.push({
          type: 'untyped-export',
          exportName: exportItem.name,
          message: `No type definitions found. Export "${exportItem.name}" is untyped.`,
        });
        continue;
      }

      const typeInfo = typeDefInfo.exports.find((e) => e.name === exportItem.name);

      if (!typeInfo) {
        errors.push({
          type: 'missing-type',
          exportName: exportItem.name,
          message: `Runtime export "${exportItem.name}" has no corresponding type definition`,
          severity: 'warning',
        });
      } else {
        // Check if kind matches
        const expectedKind = this.mapExportTypeToKind(exportItem.type);
        if (expectedKind && typeInfo.kind !== expectedKind && expectedKind !== 'variable') {
          warnings.push({
            type: 'untyped-export',
            exportName: exportItem.name,
            message: `Export kind mismatch: expected ${expectedKind}, found ${typeInfo.kind}`,
          });
        }

        // Check if deprecated
        if (typeInfo.deprecated) {
          warnings.push({
            type: 'deprecated',
            exportName: exportItem.name,
            message: `Export "${exportItem.name}" is marked as deprecated in type definitions`,
          });
        }
      }

      // Check if documented
      const jsDoc = 'jsDoc' in exportItem ? exportItem.jsDoc : undefined;
      if (!typeInfo?.description && !this.hasJSDoc(jsDoc)) {
        warnings.push({
          type: 'undocumented',
          exportName: exportItem.name,
          message: `Export "${exportItem.name}" has no documentation`,
        });
      }
    }

    // Check for type definitions without runtime exports
    if (typeDefInfo) {
      for (const typeExport of typeDefInfo.exports) {
        const hasRuntime = allExports.some((e) => e.name === typeExport.name);
        if (!hasRuntime && typeExport.name !== 'default') {
          errors.push({
            type: 'missing-export',
            exportName: typeExport.name,
            message: `Type definition "${typeExport.name}" has no corresponding runtime export`,
            severity: 'warning',
          });
        }
      }
    }

    // Calculate coverage
    const typedCount = typeDefInfo
      ? allExports.filter((e) => typeDefInfo.exports.some((t) => t.name === e.name)).length
      : 0;
    const documentedCount = allExports.filter(
      (e) =>
        this.hasDescription(e) ||
        this.hasJSDoc('jsDoc' in e ? e.jsDoc : undefined) ||
        (typeDefInfo && typeDefInfo.exports.find((t) => t.name === e.name)?.description)
    ).length;
    const deprecatedCount = typeDefInfo
      ? typeDefInfo.exports.filter((e) => e.deprecated).length
      : 0;

    const summary: ValidationSummary = {
      totalExports: allExports.length,
      typedExports: typedCount,
      untypedExports: allExports.length - typedCount,
      deprecatedExports: deprecatedCount,
      documentationCoverage:
        allExports.length > 0 ? Math.round((documentedCount / allExports.length) * 100) : 0,
    };

    const isValid = errors.filter((e) => e.severity === 'error').length === 0;

    return {
      isValid,
      errors,
      warnings,
      summary,
    };
  }

  /**
   * Map LibraryExportType to TypeScript kind
   */
  private mapExportTypeToKind(
    exportType: LibraryExports['namedExports'][number]['type'] | 'default'
  ): string | undefined {
    switch (exportType) {
      case 'function':
        return 'function';
      case 'class':
        return 'class';
      case 'constant':
        return 'const';
      case 'type':
        return 'type';
      case 'default':
        return undefined;
      case 'named':
        return undefined; // Generic, could be anything
      default:
        return undefined;
    }
  }

  /**
   * Check if export has JSDoc
   */
  private hasJSDoc(jsDoc: string | undefined): boolean {
    return !!(jsDoc && jsDoc.length > 0 && jsDoc.includes('*'));
  }
}
