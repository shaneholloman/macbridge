import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { runSoakCLI } from "../../soak/src/cli.js";
import { runAppsCommand } from "../adapter/command.js";
import {
  agentCommandUsage,
  formatModels,
  modelsCommand,
  parseModelsArgs,
  parsePlanArgs,
  parseRunArgs,
  planCommand,
  runPlanCommand,
} from "../agent/command.js";
import { runAriaCommand } from "../aria/command.js";
import { createControlPlane } from "../core/client.js";
import { defaultBin } from "../native/macbridge.js";
import { runPrefsCommand } from "../prefs/command.js";
import { runTerminalCommand } from "../terminal/command.js";
import { runWorkspaceCommand } from "../workspace/command.js";
import {
  CommandUsageError,
  parseActCommand,
  parseObserveCommand,
  parseVerifyCommand,
  runActCommand,
  runObserveCommand,
  runVerifyCommand,
} from "./command.js";

type IO = {
  stdout: Pick<typeof process.stdout, "write">;
  stderr: Pick<typeof process.stderr, "write">;
};

const adapterCommands = new Set([
  "active-window",
  "background",
  "capture",
  "click",
  "cursor",
  "cursor-daemon",
  "displays",
  "doctor",
  "double-click",
  "drag",
  "foreground-app",
  "foreground-desktop",
  "foreground-display",
  "help",
  "hotkey",
  "list-apps",
  "list-displays",
  "list-windows",
  "paste",
  "permissions",
  "press",
  "right-click",
  "screenshot",
  "scroll",
  "service",
  "setup",
  "type",
  "windows",
]);

export function isTypeScriptCommand(command: string | undefined): boolean {
  return command != null;
}

export async function runCLI(args = process.argv.slice(2), io: IO = process): Promise<number> {
  try {
    const command = args[0];
    switch (command) {
      case undefined:
      case "-h":
      case "--help":
      case "help":
        io.stdout.write(`${usage()}\n`);
        return 0;
      case "act":
        return await runAct(args.slice(1), io);
      case "agent":
        return await runAgent(args.slice(1), io);
      case "aria":
        return await runAriaCommand(args.slice(1), createControlPlane, io);
      case "app":
      case "apps":
        return await runAppsCommand(args.slice(1), createControlPlane, io);
      case "observe":
        return await runObserve(args.slice(1), io);
      case "prefs":
        return runPrefsCommand(args.slice(1), createControlPlane(), io);
      case "report":
      case "reports":
        return await runReports(args.slice(1), io);
      case "soak":
        return await runSoakCLI(args.slice(1), io);
      case "terminal":
        return runTerminalCommand(args.slice(1), createControlPlane(), io);
      case "verify":
        return runVerify(args.slice(1), io);
      case "workspace":
        return runWorkspaceCommand(args.slice(1), createControlPlane(), io);
      default:
        if (adapterCommands.has(command)) return runNativeAdapterCommand(args, io);
        io.stderr.write(`unknown command: ${command}\n${usage()}\n`);
        return 1;
    }
  } catch (error) {
    if (error instanceof CommandUsageError) {
      io.stderr.write(
        error.usage == null ? `${error.message}\n` : `${error.message}\n${error.usage}\n`,
      );
      return 1;
    }
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message}\n`);
    return 1;
  }
}

function usage(): string {
  return [
    "MacBridge",
    "",
    "usage:",
    "  macbridge setup",
    "  macbridge doctor",
    "  macbridge permissions check --prompt",
    "  macbridge reports",
    "  macbridge prefs init --preferred-screen left",
    "  macbridge aria dev start --repo /path/to/aria",
    "  macbridge aria installed observe --launch",
    "  macbridge apps list",
    "  macbridge apps observe helium --launch",
    "  macbridge terminal start",
    '  macbridge terminal send "echo hello"',
    "  macbridge workspace apps",
    "  macbridge workspace next",
    "  macbridge soak tui",
    "  macbridge soak smoke",
    "  macbridge windows list",
    "  macbridge displays list",
    "  macbridge capture display main --png -o display.png",
    "  macbridge observe desktop",
    "  macbridge act <action.json>",
    "  macbridge agent models",
    "",
    "MacBridge routes user commands through TypeScript. Native macOS work is delegated to the bundled adapter.",
  ].join("\n");
}

function runNativeAdapterCommand(args: string[], io: IO): number {
  const result = Bun.spawnSync({
    cmd: [defaultBin, ...args],
    stdin: "inherit",
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  if (stdout !== "") io.stdout.write(stdout);
  if (stderr !== "") io.stderr.write(stderr);
  return result.exitCode;
}

async function runReports(args: string[], io: IO): Promise<number> {
  const command = args[0] ?? "latest";
  if (command === "latest" || command === "tui") {
    return await runSoakCLI(["tui"], io);
  }
  io.stderr.write("usage: macbridge reports [latest|tui]\n");
  return 1;
}

async function runAct(args: string[], io: IO): Promise<number> {
  const parsed = parseActCommand(args);
  if (parsed.kind === "help") {
    io.stdout.write(`${parsed.usage}\n`);
    return 0;
  }

  const result = await runActCommand(parsed.options, createControlPlane());
  io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.status === "pass" ? 0 : 1;
}

async function runAgent(args: string[], io: IO): Promise<number> {
  const command = args[0];
  if (command == null || command === "-h" || command === "--help") {
    io.stdout.write(`${agentCommandUsage()}\n`);
    return 0;
  }

  switch (command) {
    case "models": {
      const options = parseModelsArgs(args.slice(1));
      io.stdout.write(formatModels(options, modelsCommand(options)));
      return 0;
    }
    case "plan": {
      const options = parsePlanArgs(args.slice(1));
      await writeJSON(options.out, await planCommand(options), io);
      return 0;
    }
    case "run": {
      const options = parseRunArgs(args.slice(1));
      await writeJSON(options.out, await runPlanCommand(options), io);
      return 0;
    }
    default:
      io.stderr.write(`unknown agent command: ${command}\n${agentCommandUsage()}\n`);
      return 1;
  }
}

async function runObserve(args: string[], io: IO): Promise<number> {
  const parsed = parseObserveCommand(args);
  if (parsed.kind === "help") {
    io.stdout.write(`${parsed.usage}\n`);
    return 0;
  }

  const output = await runObserveCommand(parsed.options, createControlPlane());
  io.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return 0;
}

function runVerify(args: string[], io: IO): number {
  const parsed = parseVerifyCommand(args);
  if (parsed.kind === "help") {
    io.stdout.write(`${parsed.usage}\n`);
    return 0;
  }

  const result = runVerifyCommand(parsed.options, createControlPlane());
  io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.status === "pass" ? 0 : 1;
}

async function writeJSON(path: string | undefined, value: unknown, io: IO): Promise<void> {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (path == null || path === "-") {
    io.stdout.write(text);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  await Bun.write(path, text);
  io.stdout.write(`${path}\n`);
}

if (import.meta.main) {
  process.exit(await runCLI());
}
