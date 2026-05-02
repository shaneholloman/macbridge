import { describe, expect, test } from "bun:test";
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
    expect(isTypeScriptCommand("permissions")).toBe(false);
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
});
