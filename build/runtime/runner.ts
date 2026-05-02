import { createHash } from "node:crypto";
import { appendFile, mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "pino";
import { paths } from "./paths.ts";

export type RunOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  allowFailure?: boolean;
  dryRun?: boolean;
  logger?: {
    info: (message: string) => void;
    ok?: (message: string) => void;
  };
};

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function removePath(path: string): Promise<void> {
  await rm(path, { force: true, recursive: true });
}

export async function copyFile(source: string, destination: string): Promise<void> {
  await Bun.write(destination, Bun.file(source));
}

export async function moveFile(source: string, destination: string): Promise<void> {
  await rename(source, destination);
}

export async function fileSHA256(path: string): Promise<string> {
  const hasher = createHash("sha256");
  hasher.update(Buffer.from(await Bun.file(path).arrayBuffer()));
  return hasher.digest("hex");
}

export async function run(
  log: Logger,
  cmd: string[],
  options: RunOptions = {},
): Promise<{ stdout: string; stderr: string; status: number; durationMs: number }> {
  const started = performance.now();
  log.info({ cmd: cmd.join(" ") }, "running command");
  const proc = Bun.spawnSync({
    cmd,
    ...(options.cwd == null ? {} : { cwd: options.cwd }),
    ...(options.env == null ? {} : { env: options.env }),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const durationMs = Math.round(performance.now() - started);
  const stdout = proc.stdout.toString().trimEnd();
  const stderr = proc.stderr.toString().trimEnd();
  const result = { stdout, stderr, status: proc.exitCode, durationMs };
  await writeRunEvidence(cmd, result, options);

  if (proc.exitCode !== 0 && options.allowFailure !== true) {
    log.error({ cmd: cmd.join(" "), durationMs, stderr, stdout }, "command failed");
    throw new Error(`${cmd.join(" ")} failed: ${stderr || stdout || proc.exitCode}`);
  }

  log.info({ cmd: cmd.join(" "), durationMs, status: proc.exitCode }, "command finished");
  return result;
}

export async function runCommand(parts: string[], options: RunOptions = {}): Promise<void> {
  if (parts.length === 0) {
    throw new Error("Cannot run empty command");
  }

  const commandText = parts.map(quoteArg).join(" ");
  options.logger?.info(`Command: ${commandText}`);

  if (options.dryRun === true) {
    options.logger?.ok?.(`Dry run skipped: ${commandText}`);
    return;
  }

  const runOptions: RunOptions = {
    ...(options.cwd == null ? {} : { cwd: options.cwd }),
    ...(options.env == null ? {} : { env: options.env }),
    ...(options.allowFailure == null ? {} : { allowFailure: options.allowFailure }),
  };
  const result = await run(createNoopLogger(), parts, runOptions);

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${commandText}`);
  }
}

function quoteArg(value: string): string {
  return /[^\w./:@=-]/.test(value) ? JSON.stringify(value) : value;
}

function createNoopLogger(): Logger {
  return {
    info: () => undefined,
    error: () => undefined,
  } as unknown as Logger;
}

async function writeRunEvidence(
  cmd: string[],
  result: { stdout: string; stderr: string; status: number; durationMs: number },
  options: RunOptions,
): Promise<void> {
  const finishedAt = new Date().toISOString();
  const command = {
    command: cmd,
    commandText: cmd.join(" "),
    cwd: options.cwd ?? process.cwd(),
    finishedAt,
    status: result.status,
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
  };
  const timing = {
    command: cmd,
    commandText: cmd.join(" "),
    finishedAt,
    status: result.status,
    durationMs: result.durationMs,
  };

  await ensureDir(paths.dist.logs);
  await ensureDir(paths.dist.timings);
  await appendFile(join(paths.dist.logs, "commands.jsonl"), `${JSON.stringify(command)}\n`);
  await appendFile(join(paths.dist.timings, "commands.jsonl"), `${JSON.stringify(timing)}\n`);
}
