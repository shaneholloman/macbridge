import { join, resolve } from "node:path";
import { ARIA_DEV_COMMAND, ARIA_DEV_SESSION, observeAriaInstalled } from "../apps/aria.js";
import type { ControlPlane } from "../core/control.js";
import {
  captureLane,
  resolveLane,
  startLane,
  stopLane,
  type TerminalCaptureOptions,
  type TerminalStartOptions,
} from "../terminal/lane.js";

type IO = {
  stdout: Pick<typeof process.stdout, "write">;
  stderr: Pick<typeof process.stderr, "write">;
};

export type AriaDevStartOptions = {
  screen?: string;
  session: string;
  repo: string;
  command: string;
  writable?: boolean;
};

export type AriaSessionOptions = {
  screen?: string;
  session: string;
};

export type AriaCaptureOptions = AriaSessionOptions & {
  out?: string;
};

export type AriaInstalledObserveOptions = {
  launch: boolean;
  prompt: boolean;
  outDir: string;
};

export function ariaUsage(): string {
  return [
    "usage:",
    "  macbridge aria dev start [--screen <name>] [--session <name>] [--repo <path>] [--command <text>] [--writable]",
    "  macbridge aria dev status [--screen <name>] [--session <name>]",
    "  macbridge aria dev capture [--screen <name>] [--session <name>] [-o <path>]",
    "  macbridge aria dev stop [--session <name>]",
    "  macbridge aria installed observe [--launch] [--prompt] [--out DIR]",
    "",
    "modes:",
    "  dev        Starts a source checkout in the terminal lane with bun run dev.",
    "  installed  Targets the packaged macOS Aria app bundle.",
  ].join("\n");
}

export async function runAriaCommand(
  args: string[],
  createControl: () => ControlPlane,
  io: IO,
): Promise<number> {
  const mode = args[0];
  try {
    switch (mode) {
      case undefined:
      case "-h":
      case "--help":
      case "help":
        io.stdout.write(`${ariaUsage()}\n`);
        return 0;
      case "dev":
        return runAriaDev(args.slice(1), createControl(), io);
      case "installed":
        return await runAriaInstalled(args.slice(1), createControl, io);
      default:
        io.stderr.write(`unknown aria mode: ${mode}\n${ariaUsage()}\n`);
        return 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message}\n`);
    return 1;
  }
}

export function parseAriaDevStartArgs(args: string[]): AriaDevStartOptions {
  const options: AriaDevStartOptions = {
    session: ARIA_DEV_SESSION,
    repo: process.cwd(),
    command: ARIA_DEV_COMMAND,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--screen":
        options.screen = requiredValue(args, index, arg);
        index += 1;
        break;
      case "--session":
        options.session = requiredValue(args, index, arg);
        index += 1;
        break;
      case "--repo":
        options.repo = resolve(requiredValue(args, index, arg));
        index += 1;
        break;
      case "--command":
        options.command = requiredValue(args, index, arg);
        index += 1;
        break;
      case "--writable":
        options.writable = true;
        break;
      default:
        throw new Error(`unknown aria dev start option: ${arg}`);
    }
  }

  return options;
}

export function parseAriaSessionArgs(args: string[]): AriaSessionOptions {
  const options: AriaSessionOptions = { session: ARIA_DEV_SESSION };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--screen":
        options.screen = requiredValue(args, index, arg);
        index += 1;
        break;
      case "--session":
        options.session = requiredValue(args, index, arg);
        index += 1;
        break;
      default:
        throw new Error(`unknown aria session option: ${arg}`);
    }
  }
  return options;
}

export function parseAriaCaptureArgs(args: string[]): AriaCaptureOptions {
  const options: AriaCaptureOptions = { session: ARIA_DEV_SESSION };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--screen":
        options.screen = requiredValue(args, index, arg);
        index += 1;
        break;
      case "--session":
        options.session = requiredValue(args, index, arg);
        index += 1;
        break;
      case "-o":
      case "--out":
        options.out = requiredValue(args, index, arg);
        index += 1;
        break;
      default:
        throw new Error(`unknown aria dev capture option: ${arg}`);
    }
  }
  return options;
}

export function parseAriaInstalledObserveArgs(args: string[]): AriaInstalledObserveOptions {
  const options: AriaInstalledObserveOptions = {
    launch: false,
    prompt: false,
    outDir: join("tmp", "observations", `aria-${stamp()}`),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--launch":
        options.launch = true;
        break;
      case "--prompt":
        options.prompt = true;
        break;
      case "-o":
      case "--out":
        options.outDir = requiredValue(args, index, arg);
        index += 1;
        break;
      default:
        throw new Error(`unknown aria installed observe option: ${arg}`);
    }
  }

  return options;
}

function runAriaDev(args: string[], control: ControlPlane, io: IO): number {
  const command = args[0];
  switch (command) {
    case undefined:
    case "-h":
    case "--help":
    case "help":
      io.stdout.write(`${ariaUsage()}\n`);
      return 0;
    case "start": {
      const options = parseAriaDevStartArgs(args.slice(1));
      io.stdout.write(
        `${JSON.stringify(
          {
            mode: "dev",
            repo: options.repo,
            command: options.command,
            lane: startLane(control, terminalStart(options)),
          },
          null,
          2,
        )}\n`,
      );
      return 0;
    }
    case "status": {
      const options = parseAriaSessionArgs(args.slice(1));
      io.stdout.write(
        `${JSON.stringify({ mode: "dev", lane: resolveLane(control, options) }, null, 2)}\n`,
      );
      return 0;
    }
    case "capture": {
      const options = parseAriaCaptureArgs(args.slice(1));
      const out = captureLane(control, terminalCapture(options));
      io.stdout.write(`${JSON.stringify({ mode: "dev", out }, null, 2)}\n`);
      return 0;
    }
    case "stop": {
      const options = parseAriaSessionArgs(args.slice(1));
      io.stdout.write(
        `${JSON.stringify({ mode: "dev", lane: stopLane(control, options) }, null, 2)}\n`,
      );
      return 0;
    }
    default:
      io.stderr.write(`unknown aria dev command: ${command}\n${ariaUsage()}\n`);
      return 1;
  }
}

async function runAriaInstalled(
  args: string[],
  createControl: () => ControlPlane,
  io: IO,
): Promise<number> {
  const command = args[0];
  switch (command) {
    case undefined:
    case "-h":
    case "--help":
    case "help":
      io.stdout.write(`${ariaUsage()}\n`);
      return 0;
    case "observe": {
      const options = parseAriaInstalledObserveArgs(args.slice(1));
      const output = await observeAriaInstalled(
        {
          launch: options.launch,
          prompt: options.prompt,
          outDir: options.outDir,
        },
        createControl(),
      );
      io.stdout.write(`${JSON.stringify({ mode: "installed", ...output }, null, 2)}\n`);
      return 0;
    }
    default:
      io.stderr.write(`unknown aria installed command: ${command}\n${ariaUsage()}\n`);
      return 1;
  }
}

function terminalStart(options: AriaDevStartOptions): TerminalStartOptions {
  return {
    ...(options.screen == null ? {} : { screen: options.screen }),
    session: options.session,
    cwd: options.repo,
    command: options.command,
    ...(options.writable == null ? {} : { writable: options.writable }),
  };
}

function terminalCapture(options: AriaCaptureOptions): TerminalCaptureOptions {
  return {
    ...(options.screen == null ? {} : { screen: options.screen }),
    session: options.session,
    ...(options.out == null ? {} : { out: options.out }),
  };
}

function requiredValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value == null || value === "") throw new Error(`${flag} needs a value`);
  return value;
}

function stamp(): string {
  return new Date().toISOString().replaceAll(/[-:.]/g, "").replace("T", "T").replace("Z", "Z");
}
