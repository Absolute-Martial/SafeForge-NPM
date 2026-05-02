/**
 * AST-based export parser using Babel
 * Extracts detailed export information including signatures, JSDoc, and types
 */

import * as fs from 'fs';
import * as parser from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LibraryExport, LibraryExportType, ClassMethod, TypeProperty } from 'domain/models/types';

export class ASTExportParser {
  /**
   * Parse a JavaScript or TypeScript file and extract exports
   */
  parseFile(filePath: string): LibraryExport[] {
    try {
      if (!fs.existsSync(filePath)) {
        return [];
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const ast = this.parseContent(content, filePath);

      if (!ast) {
        return [];
      }

      const exports: LibraryExport[] = [];
      const exportedNames = new Set<string>();

      traverse(ast, {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        ExportNamedDeclaration: (path) => {
          const namedExports = this.extractNamedExports(path);
          namedExports.forEach((exp) => {
            if (!exportedNames.has(exp.name)) {
              exports.push(exp);
              exportedNames.add(exp.name);
            }
          });
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        ExportDefaultDeclaration: (path) => {
          const defaultExport = this.extractDefaultExport(path);
          if (defaultExport && !exportedNames.has('default')) {
            exports.push(defaultExport);
            exportedNames.add('default');
          }
        },
      });

      return exports;
    } catch {
      // Silently fail - fall back to regex parsing
      return [];
    }
  }

  /**
   * Parse content string and return AST
   */
  private parseContent(content: string, filePath: string): t.File | null {
    try {
      const isTypeScript = filePath.endsWith('.ts') || filePath.endsWith('.tsx');

      const plugins: parser.ParserPlugin[] = [
        'jsx',
        'decorators-legacy',
        'classProperties',
        'logicalAssignment',
        'optionalChaining',
        'nullishCoalescingOperator',
      ];

      if (isTypeScript) {
        plugins.push('typescript');
      }

      return parser.parse(content, {
        sourceType: 'module',
        plugins,
        allowImportExportEverywhere: true,
        allowSuperOutsideMethod: true,
      });
    } catch {
      return null;
    }
  }

  /**
   * Extract named exports
   */
  private extractNamedExports(path: NodePath<t.ExportNamedDeclaration>): LibraryExport[] {
    const exports: LibraryExport[] = [];
    const { declaration, specifiers } = path.node;

    // Handle export { a, b, c }
    if (specifiers && specifiers.length > 0) {
      for (const spec of specifiers) {
        if (t.isExportSpecifier(spec)) {
          const name = spec.local.name;
          const jsDoc = this.extractJSDoc(path);
          exports.push({
            name,
            type: LibraryExportType.NAMED,
            jsDoc,
            description: this.extractDescription(jsDoc),
          });
        }
      }
    }

    // Handle export const/function/class declarations
    if (declaration) {
      if (t.isFunctionDeclaration(declaration)) {
        const name = declaration.id?.name || 'anonymous';
        const jsDoc = this.extractJSDoc(path);
        exports.push({
          name,
          type: LibraryExportType.FUNCTION,
          signature: this.extractFunctionSignature(declaration),
          isAsync: declaration.async,
          paramCount: declaration.params.length,
          jsDoc,
          description: this.extractDescription(jsDoc),
        });
      } else if (t.isClassDeclaration(declaration)) {
        const name = declaration.id?.name || 'anonymous';
        const jsDoc = this.extractJSDoc(path);
        const methods = this.extractClassMethods(declaration);
        exports.push({
          name,
          type: LibraryExportType.CLASS,
          jsDoc,
          description: this.extractDescription(jsDoc),
          methods,
        });
      } else if (t.isVariableDeclaration(declaration)) {
        for (const declarator of declaration.declarations) {
          if (t.isIdentifier(declarator.id)) {
            const name = declarator.id.name;
            const jsDoc = this.extractJSDoc(path);
            const type = this.inferTypeFromInit(declarator.init);
            exports.push({
              name,
              type,
              jsDoc,
              description: this.extractDescription(jsDoc),
            });
          }
        }
      } else if (t.isTSTypeAliasDeclaration(declaration)) {
        const name = declaration.id.name;
        const jsDoc = this.extractJSDoc(path);
        exports.push({
          name,
          type: LibraryExportType.TYPE,
          jsDoc,
          description: this.extractDescription(jsDoc),
        });
      } else if (t.isTSInterfaceDeclaration(declaration)) {
        const name = declaration.id.name;
        const jsDoc = this.extractJSDoc(path);
        const properties = this.extractInterfaceProperties(declaration);
        exports.push({
          name,
          type: LibraryExportType.TYPE,
          jsDoc,
          description: this.extractDescription(jsDoc),
          properties,
        });
      }
    }

    return exports;
  }

  /**
   * Extract default export
   */
  private extractDefaultExport(path: NodePath<t.ExportDefaultDeclaration>): LibraryExport | null {
    const { declaration } = path.node;
    const jsDoc = this.extractJSDoc(path);

    if (
      t.isFunctionDeclaration(declaration) ||
      t.isArrowFunctionExpression(declaration) ||
      t.isFunctionExpression(declaration)
    ) {
      return {
        name: 'default',
        type: LibraryExportType.FUNCTION,
        signature: this.extractFunctionSignature(declaration),
        isAsync: 'async' in declaration && declaration.async,
        paramCount: declaration.params.length,
        jsDoc,
        description: this.extractDescription(jsDoc),
      };
    } else if (t.isClassDeclaration(declaration)) {
      const methods = this.extractClassMethods(declaration);
      return {
        name: 'default',
        type: LibraryExportType.CLASS,
        jsDoc,
        description: this.extractDescription(jsDoc),
        methods,
      };
    }

    // Default to object/module
    return {
      name: 'default',
      type: LibraryExportType.CONSTANT,
      jsDoc,
      description: this.extractDescription(jsDoc),
    };
  }

  /**
   * Extract function signature
   */
  private extractFunctionSignature(
    func:
      | t.FunctionDeclaration
      | t.FunctionExpression
      | t.ArrowFunctionExpression
      | t.ObjectMethod
      | t.ClassMethod
  ): string {
    try {
      const params = func.params
        .map((param) => {
          if (t.isIdentifier(param)) {
            return param.name;
          }
          if (t.isRestElement(param) && t.isIdentifier(param.argument)) {
            return `...${param.argument.name}`;
          }
          return 'param';
        })
        .join(', ');

      return `(${params})`;
    } catch {
      return '';
    }
  }

  /**
   * Extract class methods
   */
  private extractClassMethods(classDecl: t.ClassDeclaration | t.ClassExpression): ClassMethod[] {
    const methods: ClassMethod[] = [];

    for (const method of classDecl.body.body) {
      if (t.isClassMethod(method) || t.isClassProperty(method)) {
        const name = t.isIdentifier(method.key) ? method.key.name : String(method.key);
        const jsDoc = this.extractJSDocFromNode(method);

        if (t.isClassMethod(method)) {
          methods.push({
            name,
            signature: this.extractFunctionSignature(method),
            description: this.extractDescription(jsDoc),
            isConstructor: method.kind === 'constructor',
            isPrivate: method.access === 'private',
          });
        }
      }
    }

    return methods;
  }

  /**
   * Extract interface properties
   */
  private extractInterfaceProperties(iface: t.TSInterfaceDeclaration): TypeProperty[] {
    const properties: TypeProperty[] = [];

    for (const member of iface.body.body) {
      if (t.isTSPropertySignature(member)) {
        const name = t.isIdentifier(member.key) ? member.key.name : String(member.key);
        properties.push({
          name,
          type: this.extractTypeFromAnnotation(member.typeAnnotation),
          optional: member.optional ?? false,
        });
      }
    }

    return properties;
  }

  /**
   * Extract type from annotation
   */
  private extractTypeFromAnnotation(annotation?: t.TSTypeAnnotation | null): string | undefined {
    if (!annotation) {
      return undefined;
    }

    try {
      if (t.isTSTypeReference(annotation.typeAnnotation)) {
        if (t.isIdentifier(annotation.typeAnnotation.typeName)) {
          return annotation.typeAnnotation.typeName.name;
        }
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Infer type from initializer
   */
  private inferTypeFromInit(init: t.Expression | null | undefined): LibraryExportType {
    if (!init) {
      return LibraryExportType.CONSTANT;
    }

    if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
      return LibraryExportType.FUNCTION;
    } else if (t.isClassExpression(init)) {
      return LibraryExportType.CLASS;
    }

    return LibraryExportType.CONSTANT;
  }

  /**
   * Extract JSDoc from path
   */
  private extractJSDoc(path: NodePath<t.Node>): string | undefined {
    return this.extractJSDocFromNode(path.node);
  }

  /**
   * Extract JSDoc from node
   */
  private extractJSDocFromNode(node: t.Node | null | undefined): string | undefined {
    if (!node || !node.leadingComments) {
      return undefined;
    }

    for (const comment of node.leadingComments) {
      if (comment.type === 'CommentBlock' && comment.value.includes('*')) {
        return comment.value;
      }
    }

    return undefined;
  }

  /**
   * Extract description from JSDoc
   */
  private extractDescription(jsDoc?: string): string | undefined {
    if (!jsDoc) {
      return undefined;
    }

    // Remove comment markers and extract first line
    const lines = jsDoc
      .split('\n')
      .map((line) => line.replace(/^\s*\*\s?/, '').trim())
      .filter((line) => line && !line.startsWith('@'));

    return lines[0] || undefined;
  }
}
