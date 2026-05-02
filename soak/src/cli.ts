import { Soak } from "./context.ts";
import { renderHistory, renderRun } from "./display.ts";
import { readHistory } from "./history.ts";
import { defaultIterations, runRegime } from "./regime.ts";
import type { Regime } from "./types.ts";

function usage(): string {
  return [
    "usage:",
    "  bun soak/src/cli.ts smoke [--live-textedit] [--live-helium]",
    "  bun soak/src/cli.ts stress [--live-textedit] [--live-helium] [--record-video] [--record-target display|desktop|window] [--record-display main|N] [--record-fps N]",
    "  bun soak/src/cli.ts burn [--live-textedit] [--live-helium] [--iterations N] [--record-video] [--record-target display|desktop|window] [--record-display main|N] [--record-fps N]",
    "  bun soak/src/cli.ts tui",
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

const args = process.argv.slice(2);
const command = parseRegime(args[0]);

if (command === "tui") {
  const history = await readHistory();
  process.stdout.write(`${renderHistory(history)}\n`);
  process.exit(0);
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
  process.stdout.write(`${renderRun(summary, [...history, summary])}\n`);
} catch (error) {
  ctx.logger.error({ error }, "soak failed");
  const summary = await ctx.finish(history);
  process.stdout.write(`${renderRun(summary, [...history, summary])}\n`);
  process.exit(1);
}
