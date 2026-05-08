import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAppsCommand } from "../../src/adapter/command.ts";
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

describe("apps command", () => {
  test("lists adapters without touching the native runtime", async () => {
    const fixture = io();
    const status = await runAppsCommand(
      ["list"],
      () => {
        throw new Error("native runtime should not be needed");
      },
      fixture.io,
    );

    expect(status).toBe(0);
    expect(
      JSON.parse(fixture.output().stdout).map((adapter: { id: string }) => adapter.id),
    ).toContain("helium");
    expect(fixture.output().stderr).toBe("");
  });

  test("observes an adapter through an injected control plane", async () => {
    const fixture = io();
    const outDir = join(mkdtempSync(join(tmpdir(), "macbridge-app-observe-")), "helium");
    const status = await runAppsCommand(
      ["observe", "helium", "--out", outDir],
      () => fakeControl(),
      fixture.io,
    );

    expect(status).toBe(0);
    expect(JSON.parse(fixture.output().stdout)).toMatchObject({
      adapter: "helium",
      app: "Helium",
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
      if (target?.kind === "app" && target.bundleID === "net.imput.helium") {
        return [
          {
            wid: 7,
            pid: 70,
            owner: "Helium",
            name: "Helium",
            bundleID: "net.imput.helium",
            x: 0,
            y: 0,
            width: 900,
            height: 700,
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
