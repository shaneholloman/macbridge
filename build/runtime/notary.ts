import type { Logger } from "pino";
import { run } from "./runner.ts";

export type NotaryLogger = {
  error: (message: string) => void;
  info: (message: string) => void;
  ok: (message: string) => void;
  step: (message: string) => void;
  warn: (message: string) => void;
};

export type NotarizeArtifactOptions = {
  artifactPath: string;
  keychainProfile: string;
  log: NotaryLogger;
  name?: string;
  staplePath?: string;
};

export async function notarizeArtifact(options: NotarizeArtifactOptions): Promise<string> {
  const name = options.name ?? options.artifactPath;
  options.log.step(`Notarizing ${name}`);
  const result = await run(createLoggerAdapter(options.log), [
    "xcrun",
    "notarytool",
    "submit",
    options.artifactPath,
    "--keychain-profile",
    options.keychainProfile,
    "--wait",
    "--output-format",
    "json",
  ]);
  const parsed = JSON.parse(result.stdout) as { status?: string };
  if (parsed.status !== "Accepted") {
    throw new Error(`${name} notarization was not accepted: ${result.stdout}`);
  }

  const staplePath = options.staplePath ?? options.artifactPath;
  await run(createLoggerAdapter(options.log), ["xcrun", "stapler", "staple", staplePath]);
  await run(createLoggerAdapter(options.log), ["xcrun", "stapler", "validate", staplePath]);
  options.log.ok(`${name} notarized`);
  return result.stdout;
}

function createLoggerAdapter(log: NotaryLogger): Logger {
  return {
    info: (data: unknown, message?: string) => log.info(message ?? String(data)),
    error: (data: unknown, message?: string) => log.error(message ?? String(data)),
  } as unknown as Logger;
}
