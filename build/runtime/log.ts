import { createLogger } from "../../src/core/log.ts";

export function createBuildLog(command: string) {
  return createLogger(`build:${command}`);
}

export type TimedStage = {
  error: (message?: string) => void;
  ok: (message?: string) => void;
};

export type BuildLogger = {
  error: (message: string) => void;
  info: (message: string) => void;
  ok: (message: string) => void;
  start: (label: string) => TimedStage;
  step: (message: string) => void;
  warn: (message: string) => void;
};

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function createBuildLogger(command = "ghostty"): BuildLogger {
  const log = createBuildLog(command);

  const info = (message: string): void => log.info(message);
  const warn = (message: string): void => log.warn(message);
  const error = (message: string): void => log.error(message);
  const step = (message: string): void => log.info(`> ${message}...`);
  const ok = (message: string): void => log.info(`[OK] ${message}`);

  return {
    error,
    info,
    ok,
    step,
    warn,
    start(label: string): TimedStage {
      step(label);
      const startedAt = performance.now();
      return {
        error(message?: string): void {
          error(`${message ?? label} (${formatDuration(performance.now() - startedAt)})`);
        },
        ok(message?: string): void {
          ok(`${message ?? label} (${formatDuration(performance.now() - startedAt)})`);
        },
      };
    },
  };
}
