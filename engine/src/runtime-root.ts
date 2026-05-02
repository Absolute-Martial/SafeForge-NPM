import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "./config.js";

function resolvePath(value: string): string {
  return path.resolve(value);
}

export function getRuntimeRoot(): string {
  const runtimeRoot = resolvePath(config.runtimeRoot);
  fs.mkdirSync(runtimeRoot, { recursive: true });
  return runtimeRoot;
}

export function getRuntimeHostRoot(): string {
  return resolvePath(config.runtimeHostRoot ?? config.runtimeRoot);
}

export function createRuntimeTempDir(prefix: string): string {
  const runtimeRoot = getRuntimeRoot();
  return fs.mkdtempSync(path.join(runtimeRoot, prefix));
}

export function toDockerMountSource(targetPath: string): string {
  const resolved = resolvePath(targetPath);
  const runtimeRoot = getRuntimeRoot();
  if (resolved === runtimeRoot) {
    return getRuntimeHostRoot();
  }

  const runtimePrefix = `${runtimeRoot}${path.sep}`;
  if (!resolved.startsWith(runtimePrefix)) {
    return resolved;
  }

  return path.join(getRuntimeHostRoot(), path.relative(runtimeRoot, resolved));
}
