import * as fs from "node:fs";
import * as path from "node:path";
import { CliCommandDescriptor } from "../models.js";

export interface CliSandboxRunner {
  backend: "vendored-npt" | "native";
  discoverCommands(packagePath: string, fallbackPackageName?: string): Promise<Array<ReturnType<typeof CliCommandDescriptor.parse>>>;
}

interface VendoredCommand {
  name: string;
  path: string;
}

interface VendoredPackageInfo {
  commands?: VendoredCommand[];
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

function vendoredAnalyzerPath(): string {
  return path.resolve(
    import.meta.dirname,
    "../../../third_party/npm-package-tester/dist/application/PackageAnalyzer.js",
  );
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

export class VendoredNptRunner implements CliSandboxRunner {
  readonly backend = "vendored-npt" as const;

  async discoverCommands(packagePath: string, fallbackPackageName?: string) {
    const analyzerModulePath = vendoredAnalyzerPath();
    if (!fs.existsSync(analyzerModulePath)) {
      throw new Error("Vendored npm-package-tester build output is unavailable");
    }

    const { PackageAnalyzer } = (await import(analyzerModulePath)) as {
      PackageAnalyzer: new () => { analyze(packageSource: string): Promise<VendoredPackageInfo> };
    };
    const analyzer = new PackageAnalyzer();
    const result = await analyzer.analyze(packagePath);
    const commands = result.commands ?? [];
    if (commands.length === 0) {
      return new NativeCliSandboxRunner().discoverCommands(packagePath, fallbackPackageName);
    }
    return commands.map((command) =>
      CliCommandDescriptor.parse({
        name: command.name,
        entry: command.path,
      }),
    );
  }
}

export async function getDefaultCliSandboxRunner(): Promise<CliSandboxRunner> {
  return fs.existsSync(vendoredAnalyzerPath())
    ? new VendoredNptRunner()
    : new NativeCliSandboxRunner();
}
