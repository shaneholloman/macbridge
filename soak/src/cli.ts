import { Soak } from "./context.js";
import { renderHistory, renderRun } from "./display.js";
import { readHistory } from "./history.js";
import { defaultIterations, runRegime } from "./regime.js";
import type { Regime } from "./types.js";

type IO = {
  stdout: Pick<typeof process.stdout, "write">;
  stderr: Pick<typeof process.stderr, "write">;
};

function usage(): string {
  return [
    "usage:",
    "  macbridge soak smoke [--live-textedit] [--live-helium]",
    "  macbridge soak stress [--live-textedit] [--live-helium] [--record-video] [--record-target display|desktop|window] [--record-display main|N] [--record-fps N]",
    "  macbridge soak burn [--live-textedit] [--live-helium] [--iterations N] [--record-video] [--record-target display|desktop|window] [--record-display main|N] [--record-fps N]",
    "  macbridge soak tui",
  ].join("\n");
}

function parseRegime(value: string | undefined): Regime | "tui" {
  if (value === "smoke" || value === "stress" || value === "burn" || value === "tui") {
    return value;
  }
  throw new Error(usage());
}

function parseIterations(args: string[], regime: Regime): number {
  const index = args.indexOf("--iterations");
  if (index === -1) return defaultIterations(regime);
  const value = args[index + 1];
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("--iterations must be a positive integer");
  }
  return parsed;
}

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function parseDisplay(value: string | undefined): string | number {
  if (value == null || value === "main") return "main";
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : value;
}

function parseRecordTarget(value: string | undefined): "display" | "desktop" | "window" {
  if (value == null) return "display";
  if (value === "display" || value === "desktop" || value === "window") return value;
  throw new Error("--record-target must be display, desktop, or window");
}

function parseFps(value: string | undefined): number {
  if (value == null) return 2;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("--record-fps must be a positive number");
  }
  return parsed;
}

export async function runSoakCLI(args = process.argv.slice(2), io: IO = process): Promise<number> {
  let command: Regime | "tui";
  try {
    command = parseRegime(args[0]);
  } catch (error) {
    io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  if (command === "tui") {
    const history = await readHistory();
    io.stdout.write(`${renderHistory(history)}\n`);
    return 0;
  }

  const ctx = new Soak({
    regime: command,
    liveTextEdit: args.includes("--live-textedit"),
    liveHelium: args.includes("--live-helium"),
    recordVideo: args.includes("--record-video"),
    recordTarget: parseRecordTarget(optionValue(args, "--record-target")),
    recordDisplay: parseDisplay(optionValue(args, "--record-display")),
    recordFps: parseFps(optionValue(args, "--record-fps")),
    iterations: parseIterations(args, command),
  });

  const history = await readHistory();

  try {
    await ctx.init();
    await runRegime(ctx);
    const summary = await ctx.finish(history);
    io.stdout.write(`${renderRun(summary, [...history, summary])}\n`);
    return 0;
  } catch (error) {
    ctx.logger.error({ error }, "soak failed");
    const summary = await ctx.finish(history);
    io.stdout.write(`${renderRun(summary, [...history, summary])}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await runSoakCLI());
}
