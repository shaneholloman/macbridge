import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fixturePlanner, Session, validateAction } from "../../src/agent/session.ts";
import type { ControlPlane } from "../../src/core/control.ts";
import { FrameRecorder } from "../../src/media/recording.ts";
import { verifyExpectation } from "../../src/observe/verify.ts";
import type { ActionResult, Observation } from "../../src/protocol/types.ts";

function observation(): Observation {
  return {
    id: "obs",
    target: { kind: "desktop" },
    capturedAt: "2026-05-02T00:00:00.000Z",
    permissions: { ok: true, prompted: false, permissions: [] },
    displays: [],
    windows: [],
    artifacts: [],
  };
}

function fakeControl(overrides: Partial<ControlPlane> = {}): ControlPlane {
  const control: ControlPlane = {
    run() {
      return { stdout: "", stderr: "", status: 0 };
    },
    json<T>() {
      return {} as T;
    },
    permissions() {
      return { ok: true, prompted: false, permissions: [] };
    },
    displays() {
      return [];
    },
    display() {
      return {
        index: 0,
        displayID: 1,
        screenNumber: 1,
        name: "main",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        visibleX: 0,
        visibleY: 0,
        visibleWidth: 100,
        visibleHeight: 100,
        pixelWidth: 100,
        pixelHeight: 100,
        scaleFactor: 1,
        main: true,
        builtin: false,
      };
    },
    windows() {
      return [];
    },
    frame() {
      return { x: 0, y: 0, width: 100, height: 100 };
    },
    maximize() {
      return { x: 0, y: 0, width: 100, height: 100 };
    },
    activate() {
      return { ok: true };
    },
    setFrame(_target, frame) {
      return frame;
    },
    capture(_target, path) {
      return { path, kind: "desktop-screenshot", bytes: 2 };
    },
    axDump() {
      return {};
    },
    async observe() {
      return observation();
    },
    async act(action): Promise<ActionResult> {
      return {
        id: "act",
        action,
        status: "pass",
        startedAt: "2026-05-02T00:00:00.000Z",
        finishedAt: "2026-05-02T00:00:00.000Z",
        artifacts: [],
      };
    },
    verify(expectation) {
      return verifyExpectation(expectation, { control });
    },
    ...overrides,
  };
  return control;
}

describe("validateAction", () => {
  test("allows deterministic UI actions by default", () => {
    expect(
      validateAction({
        type: "maximize",
        target: { kind: "app", name: "Helium" },
        display: "main",
      }),
    ).toEqual({
      type: "maximize",
      target: { kind: "app", name: "Helium" },
      display: "main",
    });
  });

  test("rejects raw commands by default", () => {
    expect(() => validateAction({ type: "command", argv: ["permissions", "check"] })).toThrow(
      "action type is not allowed: command",
    );
  });

  test("allows command prefixes explicitly", () => {
    expect(
      validateAction(
        { type: "command", argv: ["permissions", "check", "--require"] },
        { allow: ["command"], commandPrefixes: [["permissions", "check"]] },
      ),
    ).toEqual({ type: "command", argv: ["permissions", "check", "--require"] });
  });
});

describe("fixturePlanner", () => {
  test("returns the same planned action", async () => {
    const plan = {
      action: { type: "activate", target: { kind: "app", name: "Helium" } },
      reason: "known fixture",
    } as const;
    expect(
      await fixturePlanner(plan)({
        observation: {
          id: "obs",
          target: { kind: "desktop" },
          capturedAt: "2026-05-02T00:00:00.000Z",
          permissions: { ok: true, prompted: false, permissions: [] },
          displays: [],
          windows: [],
          artifacts: [],
        },
        session: { id: "session", outDir: "tmp/session-test" },
      }),
    ).toEqual(plan);
  });
});

describe("verifyExpectation", () => {
  test("checks artifact size", async () => {
    const path = "tmp/session-test/artifact.txt";
    mkdirSync("tmp/session-test", { recursive: true });
    await Bun.write(path, "ok");

    expect(verifyExpectation({ type: "artifact", path, minBytes: 2 }).status).toBe("pass");
    expect(verifyExpectation({ type: "artifact", path, minBytes: 3 }).status).toBe("fail");
  });
});

describe("Session", () => {
  test("runs through an injected control plane", async () => {
    const calls: string[] = [];
    const control = fakeControl({
      async observe() {
        calls.push("observe");
        return observation();
      },
      async act(action) {
        calls.push(`act:${action.type}`);
        return {
          id: "act",
          action,
          status: "pass",
          startedAt: "2026-05-02T00:00:00.000Z",
          finishedAt: "2026-05-02T00:00:00.000Z",
          artifacts: [],
        };
      },
      permissions() {
        calls.push("permissions");
        return { ok: true, prompted: false, permissions: [] };
      },
      capture(_target, path) {
        calls.push("capture");
        return { path, kind: "desktop-screenshot", bytes: 2 };
      },
    });

    const session = new Session({ control, outDir: "tmp/session-test/control" });
    const record = await session.runOnce({
      observe: { target: { kind: "desktop" }, targetScreenshot: false },
      planner: fixturePlanner({ action: { type: "activate", target: { kind: "window", wid: 1 } } }),
    });

    expect(record.action.status).toBe("pass");
    expect(calls).toEqual(["observe", "act:activate"]);
  });

  test("can record frame evidence around a run", async () => {
    const outDir = "tmp/session-test/recorded";
    const control = fakeControl({
      capture(_target, path) {
        writeFileSync(path, "png");
        return { path, kind: "desktop-screenshot", bytes: 3 };
      },
    });

    const session = new Session({ control, outDir });
    const recorder = new FrameRecorder({
      control,
      target: { kind: "desktop" },
      outDir: `${outDir}/frames`,
    });
    const record = await session.runOnce({
      observe: { target: { kind: "desktop" }, targetScreenshot: false },
      planner: fixturePlanner({ action: { type: "activate", target: { kind: "window", wid: 1 } } }),
      recorder,
    });

    expect(record.recording?.frames).toHaveLength(2);
    expect(record.recording?.artifacts.map((item) => item.kind)).toContain("session-frames");
    expect(record.artifacts.map((item) => item.kind)).toContain("session-frames");
  });
});
