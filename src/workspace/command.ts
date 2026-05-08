import type { ControlPlane } from "../core/control.js";
import type { Target } from "../protocol/types.js";
import { focusOffset, maximizeTarget, workspaceSelection } from "./workspace.js";

type IO = {
  stdout: Pick<typeof process.stdout, "write">;
  stderr: Pick<typeof process.stderr, "write">;
};

export function workspaceUsage(): string {
  return [
    "usage:",
    "  macbridge workspace apps [--screen <name>]",
    "  macbridge workspace focus app <name> [--screen <name>]",
    "  macbridge workspace focus window <wid> [--screen <name>]",
    "  macbridge workspace maximize app <name> [--screen <name>]",
    "  macbridge workspace maximize window <wid> [--screen <name>]",
    "  macbridge workspace next [--screen <name>]",
    "  macbridge workspace prev [--screen <name>]",
  ].join("\n");
}

export function runWorkspaceCommand(args: string[], control: ControlPlane, io: IO): number {
  const command = args[0];
  try {
    switch (command) {
      case undefined:
      case "-h":
      case "--help":
        io.stdout.write(`${workspaceUsage()}\n`);
        return 0;
      case "apps": {
        const selection = workspaceSelection(control, parseScreen(args.slice(1)));
        io.stdout.write(`${JSON.stringify(selection, null, 2)}\n`);
        return 0;
      }
      case "focus": {
        const parsed = parseTarget(args.slice(1));
        const window = maximizeTarget(control, parsed.target, {
          ...(parsed.screen == null ? {} : { screen: parsed.screen }),
          activate: true,
        });
        io.stdout.write(`${JSON.stringify(window ?? null, null, 2)}\n`);
        return window == null ? 1 : 0;
      }
      case "maximize": {
        const parsed = parseTarget(args.slice(1));
        const window = maximizeTarget(control, parsed.target, {
          ...(parsed.screen == null ? {} : { screen: parsed.screen }),
          activate: false,
        });
        io.stdout.write(`${JSON.stringify(window ?? null, null, 2)}\n`);
        return window == null ? 1 : 0;
      }
      case "next": {
        const window = focusOffset(control, { ...parseScreen(args.slice(1)), offset: 1 });
        io.stdout.write(`${JSON.stringify(window ?? null, null, 2)}\n`);
        return window == null ? 1 : 0;
      }
      case "prev": {
        const window = focusOffset(control, { ...parseScreen(args.slice(1)), offset: -1 });
        io.stdout.write(`${JSON.stringify(window ?? null, null, 2)}\n`);
        return window == null ? 1 : 0;
      }
      default:
        io.stderr.write(`unknown workspace command: ${command}\n${workspaceUsage()}\n`);
        return 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message}\n`);
    return 1;
  }
}

function parseScreen(args: string[]): { screen?: string } {
  const options: { screen?: string } = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--screen":
        options.screen = requiredValue(args, index, arg);
        index += 1;
        break;
      default:
        throw new Error(`unknown workspace option: ${arg}`);
    }
  }
  return options;
}

function parseTarget(args: string[]): { target: Target; screen?: string } {
  const kind = args[0];
  const value = args[1];
  if (kind == null || value == null) {
    throw new Error(workspaceUsage());
  }

  let target: Target;
  switch (kind) {
    case "app":
      target = { kind: "app", name: value };
      break;
    case "window":
      target = { kind: "window", wid: Number(value) };
      if (!Number.isInteger(target.wid) || target.wid < 0) {
        throw new Error("workspace window target needs a non-negative integer id");
      }
      break;
    default:
      throw new Error(workspaceUsage());
  }

  return { target, ...parseScreen(args.slice(2)) };
}

function requiredValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value == null || value === "") throw new Error(`${flag} needs a value`);
  return value;
}
