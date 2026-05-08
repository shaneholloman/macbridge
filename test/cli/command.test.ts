import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  CommandUsageError,
  parseActCommand,
  parseObserveCommand,
  parseVerifyCommand,
  readActionFile,
  readExpectationFile,
  runActCommand,
  runObserveCommand,
  runVerifyCommand,
} from "../../src/cli/command.ts";
import type { ControlPlane } from "../../src/core/control.ts";
import type { Action, Expectation, ObserveInput } from "../../src/protocol/types.ts";

describe("source CLI adapters", () => {
  test("parse delivered command grammar", () => {
    expect(parseActCommand(["action.json"])).toEqual({
      kind: "run",
      options: { actionPath: "action.json" },
    });
    expect(parseVerifyCommand(["expectation.json"])).toEqual({
      kind: "run",
      options: { expectationPath: "expectation.json" },
    });
    expect(
      parseObserveCommand([
        "app",
        "--bundle-id",
        "com.example.App",
        "--display-screenshot",
        "main",
        "--ax",
        "0.2",
        "0.8",
        "--coord",
        "normalized",
        "--out",
        "tmp/observe",
      ]),
    ).toEqual({
      kind: "run",
      options: {
        target: { kind: "app", bundleID: "com.example.App" },
        outDir: "tmp/observe",
        targetScreenshot: true,
        displayScreenshot: { display: "main" },
        accessibility: { x: 0.2, y: 0.8, coord: "normalized" },
        requirePermissions: false,
        promptPermissions: false,
        redactedSummary: true,
      },
    });
  });

  test("parse usage errors carry user-facing grammar", () => {
    expect(parseObserveCommand(["--help"]).kind).toBe("help");
    expect(() => parseObserveCommand(["app"])).toThrow(CommandUsageError);
  });

  test("read typed command input files", () => {
    mkdirSync("tmp/cli-test", { recursive: true });
    writeFileSync(
      "tmp/cli-test/action.json",
      JSON.stringify({ type: "activate", target: { kind: "window", wid: 7 } }),
    );
    writeFileSync(
      "tmp/cli-test/expectation.json",
      JSON.stringify({ type: "artifact", path: "artifact.txt" }),
    );

    expect(readActionFile("tmp/cli-test/action.json")).toEqual({
      type: "activate",
      target: { kind: "window", wid: 7 },
    });
    expect(readExpectationFile("tmp/cli-test/expectation.json")).toEqual({
      type: "artifact",
      path: "artifact.txt",
    });
  });

  test("run act, observe, and verify through an injected control plane", async () => {
    mkdirSync("tmp/cli-test", { recursive: true });
    writeFileSync(
      "tmp/cli-test/action.json",
      JSON.stringify({ type: "activate", target: { kind: "window", wid: 7 } }),
    );
    writeFileSync(
      "tmp/cli-test/expectation.json",
      JSON.stringify({ type: "permissions", ok: true }),
    );

    const control = {
      async act(action: Action) {
        return {
          id: "act",
          action,
          status: "pass",
          startedAt: "2026-05-02T00:00:00.000Z",
          finishedAt: "2026-05-02T00:00:00.000Z",
          artifacts: [],
        };
      },
      async observe(input: ObserveInput) {
        return {
          id: "obs",
          target: input.target,
          capturedAt: "2026-05-02T00:00:00.000Z",
          permissions: { ok: true, prompted: false, permissions: [] },
          displays: [],
          windows: [],
          artifacts: [{ path: "tmp/cli-test/observation.json", kind: "observation" }],
        };
      },
      verify(expectation: Expectation) {
        return {
          id: "verify",
          expectation,
          status: "pass",
          checkedAt: "2026-05-02T00:00:00.000Z",
        };
      },
    } as unknown as ControlPlane;

    const action = await runActCommand({ actionPath: "tmp/cli-test/action.json" }, control);
    const observation = await runObserveCommand(
      {
        target: { kind: "desktop" },
        outDir: "tmp/cli-test",
        targetScreenshot: false,
        displayScreenshot: false,
        accessibility: false,
        requirePermissions: false,
        promptPermissions: false,
        redactedSummary: false,
      },
      control,
    );
    const verification = runVerifyCommand(
      { expectationPath: "tmp/cli-test/expectation.json" },
      control,
    );

    expect(action.action).toEqual({ type: "activate", target: { kind: "window", wid: 7 } });
    expect(observation).toEqual({
      target: { kind: "desktop" },
      outDir: "tmp/cli-test",
      observation: "tmp/cli-test/observation.json",
      artifacts: [{ path: "tmp/cli-test/observation.json", kind: "observation" }],
    });
    expect(verification.expectation).toEqual({ type: "permissions", ok: true });
  });
});
