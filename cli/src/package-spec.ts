export interface PackageSpec {
  name: string;
  version?: string;
}

export function parsePackageSpec(raw: string): PackageSpec {
  const value = raw.trim();
  if (!value) {
    throw new Error("Package spec is required");
  }

  if (value.startsWith("@")) {
    const slashIndex = value.indexOf("/");
    if (slashIndex === -1) {
      throw new Error(`Invalid scoped package spec: ${raw}`);
    }

    const versionIndex = value.lastIndexOf("@");
    if (versionIndex > slashIndex) {
      return {
        name: value.slice(0, versionIndex),
        version: value.slice(versionIndex + 1) || undefined,
      };
    }

    return { name: value };
  }

  const versionIndex = value.lastIndexOf("@");
  if (versionIndex > 0) {
    return {
      name: value.slice(0, versionIndex),
      version: value.slice(versionIndex + 1) || undefined,
    };
  }

  return { name: value };
}
