// Minimal stub for @babel/types used only in Vitest.
// This avoids requiring the real dependency in the test environment.

export type File = unknown;
export type ExportNamedDeclaration = { declaration?: unknown; specifiers?: unknown[] };
export type ExportDefaultDeclaration = { declaration?: unknown };
export type ClassDeclaration = { body: { body: unknown[] } };
export type ClassExpression = ClassDeclaration;
export type TSInterfaceDeclaration = { body: { body: unknown[] } };

export const isExportSpecifier = (_: unknown): boolean => false;
export const isFunctionDeclaration = (_: unknown): boolean => false;
export const isClassDeclaration = (_: unknown): boolean => false;
export const isVariableDeclaration = (_: unknown): boolean => false;
export const isTSTypeAliasDeclaration = (_: unknown): boolean => false;
export const isTSInterfaceDeclaration = (_: unknown): boolean => false;
export const isArrowFunctionExpression = (_: unknown): boolean => false;
export const isFunctionExpression = (_: unknown): boolean => false;
export const isIdentifier = (_: unknown): boolean => false;
export const isRestElement = (_: unknown): boolean => false;
export const isClassMethod = (_: unknown): boolean => false;
export const isClassProperty = (_: unknown): boolean => false;
export const isTSPropertySignature = (_: unknown): boolean => false;
