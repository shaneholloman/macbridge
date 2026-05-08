import { describe, expect, test } from "bun:test";
import { parseModelsArgs, parsePlanArgs, parseRunArgs } from "../../src/agent/command.ts";

describe("agent parseModelsArgs", () => {
  test("parses model filters", () => {
    expect(parseModelsArgs(["--type", "vision", "--provider", "openai", "--json"])).toEqual({
      kind: "vision",
      provider: "openai",
      json: true,
    });
  });
});

describe("agent parsePlanArgs", () => {
  test("parses fixture planning inputs", () => {
    expect(
      parsePlanArgs([
        "tmp/obs.json",
        "--action",
        "tmp/action.json",
        "--expect",
        "tmp/expect.json",
        "--out",
        "tmp/plan.json",
      ]),
    ).toEqual({
      observationPath: "tmp/obs.json",
      actionPath: "tmp/action.json",
      expectPath: "tmp/expect.json",
      out: "tmp/plan.json",
    });
  });
});

describe("agent parseRunArgs", () => {
  test("parses command prefix allowlist", () => {
    expect(parseRunArgs(["tmp/plan.json", "--command-prefix", "permissions,check"])).toEqual({
      planPath: "tmp/plan.json",
      commandPrefixes: [["permissions", "check"]],
    });
  });

  test("parses recording options", () => {
    expect(
      parseRunArgs([
        "tmp/plan.json",
        "--record-frames",
        "--record-video",
        "tmp/session.mp4",
        "--record-target",
        "display",
        "--record-display",
        "2",
        "--record-fps",
        "4",
      ]),
    ).toEqual({
      planPath: "tmp/plan.json",
      commandPrefixes: [],
      record: {
        target: "display",
        display: 2,
        fps: 4,
        videoPath: "tmp/session.mp4",
      },
    });
  });
});
