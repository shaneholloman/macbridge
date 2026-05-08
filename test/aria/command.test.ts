import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ARIA_BUNDLE_ID, ARIA_DEV_COMMAND, ARIA_DEV_SESSION } from "../../src/apps/aria.ts";
import {
  parseAriaCaptureArgs,
  parseAriaDevStartArgs,
  parseAriaInstalledObserveArgs,
  parseAriaSessionArgs,
  runAriaCommand,
} from "../../src/aria/command.ts";
import type { ControlPlane } from "../../src/core/control.ts";
import type {
  Observation,
  ObserveInput,
  PermissionReport,
  Target,
} from "../../src/protocol/types.ts";

function io() {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      stdout: {
        write(text: string) {
          stdout += text;
          return true;
        },
      },
      stderr: {
        write(text: string) {
          stderr += text;
          return true;
        },
      },
    },
    output: () => ({ stdout, stderr }),
  };
}

describe("aria command", () => {
  test("keeps dev start defaults explicit", () => {
    expect(parseAriaDevStartArgs([])).toEqual({
      session: ARIA_DEV_SESSION,
      repo: process.cwd(),
      command: ARIA_DEV_COMMAND,
    });
  });

  test("parses dev lane options separately from installed app options", () => {
    expect(
      parseAriaDevStartArgs([
        "--screen",
        "left",
        "--session",
        "demo",
        "--repo",
        ".",
        "--command",
        "bun run dev",
        "--writable",
      ]),
    ).toMatchObject({
      screen: "left",
      session: "demo",
      command: "bun run dev",
      writable: true,
    });
    expect(parseAriaSessionArgs(["--screen", "left"])).toEqual({
      screen: "left",
      session: ARIA_DEV_SESSION,
    });
    expect(parseAriaCaptureArgs(["-o", "tmp/aria.png"])).toEqual({
      session: ARIA_DEV_SESSION,
      out: "tmp/aria.png",
    });
    expect(parseAriaInstalledObserveArgs(["--launch", "--prompt", "--out", "tmp/aria"])).toEqual({
      launch: true,
      prompt: true,
      outDir: "tmp/aria",
    });
  });

  test("observes installed Aria through an injected control plane", async () => {
    const fixture = io();
    const outDir = join(mkdtempSync(join(tmpdir(), "macbridge-aria-observe-")), "aria");
    const status = await runAriaCommand(
      ["installed", "observe", "--out", outDir],
      () => fakeControl(),
      fixture.io,
    );

    expect(status).toBe(0);
    expect(JSON.parse(fixture.output().stdout)).toMatchObject({
      mode: "installed",
      adapter: "aria",
      bundleID: ARIA_BUNDLE_ID,
      outDir,
    });
    expect(fixture.output().stderr).toBe("");
  });
});

function fakeControl(): ControlPlane {
  return {
    permissions(): PermissionReport {
      return { ok: true, prompted: false, permissions: [] };
    },
    windows(target?: Target) {
      if (target?.kind === "app" && target.bundleID === ARIA_BUNDLE_ID) {
        return [
          {
            wid: 17,
            pid: 170,
            owner: "Aria",
            name: "Aria Dev",
            bundleID: ARIA_BUNDLE_ID,
            x: 0,
            y: 0,
            width: 1200,
            height: 800,
          },
        ];
      }
      return [];
    },
    async observe(input: ObserveInput): Promise<Observation> {
      return {
        id: "observation",
        target: input.target,
        capturedAt: "2026-05-08T00:00:00.000Z",
        permissions: { ok: true, prompted: false, permissions: [] },
        displays: [],
        windows: [],
        artifacts: [{ path: join(input.outDir ?? "tmp", "observation.json"), kind: "observation" }],
      };
    },
  } as unknown as ControlPlane;
}
