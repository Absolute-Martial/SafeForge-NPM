/**
 * Parses TypeScript type definitions (.d.ts files) to extract type information
 */

import * as fs from 'fs';
import * as ts from 'typescript';

export interface TypeDefinitionInfo {
  filePath: string;
  exports: ExportedType[];
  interfaces: InterfaceInfo[];
  typeAliases: TypeAliasInfo[];
  enums: EnumInfo[];
}

export interface ExportedType {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'variable' | 'const';
  isDefault: boolean;
  signature?: string;
  description?: string;
  deprecated?: boolean;
}

export interface InterfaceInfo {
  name: string;
  properties: TypeProperty[];
  methods?: TypeMethod[];
  extends?: string[];
}

export interface TypeProperty {
  name: string;
  type: string;
  optional: boolean;
  readonly: boolean;
  description?: string;
}

export interface TypeMethod {
  name: string;
  signature: string;
  returnType: string;
  description?: string;
}

export interface TypeAliasInfo {
  name: string;
  type: string;
  description?: string;
}

export interface EnumInfo {
  name: string;
  members: EnumMember[];
}

export interface EnumMember {
  name: string;
  value?: string | number;
}

export class TypeDefinitionParser {
  /**
   * Parse TypeScript type definitions from a .d.ts file
   */
  parseTypeDefinitionFile(filePath: string): TypeDefinitionInfo {
    if (!fs.existsSync(filePath)) {
      return {
        filePath,
        exports: [],
        interfaces: [],
        typeAliases: [],
        enums: [],
      };
    }

    const sourceCode = fs.readFileSync(filePath, 'utf-8');
    return this.parseTypeDefinitionContent(sourceCode, filePath);
  }

  /**
   * Parse TypeScript type definitions from content string
   */
  parseTypeDefinitionContent(content: string, filePath: string = 'index.d.ts'): TypeDefinitionInfo {
    try {
      const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

      const info: TypeDefinitionInfo = {
        filePath,
        exports: [],
        interfaces: [],
        typeAliases: [],
        enums: [],
      };

      this.visitNode(sourceFile, info);

      return info;
    } catch (error) {
      console.warn(`Failed to parse type definitions from ${filePath}:`, error);
      return {
        filePath,
        exports: [],
        interfaces: [],
        typeAliases: [],
        enums: [],
      };
    }
  }

  /**
   * Visit AST nodes and extract type information
   */
  private visitNode(node: ts.Node, info: TypeDefinitionInfo): void {
    if (ts.isExportDeclaration(node)) {
      // Handle re-exports
      return;
    }

    if (ts.isInterfaceDeclaration(node) && this.isExported(node)) {
      const interfaceInfo = this.extractInterfaceInfo(node);
      info.interfaces.push(interfaceInfo);
      info.exports.push({
        name: node.name.text,
        kind: 'interface',
        isDefault: false,
        deprecated: false,
      });
      return;
    }

    if (ts.isTypeAliasDeclaration(node) && this.isExported(node)) {
      const typeStr = this.getTypeString(node.type);
      info.typeAliases.push({
        name: node.name.text,
        type: typeStr,
      });
      info.exports.push({
        name: node.name.text,
        kind: 'type',
        isDefault: false,
        deprecated: false,
      });
      return;
    }

    if (ts.isEnumDeclaration(node) && this.isExported(node)) {
      const enumInfo = this.extractEnumInfo(node);
      info.enums.push(enumInfo);
      info.exports.push({
        name: node.name.text,
        kind: 'enum',
        isDefault: false,
        deprecated: false,
      });
      return;
    }

    if (ts.isFunctionDeclaration(node) && this.isExported(node) && node.name) {
      const signature = this.extractFunctionSignature(node);
      info.exports.push({
        name: node.name.text,
        kind: 'function',
        isDefault: false,
        signature,
        deprecated: false,
      });
      return;
    }

    if (ts.isClassDeclaration(node) && this.isExported(node) && node.name) {
      info.exports.push({
        name: node.name.text,
        kind: 'class',
        isDefault: false,
        deprecated: false,
      });
      return;
    }

    if (ts.isVariableStatement(node) && this.isExported(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          const kind = node.declarationList.flags & ts.NodeFlags.Const ? 'const' : 'variable';
          info.exports.push({
            name: declaration.name.text,
            kind,
            isDefault: false,
            deprecated: false,
          });
        }
      }
      return;
    }

    // Recurse into child nodes
    ts.forEachChild(node, (child) => this.visitNode(child, info));
  }

  /**
   * Extract interface information
   */
  private extractInterfaceInfo(node: ts.InterfaceDeclaration): InterfaceInfo {
    const properties: TypeProperty[] = [];
    const methods: TypeMethod[] = [];

    for (const member of node.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const name = this.getPropertyName(member.name);
        const type = member.type ? this.getTypeString(member.type) : 'any';
        const optional = !!member.questionToken;
        const readonlyFlag =
          member.modifiers &&
          member.modifiers.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword);

        properties.push({
          name,
          type,
          optional,
          readonly: !!readonlyFlag,
        });
      } else if (ts.isMethodSignature(member) && member.name) {
        const name = this.getPropertyName(member.name);
        const signature = this.extractMethodSignature(member);
        const returnType = member.type ? this.getTypeString(member.type) : 'void';

        methods.push({
          name,
          signature,
          returnType,
        });
      }
    }

    const extendsClause: string[] = [];
    if (node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          for (const type of clause.types) {
            extendsClause.push(this.getTypeString(type));
          }
        }
      }
    }

    return {
      name: node.name.text,
      properties,
      methods: methods.length > 0 ? methods : undefined,
      extends: extendsClause.length > 0 ? extendsClause : undefined,
    };
  }

  /**
   * Extract enum information
   */
  private extractEnumInfo(node: ts.EnumDeclaration): EnumInfo {
    const members: EnumMember[] = [];

    for (const member of node.members) {
      const name = this.getPropertyName(member.name);
      const value = member.initializer ? this.getConstantValue(member.initializer) : undefined;

      members.push({
        name,
        value,
      });
    }

    return {
      name: node.name.text,
      members,
    };
  }

  /**
   * Extract function signature
   */
  private extractFunctionSignature(node: ts.FunctionDeclaration): string {
    const params = node.parameters
      .map((p) => {
        const name = this.getPropertyName(p.name);
        const type = p.type ? this.getTypeString(p.type) : 'any';
        const optional = p.questionToken ? '?' : '';
        return `${name}${optional}: ${type}`;
      })
      .join(', ');

    const returnType = node.type ? this.getTypeString(node.type) : 'void';
    return `(${params}) => ${returnType}`;
  }

  /**
   * Extract method signature
   */
  private extractMethodSignature(node: ts.MethodSignature): string {
    const params = node.parameters
      .map((p) => {
        const name = this.getPropertyName(p.name);
        const type = p.type ? this.getTypeString(p.type) : 'any';
        return `${name}: ${type}`;
      })
      .join(', ');

    return `(${params})`;
  }

  /**
   * Get type string from TypeNode
   */
  private getTypeString(typeNode: ts.TypeNode): string {
    const printer = ts.createPrinter();
    const sourceFile = typeNode.getSourceFile();
    return printer.printNode(ts.EmitHint.Unspecified, typeNode, sourceFile).trim();
  }

  /**
   * Get property name from PropertyName
   */
  private getPropertyName(node: ts.PropertyName | ts.BindingName): string {
    if (ts.isIdentifier(node)) {
      return node.text;
    } else if (ts.isStringLiteral(node)) {
      return node.text;
    } else if (ts.isNumericLiteral(node)) {
      return node.text;
    }
    return 'unknown';
  }

  /**
   * Get constant value from initializer
   */
  private getConstantValue(node: ts.Expression): string | number | undefined {
    if (ts.isStringLiteral(node)) {
      return node.text;
    } else if (ts.isNumericLiteral(node)) {
      return parseInt(node.text, 10);
    }
    return undefined;
  }

  /**
   * Check if node is exported
   */
  private isExported(node: ts.Node): boolean {
    const modifiers = (node as ts.Node & { modifiers?: ts.NodeArray<ts.ModifierLike> }).modifiers;
    return Boolean(
      modifiers && modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    );
  }
}
