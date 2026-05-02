import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createControlPlane } from "../core/client.js";
import type { ControlPlane } from "../core/control.js";
import type { Recorder } from "../media/recording.js";
import type {
  Action,
  ActionPolicy,
  Artifact,
  Expectation,
  MacBridgeOptions,
  ObserveInput,
  PlannedAction,
  Planner,
  RunRecord,
  Verification,
} from "../protocol/types.js";

export type SessionOptions = MacBridgeOptions & {
  id?: string;
  outDir?: string;
  control?: ControlPlane;
  policy?: ActionPolicy;
};

export type RunInput = {
  observe: ObserveInput;
  planner: Planner;
  policy?: ActionPolicy;
  recorder?: Recorder;
};

export const defaultActionPolicy: ActionPolicy = {
  allow: ["activate", "click", "type", "press", "axAction", "setFrame", "maximize"],
  commandPrefixes: [],
};

function stamp(): string {
  return new Date().toISOString().replaceAll(/[-:.]/g, "");
}

function id(prefix: string): string {
  return `${stamp()}-${prefix}`;
}

function artifact(path: string, kind: Artifact["kind"]): Artifact {
  try {
    return { path, kind, bytes: statSync(path).size };
  } catch {
    return { path, kind };
  }
}

function matchesPrefix(argv: string[], prefix: string[]): boolean {
  return prefix.length > 0 && prefix.every((part, index) => argv[index] === part);
}

export function validateAction(action: Action, policy: ActionPolicy = defaultActionPolicy): Action {
  const allow = new Set(policy.allow ?? defaultActionPolicy.allow);
  if (!allow.has(action.type)) {
    throw new Error(`action type is not allowed: ${action.type}`);
  }

  if (action.type === "command") {
    const prefixes = policy.commandPrefixes ?? defaultActionPolicy.commandPrefixes ?? [];
    if (!prefixes.some((prefix) => matchesPrefix(action.argv, prefix))) {
      throw new Error("command action does not match an allowed prefix");
    }
  }

  return action;
}

export function fixturePlanner(plan: PlannedAction): Planner {
  return () => plan;
}

export class Session {
  readonly id: string;
  readonly outDir: string;
  readonly control: ControlPlane;
  private readonly policy: ActionPolicy;

  constructor(options: SessionOptions = {}) {
    const { id: sessionID, outDir, control, policy, ...macbridgeOptions } = options;
    this.id = sessionID ?? id("session");
    this.outDir = outDir ?? join("tmp", "sessions", this.id);
    this.control = control ?? createControlPlane(macbridgeOptions);
    this.policy = policy ?? defaultActionPolicy;
    mkdirSync(this.outDir, { recursive: true });
  }

  verify(expectation: Expectation): Verification {
    return this.control.verify(expectation);
  }

  async runOnce(input: RunInput): Promise<RunRecord> {
    const startedAt = new Date();
    const runID = id("run");
    const recorder = input.recorder;
    await recorder?.start();
    await recorder?.frame("start");
    const observation = await this.control.observe({
      ...input.observe,
      outDir: input.observe.outDir ?? join(this.outDir, id("observe")),
    });
    const plan = await input.planner({
      observation,
      session: { id: this.id, outDir: this.outDir },
    });
    validateAction(plan.action, input.policy ?? this.policy);

    const action = await this.control.act(plan.action);
    await recorder?.frame("after-action");
    const verification = plan.expect == null ? undefined : this.verify(plan.expect);
    const recording = await recorder?.stop();
    const recordPath = join(this.outDir, `${runID}.json`);
    const record: RunRecord = {
      id: runID,
      sessionID: this.id,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      observation,
      plan,
      action,
      ...(verification == null ? {} : { verification }),
      ...(recording == null ? {} : { recording }),
      artifacts: [
        ...observation.artifacts,
        ...action.artifacts,
        ...(recording?.artifacts ?? []),
        artifact(recordPath, "log"),
      ],
    };

    await Bun.write(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    return record;
  }
}
