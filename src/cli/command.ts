import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ControlPlane } from "../core/control.js";
import { parseAction, parseExpectation } from "../protocol/schema.js";
import type {
  Action,
  ActionResult,
  Artifact,
  CoordMode,
  DisplaySelector,
  Expectation,
  Point,
  Target,
  Verification,
} from "../protocol/types.js";

export type ActCommandOptions = {
  actionPath: string;
};

export type ParsedCommand<T> = { kind: "run"; options: T } | { kind: "help"; usage: string };

export type VerifyCommandOptions = {
  expectationPath: string;
};

export type ObserveCommandOptions = {
  target: Target;
  outDir: string;
  targetScreenshot: boolean;
  displayScreenshot: false | { display?: DisplaySelector };
  accessibility: false | Point;
  requirePermissions: boolean;
  promptPermissions: boolean;
  redactedSummary: boolean;
  maxDepth?: number | undefined;
  maxArrayItems?: number | undefined;
};

export type ObserveCommandOutput = {
  target: Target;
  outDir: string;
  observation: string;
  redactedSummary?: string;
  targetScreenshot?: Artifact;
  displayScreenshot?: Artifact;
  artifacts: Artifact[];
};

export class CommandUsageError extends Error {
  readonly usage: string | undefined;

  constructor(message: string, usage?: string) {
    super(message);
    this.name = "CommandUsageError";
    this.usage = usage;
  }
}

export function readActionFile(path: string): Action {
  const text = readFileSync(path, "utf8");
  return parseAction(JSON.parse(text));
}

export function readExpectationFile(path: string): Expectation {
  const text = readFileSync(path, "utf8");
  return parseExpectation(JSON.parse(text));
}

export function actCommandUsage(): string {
  return ["usage:", "  macbridge act <action.json>"].join("\n");
}

export function verifyCommandUsage(): string {
  return ["usage:", "  macbridge verify <expectation.json>"].join("\n");
}

export function observeCommandUsage(): string {
  return [
    "usage:",
    "  macbridge observe window <wid> [options]",
    "  macbridge observe app <name> [options]",
    "  macbridge observe app --bundle-id <id> [options]",
    "  macbridge observe app --pid <pid> [options]",
    "  macbridge observe display <display> [options]",
    "  macbridge observe desktop [options]",
    "",
    "options:",
    "  --out <dir>",
    "  --target-screenshot | --no-target-screenshot",
    "  --display-screenshot [display]",
    "  --ax [x y]",
    "  --coord pixel|normalized|global",
    "  --no-redacted-summary",
    "  --redaction-depth <n>",
    "  --redaction-array-items <n>",
    "  --require-permissions",
    "  --prompt-permissions",
  ].join("\n");
}

export function parseActCommand(args: string[]): ParsedCommand<ActCommandOptions> {
  const first = args[0];
  const usage = actCommandUsage();
  if (first == null || first === "-h" || first === "--help") return { kind: "help", usage };
  if (args.length > 1) throw new CommandUsageError(`unexpected argument: ${args[1]}`, usage);
  return { kind: "run", options: { actionPath: first } };
}

export function parseVerifyCommand(args: string[]): ParsedCommand<VerifyCommandOptions> {
  const first = args[0];
  const usage = verifyCommandUsage();
  if (first == null || first === "-h" || first === "--help") return { kind: "help", usage };
  if (args.length > 1) throw new CommandUsageError(`unexpected argument: ${args[1]}`, usage);
  return { kind: "run", options: { expectationPath: first } };
}

export function parseObserveCommand(args: string[]): ParsedCommand<ObserveCommandOptions> {
  const usage = observeCommandUsage();
  const parsedTarget = parseTarget(args, usage);
  if (parsedTarget.help) return { kind: "help", usage };
  const { target, index } = parsedTarget;

  const options: ObserveCommandOptions = {
    target,
    outDir: `tmp/observations/${stamp()}-${targetLabel(target).replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`,
    targetScreenshot: true,
    displayScreenshot: false,
    accessibility: false,
    requirePermissions: false,
    promptPermissions: false,
    redactedSummary: true,
  };

  let coord: CoordMode = "normalized";
  for (let cursor = index; cursor < args.length; cursor += 1) {
    const arg = args[cursor];
    switch (arg) {
      case "--out": {
        const value = args[cursor + 1];
        if (value == null) throw new CommandUsageError("--out needs a directory", usage);
        options.outDir = value;
        cursor += 1;
        break;
      }
      case "--target-screenshot":
        options.targetScreenshot = true;
        break;
      case "--no-target-screenshot":
        options.targetScreenshot = false;
        break;
      case "--display-screenshot": {
        const value = args[cursor + 1];
        if (value == null || value.startsWith("--")) {
          options.displayScreenshot = {};
        } else {
          options.displayScreenshot = { display: value };
          cursor += 1;
        }
        break;
      }
      case "--ax": {
        const x = args[cursor + 1];
        const y = args[cursor + 2];
        if (x != null && y != null && !x.startsWith("--") && !y.startsWith("--")) {
          options.accessibility = {
            x: numberArg("--ax x", x),
            y: numberArg("--ax y", y),
            coord,
          };
          cursor += 2;
        } else {
          options.accessibility = { x: 0.5, y: 0.5, coord };
        }
        break;
      }
      case "--coord": {
        const value = args[cursor + 1];
        if (value == null) throw new CommandUsageError("--coord needs a value", usage);
        coord = coordArg(value, usage);
        if (options.accessibility !== false) {
          options.accessibility = { ...options.accessibility, coord };
        }
        cursor += 1;
        break;
      }
      case "--no-redacted-summary":
        options.redactedSummary = false;
        break;
      case "--redaction-depth":
        options.maxDepth = intArg("--redaction-depth", args[cursor + 1]);
        cursor += 1;
        break;
      case "--redaction-array-items":
        options.maxArrayItems = intArg("--redaction-array-items", args[cursor + 1]);
        cursor += 1;
        break;
      case "--require-permissions":
        options.requirePermissions = true;
        break;
      case "--prompt-permissions":
        options.promptPermissions = true;
        break;
      case "-h":
      case "--help":
        return { kind: "help", usage };
      default:
        throw new CommandUsageError(`unknown option: ${arg}`, usage);
    }
  }
  return { kind: "run", options };
}

export async function runActCommand(
  options: ActCommandOptions,
  control: ControlPlane,
): Promise<ActionResult> {
  return control.act(readActionFile(options.actionPath));
}

export function runVerifyCommand(
  options: VerifyCommandOptions,
  control: ControlPlane,
): Verification {
  return control.verify(readExpectationFile(options.expectationPath));
}

export async function runObserveCommand(
  options: ObserveCommandOptions,
  control: ControlPlane,
): Promise<ObserveCommandOutput> {
  const redaction =
    options.redactedSummary === false
      ? false
      : {
          ...(options.maxDepth === undefined ? {} : { maxDepth: options.maxDepth }),
          ...(options.maxArrayItems === undefined ? {} : { maxArrayItems: options.maxArrayItems }),
        };
  const observation = await control.observe({
    target: options.target,
    outDir: options.outDir,
    targetScreenshot: options.targetScreenshot,
    displayScreenshot: options.displayScreenshot,
    accessibility: options.accessibility,
    requirePermissions: options.requirePermissions,
    promptPermissions: options.promptPermissions,
    redactedSummary: redaction,
  });

  return {
    target: observation.target,
    outDir: options.outDir,
    observation: join(options.outDir, "observation.json"),
    ...(options.redactedSummary
      ? { redactedSummary: join(options.outDir, "summary.redacted.json") }
      : {}),
    ...(observation.targetScreenshot == null
      ? {}
      : { targetScreenshot: observation.targetScreenshot }),
    ...(observation.displayScreenshot == null
      ? {}
      : { displayScreenshot: observation.displayScreenshot }),
    artifacts: observation.artifacts,
  };
}

function stamp(): string {
  return new Date().toISOString().replaceAll(/[-:.]/g, "").replace("T", "T").replace("Z", "Z");
}

function numberArg(flag: string, value: string | undefined): number {
  if (value == null) throw new CommandUsageError(`${flag} needs a number`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new CommandUsageError(`${flag} needs a number, got ${value}`);
  return parsed;
}

function intArg(flag: string, value: string | undefined): number {
  const parsed = numberArg(flag, value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CommandUsageError(`${flag} needs a non-negative integer`);
  }
  return parsed;
}

function coordArg(value: string, usage: string): CoordMode {
  if (value === "pixel" || value === "normalized" || value === "global") return value;
  throw new CommandUsageError(`unknown coord: ${value}`, usage);
}

function targetLabel(target: Target): string {
  switch (target.kind) {
    case "window":
      return `window-${target.wid}`;
    case "app":
      return `app-${target.bundleID ?? target.name ?? target.pid ?? "target"}`;
    case "display":
      return `display-${target.display}`;
    case "desktop":
      return "desktop";
  }
}

function parseTarget(
  args: string[],
  usage: string,
): { target: Target; index: number; help?: false } | { help: true } {
  const kind = args[0];
  if (kind == null || kind === "-h" || kind === "--help") return { help: true };

  switch (kind) {
    case "window":
      return { target: { kind: "window", wid: intArg("window", args[1]) }, index: 2 };
    case "display": {
      const display = args[1];
      if (display == null) throw new CommandUsageError("display needs a selector", usage);
      return { target: { kind: "display", display }, index: 2 };
    }
    case "desktop":
      return { target: { kind: "desktop" }, index: 1 };
    case "app": {
      const value = args[1];
      if (value == null) {
        throw new CommandUsageError("app needs a name, --bundle-id, or --pid", usage);
      }
      if (value === "--bundle-id") {
        const bundleID = args[2];
        if (bundleID == null) throw new CommandUsageError("--bundle-id needs a value", usage);
        return { target: { kind: "app", bundleID }, index: 3 };
      }
      if (value === "--pid") {
        return { target: { kind: "app", pid: intArg("--pid", args[2]) }, index: 3 };
      }
      return { target: { kind: "app", name: value }, index: 2 };
    }
    default:
      throw new CommandUsageError(`unknown target: ${kind}`, usage);
  }
}
