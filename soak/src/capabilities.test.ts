import { describe, expect, test } from "bun:test";
import { capabilities, formatReportParityIssues, reportParityIssues } from "./capabilities.ts";
import type { RunSummary, Step } from "./types.ts";

function step(overrides: Partial<Step> = {}): Step {
  return {
    id: "s001",
    name: "service start",
    status: "pass",
    startedAt: "2026-05-02T00:00:00.000Z",
    finishedAt: "2026-05-02T00:00:00.100Z",
    durationMs: 100,
    ...overrides,
  };
}

function run(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: "run-1",
    regime: "stress",
    status: "pass",
    startedAt: "2026-05-02T00:00:00.000Z",
    finishedAt: "2026-05-02T00:00:01.000Z",
    durationMs: 1000,
    pass: 1,
    fail: 0,
    runDir: "soak/runs/run-1",
    artifactDir: "soak/runs/run-1/artifacts",
    liveTextEdit: false,
    liveHelium: true,
    recordVideo: false,
    recordTarget: "display",
    iterations: 1,
    steps: [step()],
    ...overrides,
  };
}

describe("report capability registry", () => {
  test("requires report surfaces for every capability", () => {
    expect(capabilities.every((capability) => capability.reportSurfaces.length > 0)).toBe(true);
  });

  test("accepts registered recording evidence", async () => {
    const issues = await reportParityIssues([
      run({
        recordVideo: true,
        recordTarget: "window",
        steps: [
          step({
            name: "helium recording stop",
            detail: {
              frames: 1,
              video: { path: "helium-session.mp4", kind: "session-video", bytes: 10 },
            },
          }),
        ],
      }),
    ]);

    expect(issues).toEqual([]);
  });

  test("fails on unregistered summary fields, steps, and artifact kinds", async () => {
    const subject = run({
      steps: [
        step({
          name: "new amazing feature",
          detail: { artifact: { path: "new.bin", kind: "new-artifact-kind" } },
        }),
      ],
    }) as RunSummary & { newSummaryFlag: boolean };
    subject.newSummaryFlag = true;

    const issues = await reportParityIssues([subject]);

    expect(issues.map((issue) => issue.kind)).toEqual(["summary-field", "step", "artifact-kind"]);
    expect(formatReportParityIssues(issues)).toContain("new amazing feature");
  });
});
