export interface PackageManagerAdapter {
  readonly name: string;
  installCommand(spec: string): string[];
}

export class NpmPackageManagerAdapter implements PackageManagerAdapter {
  readonly name = "npm";

  installCommand(spec: string): string[] {
    return ["npm", "install", spec];
  }
}

export function getDefaultPackageManagerAdapter(): PackageManagerAdapter {
  return new NpmPackageManagerAdapter();
}
