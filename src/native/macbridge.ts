import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type WindowInfo = {
  pid: number;
  wid: number;
  x: number;
  y: number;
  width: number;
  height: number;
  owner: string;
  name: string;
  bundleID?: string;
};

export type RunOptions = {
  bin?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
  input?: string;
};

export type RunResult = {
  stdout: string;
  stderr: string;
  status: number;
};

export function devNativeBin(): string {
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "tmp/swiftpm/arm64-apple-macosx/release/macbridge";
  }
  if (process.platform === "darwin" && process.arch === "x64") {
    return "tmp/swiftpm/x86_64-apple-macosx/release/macbridge";
  }
  return "tmp/swiftpm/release/macbridge";
}

export const devBin = devNativeBin();

export function packagedBin(): string | undefined {
  if (process.platform !== "darwin") return undefined;
  if (process.arch !== "arm64" && process.arch !== "x64") return undefined;

  const base = dirname(fileURLToPath(import.meta.url));
  const appBin = join(
    base,
    "app",
    `darwin-${process.arch}`,
    "MacBridge.app",
    "Contents",
    "MacOS",
    "macbridge",
  );
  if (existsSync(appBin)) return appBin;

  const standalone = join(base, "bin", `macbridge-darwin-${process.arch}`);
  return existsSync(standalone) ? standalone : undefined;
}

export function resolveDefaultBin(): string {
  return process.env.BIN ?? packagedBin() ?? devBin;
}

export const defaultBin = resolveDefaultBin();

export function envString(name: string, fallback: string): string {
  const value = process.env[name];
  return value == null || value === "" ? fallback : value;
}

export function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number, got ${value}`);
  }
  return parsed;
}

export function ensureExecutable(bin = defaultBin): void {
  if (!existsSync(bin)) {
    throw new Error(`missing ${bin}; run: bun run build:native`);
  }
}

export function run(args: string[], options: RunOptions = {}): RunResult {
  const bin = options.bin ?? defaultBin;
  const child = Bun.spawnSync({
    cmd: [bin, ...args],
    ...(options.cwd == null ? {} : { cwd: options.cwd }),
    ...(options.env == null ? {} : { env: options.env }),
    stdin: options.input == null ? "pipe" : new Blob([options.input]),
    stdout: "pipe",
    stderr: "pipe",
  });

  const result = {
    stdout: child.stdout.toString().trimEnd(),
    stderr: child.stderr.toString().trimEnd(),
    status: child.exitCode,
  };

  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || `exit ${result.status}`;
    throw new Error(`${bin} ${args.join(" ")} failed: ${detail}`);
  }

  return result;
}

export function runJSON<T extends Json>(args: string[], options: RunOptions = {}): T {
  const { stdout } = run(args, options);
  return JSON.parse(stdout) as T;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
