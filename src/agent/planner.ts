import { parsePlan } from "../protocol/schema.js";
import type { PlannedAction, Planner, PlannerInput } from "../protocol/types.js";

export type PlannerAdapter = {
  name: string;
  model?: string;
  plan(input: PlannerInput): PlannedAction | Promise<PlannedAction>;
};

export type ShellPlannerOptions = {
  name?: string;
  argv: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  model?: string;
};

export function parsePlannerOutput(value: unknown): PlannedAction {
  if (typeof value === "string") return parsePlan(JSON.parse(value));
  return parsePlan(value);
}

export function adapterPlanner(adapter: PlannerAdapter): Planner {
  return (input) => adapter.plan(input);
}

export function shellPlanner(options: ShellPlannerOptions): PlannerAdapter {
  if (options.argv.length === 0) throw new Error("shell planner needs argv");
  return {
    name: options.name ?? options.argv[0] ?? "shell",
    ...(options.model == null ? {} : { model: options.model }),
    plan(input) {
      const child = Bun.spawnSync({
        cmd: options.argv,
        ...(options.cwd == null ? {} : { cwd: options.cwd }),
        ...(options.env == null ? {} : { env: options.env }),
        stdin: new Blob([`${JSON.stringify(input)}\n`]),
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = child.stdout.toString().trim();
      const stderr = child.stderr.toString().trim();
      if (child.exitCode !== 0) {
        throw new Error(stderr || stdout || `${options.argv.join(" ")} exited ${child.exitCode}`);
      }
      if (stdout.length === 0) throw new Error("shell planner produced no stdout");
      return parsePlannerOutput(stdout);
    },
  };
}
