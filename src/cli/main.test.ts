import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSoakCLI } from "../../soak/src/cli.ts";
import { isTypeScriptCommand, runCLI } from "./main.ts";

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

describe("TypeScript CLI entrypoint", () => {
  test("identifies source-owned commands", () => {
    expect(isTypeScriptCommand("agent")).toBe(true);
    expect(isTypeScriptCommand("observe")).toBe(true);
    expect(isTypeScriptCommand("reports")).toBe(true);
    expect(isTypeScriptCommand("soak")).toBe(true);
    expect(isTypeScriptCommand("permissions")).toBe(true);
    expect(isTypeScriptCommand(undefined)).toBe(false);
  });

  test("prints agent help without tools", async () => {
    const fixture = io();
    const status = await runCLI(["agent", "--help"], fixture.io);

    expect(status).toBe(0);
    expect(fixture.output().stdout).toContain("macbridge agent models");
    expect(fixture.output().stderr).toBe("");
  });

  test("prints observe target help", async () => {
    const fixture = io();
    const status = await runCLI(["observe", "outlook", "--help"], fixture.io);

    expect(status).toBe(0);
    expect(fixture.output().stdout).toContain("macbridge observe outlook");
    expect(fixture.output().stderr).toBe("");
  });

  test("routes soak tui through the same TypeScript renderer as the soak command", async () => {
    const previousRoot = process.env.MACBRIDGE_SOAK_ROOT;
    process.env.MACBRIDGE_SOAK_ROOT = join(mkdtempSync(join(tmpdir(), "macbridge-soak-")), "Soak");
    try {
      const direct = io();
      const routed = io();

      const directStatus = await runSoakCLI(["tui"], direct.io);
      const routedStatus = await runCLI(["soak", "tui"], routed.io);

      expect(routedStatus).toBe(directStatus);
      expect(routed.output()).toEqual(direct.output());
      expect(routed.output().stdout).toContain("Recent runs: 0/0 passed (0.0%)");
      expect(routed.output().stderr).toBe("");
    } finally {
      if (previousRoot == null) {
        delete process.env.MACBRIDGE_SOAK_ROOT;
      } else {
        process.env.MACBRIDGE_SOAK_ROOT = previousRoot;
      }
    }
  });

  test("does not send unknown product commands into the Swift adapter", async () => {
    const fixture = io();
    const status = await runCLI(["definitely-not-a-command"], fixture.io);

    expect(status).toBe(1);
    expect(fixture.output().stdout).toBe("");
    expect(fixture.output().stderr).toContain("unknown command: definitely-not-a-command");
  });
});
