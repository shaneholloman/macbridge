import { describe, expect, test } from "bun:test";
import { adapterPlanner, parsePlannerOutput, shellPlanner } from "../../src/agent/planner.ts";
import type { PlannerInput } from "../../src/protocol/types.ts";

const plan = {
  action: { type: "activate", target: { kind: "app", name: "Helium" } },
  reason: "fixture",
} as const;

const input: PlannerInput = {
  observation: {
    id: "obs",
    target: { kind: "desktop" },
    capturedAt: "2026-05-02T00:00:00.000Z",
    permissions: { ok: true, prompted: false, permissions: [] },
    displays: [],
    windows: [],
    artifacts: [],
  },
  session: { id: "session", outDir: "tmp/planner-test" },
};

describe("parsePlannerOutput", () => {
  test("accepts planned action JSON", () => {
    expect(parsePlannerOutput(JSON.stringify(plan))).toEqual(plan);
  });

  test("rejects invalid planner output", () => {
    expect(() => parsePlannerOutput({ action: { type: "nope" } })).toThrow();
  });
});

describe("adapterPlanner", () => {
  test("turns an adapter into a planner function", async () => {
    const planner = adapterPlanner({
      name: "fixture",
      plan() {
        return plan;
      },
    });

    expect(await planner(input)).toEqual(plan);
  });
});

describe("shellPlanner", () => {
  test("parses a planned action from stdout", async () => {
    const planner = shellPlanner({
      argv: [
        process.execPath,
        "--eval",
        `process.stdin.resume(); process.stdout.write(${JSON.stringify(JSON.stringify(plan))});`,
      ],
    });

    expect(await planner.plan(input)).toEqual(plan);
  });
});
