/**
 * Analyzes JSDoc comments for documentation completeness
 */

import { LibraryExports } from 'domain/models/types';

type AnalyzableExport =
  | LibraryExports['namedExports'][number]
  | {
      name: 'default';
      type: 'default';
      jsDoc?: string;
      signature?: string;
      description?: string;
      paramCount?: number;
    };

export interface JSDocAnalysisResult {
  exports: JSDocExportAnalysis[];
  summary: JSDocSummary;
}

export interface JSDocExportAnalysis {
  name: string;
  hasJSDoc: boolean;
  hasDescription: boolean;
  hasParamDocs: boolean;
  hasReturnDoc: boolean;
  hasTypeInfo: boolean;
  hasExampleCode: boolean;
  completeness: number; // 0-100
  issues: DocumentationIssue[];
}

export interface DocumentationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface JSDocSummary {
  totalExports: number;
  fullyDocumented: number;
  partiallyDocumented: number;
  undocumented: number;
  averageCompleteness: number; // 0-100
  criticalIssues: number;
}

export class JSDocAnalyzer {
  /**
   * Analyze JSDoc documentation for library exports
   */
  analyzeExports(libraryExports: LibraryExports): JSDocAnalysisResult {
    const allExports: AnalyzableExport[] = [
      ...(libraryExports.hasDefaultExport
        ? [
            {
              name: 'default',
              type: 'default' as const,
              jsDoc: undefined,
              signature: undefined,
              description: undefined,
            } satisfies AnalyzableExport,
          ]
        : []),
      ...libraryExports.namedExports,
    ];

    const exportAnalyses = allExports.map((exp) => this.analyzeExport(exp));

    const summary: JSDocSummary = {
      totalExports: exportAnalyses.length,
      fullyDocumented: exportAnalyses.filter((e) => e.completeness === 100).length,
      partiallyDocumented: exportAnalyses.filter((e) => e.completeness > 0 && e.completeness < 100)
        .length,
      undocumented: exportAnalyses.filter((e) => e.completeness === 0).length,
      averageCompleteness:
        exportAnalyses.length > 0
          ? Math.round(
              exportAnalyses.reduce((sum, e) => sum + e.completeness, 0) / exportAnalyses.length
            )
          : 0,
      criticalIssues: exportAnalyses.reduce(
        (sum, e) => sum + e.issues.filter((i) => i.severity === 'error').length,
        0
      ),
    };

    return {
      exports: exportAnalyses,
      summary,
    };
  }

  /**
   * Analyze single export documentation
   */
  private analyzeExport(exp: AnalyzableExport): JSDocExportAnalysis {
    const issues: DocumentationIssue[] = [];
    let completenessScore = 0;
    let scoreItems = 0;

    const hasJSDoc = !!(exp.jsDoc && exp.jsDoc.length > 0);
    const hasDescription = !!(exp.description && exp.description.length > 0);

    // Check JSDoc presence
    if (!hasJSDoc && !hasDescription) {
      issues.push({
        severity: 'error',
        message: `Export "${exp.name}" has no JSDoc comments`,
      });
    } else if (hasJSDoc) {
      completenessScore += 20;
      scoreItems++;
    }

    // Check description
    if (hasDescription) {
      completenessScore += 20;
      scoreItems++;
    } else {
      issues.push({
        severity: 'warning',
        message: `Export "${exp.name}" has no description`,
      });
    }

    // Check for @param documentation in functions
    if (
      (exp.type === 'function' || exp.type === 'constant') &&
      exp.paramCount &&
      exp.paramCount > 0
    ) {
      const hasParamDocs = this.hasParamDocumentation(exp.jsDoc, exp.paramCount);
      if (hasParamDocs) {
        completenessScore += 20;
      } else {
        issues.push({
          severity: 'warning',
          message: `Function "${exp.name}" has ${exp.paramCount} parameter(s) but no @param documentation`,
        });
      }
      scoreItems++;
    } else if (exp.type === 'function') {
      completenessScore += 20; // No params, so no param docs needed
      scoreItems++;
    }

    // Check for @returns/@return documentation in functions
    if (exp.type === 'function') {
      const hasReturnDoc = this.hasReturnDocumentation(exp.jsDoc);
      if (hasReturnDoc) {
        completenessScore += 20;
      } else {
        issues.push({
          severity: 'info',
          message: `Function "${exp.name}" has no @returns documentation`,
        });
      }
      scoreItems++;
    }

    // Check for type annotations
    if (exp.signature || exp.jsDoc?.includes('@type')) {
      completenessScore += 20;
      scoreItems++;
    } else if (exp.type !== 'class') {
      issues.push({
        severity: 'info',
        message: `Export "${exp.name}" has no type annotation information`,
      });
    }

    // Check for example code
    if (exp.jsDoc?.includes('@example')) {
      completenessScore += 20;
      scoreItems++;
    } else if (exp.type === 'function' || exp.type === 'class') {
      issues.push({
        severity: 'info',
        message: `Export "${exp.name}" has no @example documentation`,
      });
    }

    const hasParamDocs = this.hasParamDocumentation(exp.jsDoc, exp.paramCount || 0);
    const hasReturnDoc = this.hasReturnDocumentation(exp.jsDoc);
    const hasTypeInfo = !!(exp.signature || exp.jsDoc?.includes('@type'));
    const hasExampleCode = !!exp.jsDoc?.includes('@example');

    // Calculate final completeness score
    const completeness = scoreItems > 0 ? Math.round(completenessScore / scoreItems) : 0;

    return {
      name: exp.name,
      hasJSDoc,
      hasDescription,
      hasParamDocs,
      hasReturnDoc,
      hasTypeInfo,
      hasExampleCode,
      completeness,
      issues,
    };
  }

  /**
   * Check if JSDoc has parameter documentation
   */
  private hasParamDocumentation(jsDoc: string | undefined, paramCount: number): boolean {
    if (!jsDoc) {
      return false;
    }

    // Count @param tags
    const paramMatches = jsDoc.match(/@param\s+/g) || [];
    return paramMatches.length >= paramCount;
  }

  /**
   * Check if JSDoc has return documentation
   */
  private hasReturnDocumentation(jsDoc: string | undefined): boolean {
    if (!jsDoc) {
      return false;
    }

    return /@returns?(\s|$|\n)/.test(jsDoc);
  }

  /**
   * Generate markdown report of documentation analysis
   */
  generateReport(analysis: JSDocAnalysisResult): string {
    const { summary, exports } = analysis;

    let report = '# JSDoc Documentation Analysis\n\n';

    report += '## Summary\n';
    report += `- **Total Exports**: ${summary.totalExports}\n`;
    report += `- **Fully Documented**: ${summary.fullyDocumented} (${this.percentage(summary.fullyDocumented, summary.totalExports)}%)\n`;
    report += `- **Partially Documented**: ${summary.partiallyDocumented} (${this.percentage(summary.partiallyDocumented, summary.totalExports)}%)\n`;
    report += `- **Undocumented**: ${summary.undocumented} (${this.percentage(summary.undocumented, summary.totalExports)}%)\n`;
    report += `- **Average Completeness**: ${summary.averageCompleteness}%\n`;
    report += `- **Critical Issues**: ${summary.criticalIssues}\n\n`;

    // Sort by completeness
    const sorted = [...exports].sort((a, b) => a.completeness - b.completeness);

    report += '## Export Documentation Status\n\n';
    for (const exp of sorted) {
      const icon = this.getCompletenessIcon(exp.completeness);
      report += `### ${icon} ${exp.name}\n`;
      report += `**Completeness**: ${exp.completeness}%\n`;
      report += `- JSDoc Present: ${exp.hasJSDoc ? '✓' : '✗'}\n`;
      report += `- Description: ${exp.hasDescription ? '✓' : '✗'}\n`;
      report += `- Parameters Documented: ${exp.hasParamDocs ? '✓' : '✗'}\n`;
      report += `- Return Type Documented: ${exp.hasReturnDoc ? '✓' : '✗'}\n`;
      report += `- Type Information: ${exp.hasTypeInfo ? '✓' : '✗'}\n`;
      report += `- Example Code: ${exp.hasExampleCode ? '✓' : '✗'}\n`;

      if (exp.issues.length > 0) {
        report += '\n**Issues**:\n';
        for (const issue of exp.issues) {
          const icon =
            issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
          report += `- ${icon} ${issue.message}\n`;
        }
      }

      report += '\n';
    }

    return report;
  }

  /**
   * Get icon for completeness level
   */
  private getCompletenessIcon(completeness: number): string {
    if (completeness === 100) {
      return '✅';
    }
    if (completeness >= 75) {
      return '🟢';
    }
    if (completeness >= 50) {
      return '🟡';
    }
    if (completeness >= 25) {
      return '🟠';
    }
    return '🔴';
  }

  /**
   * Calculate percentage
   */
  private percentage(value: number, total: number): number {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  }
}
