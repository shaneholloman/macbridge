import type { ControlPlane } from "../core/control.js";
import { captureLane, resolveLane, sendLane, startLane, stopLane } from "./lane.js";

type IO = {
  stdout: Pick<typeof process.stdout, "write">;
  stderr: Pick<typeof process.stderr, "write">;
};

export function terminalUsage(): string {
  return [
    "usage:",
    "  macbridge terminal start [--screen <name>] [--session <name>] [--cwd <path>] [--command <text>] [--writable]",
    "  macbridge terminal send <text> [--screen <name>] [--session <name>] [--no-enter]",
    "  macbridge terminal capture [--screen <name>] [--session <name>] [-o <path>]",
    "  macbridge terminal status [--screen <name>] [--session <name>]",
    "  macbridge terminal stop [--session <name>]",
  ].join("\n");
}

export function runTerminalCommand(args: string[], control: ControlPlane, io: IO): number {
  const command = args[0];
  try {
    switch (command) {
      case undefined:
      case "-h":
      case "--help":
        io.stdout.write(`${terminalUsage()}\n`);
        return 0;
      case "start":
        io.stdout.write(
          `${JSON.stringify(startLane(control, parseStart(args.slice(1))), null, 2)}\n`,
        );
        return 0;
      case "send": {
        const parsed = parseSend(args.slice(1));
        io.stdout.write(`${JSON.stringify(sendLane(control, parsed), null, 2)}\n`);
        return 0;
      }
      case "capture": {
        const path = captureLane(control, parseCapture(args.slice(1)));
        io.stdout.write(`${path}\n`);
        return 0;
      }
      case "status":
        io.stdout.write(
          `${JSON.stringify(resolveLane(control, parseStatus(args.slice(1))), null, 2)}\n`,
        );
        return 0;
      case "stop":
        io.stdout.write(
          `${JSON.stringify(stopLane(control, parseStop(args.slice(1))), null, 2)}\n`,
        );
        return 0;
      default:
        io.stderr.write(`unknown terminal command: ${command}\n${terminalUsage()}\n`);
        return 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message}\n`);
    return 1;
  }
}

function parseStart(args: string[]) {
  const options: {
    screen?: string;
    session?: string;
    cwd?: string;
    command?: string;
    writable?: boolean;
  } = {};
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
      case "--cwd":
        options.cwd = requiredValue(args, index, arg);
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
        throw new Error(`unknown terminal start option: ${arg}`);
    }
  }
  return options;
}

function parseSend(args: string[]) {
  const text = args[0];
  if (text == null) throw new Error(terminalUsage());
  const options: { screen?: string; session?: string; text: string; enter?: boolean } = {
    text,
    enter: true,
  };
  for (let index = 1; index < args.length; index += 1) {
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
      case "--no-enter":
        options.enter = false;
        break;
      default:
        throw new Error(`unknown terminal send option: ${arg}`);
    }
  }
  return options;
}

function parseCapture(args: string[]) {
  const options: { screen?: string; session?: string; out?: string } = {};
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
        throw new Error(`unknown terminal capture option: ${arg}`);
    }
  }
  return options;
}

function parseStatus(args: string[]) {
  const options: { screen?: string; session?: string } = {};
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
        throw new Error(`unknown terminal status option: ${arg}`);
    }
  }
  return options;
}

function parseStop(args: string[]) {
  const options: { session?: string } = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--session":
        options.session = requiredValue(args, index, arg);
        index += 1;
        break;
      default:
        throw new Error(`unknown terminal stop option: ${arg}`);
    }
  }
  return options;
}

function requiredValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value == null || value === "") throw new Error(`${flag} needs a value`);
  return value;
}
