import { join } from "node:path";
import { FrameRecorder } from "../media/recording.js";
import { parseAction, parseExpectation, parsePlan } from "../protocol/schema.js";
import type { ActionPolicy, PlannedAction, RunRecord } from "../protocol/types.js";
import { configuredModels, type ModelInfo, type ModelKind, type ModelQuery } from "./model.js";
import { defaultActionPolicy, fixturePlanner, Session, validateAction } from "./session.js";

export type ModelsOptions = ModelQuery & {
  json: boolean;
};

export type PlanOptions = {
  observationPath: string;
  actionPath: string;
  expectPath?: string;
  reason?: string;
  out?: string;
};

export type AgentRunOptions = {
  planPath: string;
  out?: string;
  commandPrefixes: string[][];
  record?: RecordingOptions;
};

export type RecordingOptions = {
  outDir?: string;
  videoPath?: string;
  target: "action" | "display" | "desktop";
  display: string | number;
  fps: number;
  ffmpeg?: string;
};

export function agentCommandUsage(): string {
  return [
    "usage:",
    "  macbridge agent models [--type text|vision|action] [--provider name] [--json]",
    "  macbridge agent plan <observation.json> --action action.json [--expect expect.json] [--out plan.json]",
    "  macbridge agent run <plan.json> [--out record.json] [--command-prefix a,b,c] [--record-frames] [--record-video video.mp4] [--record-target action|display|desktop]",
  ].join("\n");
}

export function parseModelsArgs(args: string[]): ModelsOptions {
  const options: ModelsOptions = { json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--type":
      case "--kind":
        options.kind = kindArg(args[index + 1]);
        index += 1;
        break;
      case "--provider": {
        const provider = args[index + 1];
        if (provider == null) throw new Error("--provider needs a value");
        options.provider = provider;
        index += 1;
        break;
      }
      case "--json":
        options.json = true;
        break;
      default:
        throw new Error(`unknown models option: ${arg}\n${agentCommandUsage()}`);
    }
  }
  return options;
}

export function parsePlanArgs(args: string[]): PlanOptions {
  const observationPath = args[0];
  if (observationPath == null)
    throw new Error(`plan needs an observation path\n${agentCommandUsage()}`);

  const options: PlanOptions = { observationPath, actionPath: "" };
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--action": {
        const value = args[index + 1];
        if (value == null) throw new Error("--action needs a path");
        options.actionPath = value;
        index += 1;
        break;
      }
      case "--expect": {
        const value = args[index + 1];
        if (value == null) throw new Error("--expect needs a path");
        options.expectPath = value;
        index += 1;
        break;
      }
      case "--reason": {
        const value = args[index + 1];
        if (value == null) throw new Error("--reason needs text");
        options.reason = value;
        index += 1;
        break;
      }
      case "--out": {
        const value = args[index + 1];
        if (value == null) throw new Error("--out needs a path");
        options.out = value;
        index += 1;
        break;
      }
      default:
        throw new Error(`unknown plan option: ${arg}\n${agentCommandUsage()}`);
    }
  }

  if (options.actionPath.length === 0) throw new Error("plan needs --action action.json");
  return options;
}

export function parseRunArgs(args: string[]): AgentRunOptions {
  const planPath = args[0];
  if (planPath == null) throw new Error(`run needs a plan path\n${agentCommandUsage()}`);

  const options: AgentRunOptions = { planPath, commandPrefixes: [] };
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--out": {
        const value = args[index + 1];
        if (value == null) throw new Error("--out needs a path");
        options.out = value;
        index += 1;
        break;
      }
      case "--command-prefix": {
        const value = args[index + 1];
        if (value == null) throw new Error("--command-prefix needs comma-separated argv parts");
        options.commandPrefixes.push(value.split(",").filter((part) => part.length > 0));
        index += 1;
        break;
      }
      case "--record-frames":
        options.record = recordingOptions(options.record);
        break;
      case "--record-video": {
        const value = args[index + 1];
        if (value == null) throw new Error("--record-video needs a path");
        options.record = { ...recordingOptions(options.record), videoPath: value };
        index += 1;
        break;
      }
      case "--record-dir": {
        const value = args[index + 1];
        if (value == null) throw new Error("--record-dir needs a path");
        options.record = { ...recordingOptions(options.record), outDir: value };
        index += 1;
        break;
      }
      case "--record-target": {
        const value = args[index + 1];
        if (value !== "action" && value !== "display" && value !== "desktop") {
          throw new Error("--record-target must be action, display, or desktop");
        }
        options.record = { ...recordingOptions(options.record), target: value };
        index += 1;
        break;
      }
      case "--record-display": {
        const value = args[index + 1];
        if (value == null) throw new Error("--record-display needs a display selector");
        options.record = { ...recordingOptions(options.record), display: displaySelector(value) };
        index += 1;
        break;
      }
      case "--record-fps": {
        const value = args[index + 1];
        if (value == null) throw new Error("--record-fps needs a number");
        const fps = Number(value);
        if (!Number.isFinite(fps) || fps <= 0)
          throw new Error("--record-fps must be a positive number");
        options.record = { ...recordingOptions(options.record), fps };
        index += 1;
        break;
      }
      case "--record-ffmpeg": {
        const value = args[index + 1];
        if (value == null) throw new Error("--record-ffmpeg needs a path");
        options.record = { ...recordingOptions(options.record), ffmpeg: value };
        index += 1;
        break;
      }
      default:
        throw new Error(`unknown run option: ${arg}\n${agentCommandUsage()}`);
    }
  }
  return options;
}

export function modelsCommand(
  options: ModelsOptions,
  env: Record<string, string | undefined> = process.env,
): ModelInfo[] {
  return configuredModels(env, options);
}

export function formatModels(options: ModelsOptions, models: ModelInfo[]): string {
  if (options.json) return `${JSON.stringify({ models }, null, 2)}\n`;
  if (models.length === 0) return "No configured models found.\n";
  return `${models.map((model) => `${model.id}\t${model.kind}\t${model.env}`).join("\n")}\n`;
}

export async function planCommand(options: PlanOptions): Promise<PlannedAction> {
  const observation = await readJSON(options.observationPath);
  const observationID =
    observation != null && typeof observation === "object" && "id" in observation
      ? String(observation.id)
      : options.observationPath;
  const action = parseAction(await readJSON(options.actionPath));
  const expectation =
    options.expectPath == null ? undefined : parseExpectation(await readJSON(options.expectPath));
  const planned: PlannedAction = {
    action,
    reason: options.reason ?? `fixture plan for ${observationID}`,
    ...(expectation == null ? {} : { expect: expectation }),
  };

  validateAction(planned.action);
  return planned;
}

export async function runPlanCommand(options: AgentRunOptions): Promise<RunRecord> {
  const planned = parsePlan(await readJSON(options.planPath));
  const allow = [...(defaultActionPolicy.allow ?? [])];
  if (options.commandPrefixes.length > 0) allow.push("command");
  const policy: ActionPolicy = {
    allow,
    commandPrefixes: options.commandPrefixes,
  };
  validateAction(planned.action, policy);

  const session = new Session();
  const recording = options.record;
  const recordTarget =
    recording?.target === "display"
      ? { kind: "display" as const, display: recording.display }
      : recording?.target === "desktop" || planned.action.type === "command"
        ? { kind: "desktop" as const }
        : planned.action.target;
  const recorder =
    recording == null
      ? undefined
      : new FrameRecorder({
          control: session.control,
          target: recordTarget,
          outDir: recording.outDir ?? join(session.outDir, "recording"),
          fps: recording.fps,
          ...(recording.videoPath == null ? {} : { videoPath: recording.videoPath }),
          ...(recording.ffmpeg == null ? {} : { ffmpeg: recording.ffmpeg }),
        });
  return session.runOnce({
    observe: {
      target: planned.action.type === "command" ? { kind: "desktop" } : planned.action.target,
      targetScreenshot: false,
      displayScreenshot: false,
      redactedSummary: false,
    },
    planner: fixturePlanner(planned),
    policy,
    ...(recorder == null ? {} : { recorder }),
  });
}

function kindArg(value: string | undefined): ModelKind {
  if (value === "text" || value === "vision" || value === "action") return value;
  throw new Error(`unknown model type: ${value ?? ""}`);
}

function displaySelector(value: string): string | number {
  if (value === "main") return value;
  const number = Number(value);
  return Number.isInteger(number) ? number : value;
}

function recordingOptions(options?: RecordingOptions): RecordingOptions {
  return options ?? { target: "action", display: "main", fps: 2 };
}

async function readJSON(path: string): Promise<unknown> {
  return JSON.parse(await Bun.file(path).text());
}
