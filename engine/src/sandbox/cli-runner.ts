import * as fs from "node:fs";
import * as path from "node:path";
import { CliCommandDescriptor } from "../models.js";

export interface CliSandboxRunner {
  backend: "native";
  discoverCommands(packagePath: string, fallbackPackageName?: string): Promise<Array<ReturnType<typeof CliCommandDescriptor.parse>>>;
}

function extractCliCommands(
  packageJson: Record<string, unknown>,
  fallbackPackageName?: string,
): Array<{ name: string; entry: string }> {
  const bin = packageJson.bin;
  const packageName = typeof packageJson.name === "string" ? packageJson.name : fallbackPackageName;
  if (!bin) return [];

  if (typeof bin === "string") {
    if (!packageName) return [];
    return [{ name: packageName, entry: bin }];
  }

  if (typeof bin === "object" && !Array.isArray(bin)) {
    return Object.entries(bin)
      .filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string")
      .map(([name, entry]) => ({ name, entry }));
  }

  return [];
}

export class NativeCliSandboxRunner implements CliSandboxRunner {
  readonly backend = "native" as const;

  async discoverCommands(packagePath: string, fallbackPackageName?: string) {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(packagePath, "package.json"), "utf-8"),
    ) as Record<string, unknown>;
    return extractCliCommands(packageJson, fallbackPackageName).map((command) =>
      CliCommandDescriptor.parse(command),
    );
  }
}

export async function getDefaultCliSandboxRunner(): Promise<CliSandboxRunner> {
  return new NativeCliSandboxRunner();
}
