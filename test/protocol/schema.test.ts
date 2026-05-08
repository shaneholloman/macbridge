import { describe, expect, test } from "bun:test";
import {
  parseAction,
  parseExpectation,
  parseObserveInput,
  parsePlan,
} from "../../src/protocol/schema.ts";

describe("parseAction", () => {
  test("accepts a typed click action", () => {
    expect(
      parseAction({
        type: "click",
        target: { kind: "window", wid: 42 },
        point: { x: 0.25, y: 0.5, coord: "normalized" },
      }),
    ).toEqual({
      type: "click",
      target: { kind: "window", wid: 42 },
      point: { x: 0.25, y: 0.5, coord: "normalized" },
    });
  });

  test("rejects app targets without a selector", () => {
    expect(() => parseAction({ type: "activate", target: { kind: "app" } })).toThrow(
      "app target needs name, bundleID, or pid",
    );
  });

  test("rejects invalid coordinates", () => {
    expect(() =>
      parseAction({
        type: "click",
        target: { kind: "window", wid: 42 },
        point: { x: 1, y: 2, coord: "preview" },
      }),
    ).toThrow();
  });
});

describe("parsePlan", () => {
  test("accepts a planned action with an expectation", () => {
    expect(
      parsePlan({
        action: { type: "activate", target: { kind: "app", name: "Helium" } },
        reason: "bring Helium forward",
        expect: {
          type: "windowTitle",
          target: { kind: "app", name: "Helium" },
          match: "Google",
        },
      }),
    ).toEqual({
      action: { type: "activate", target: { kind: "app", name: "Helium" } },
      reason: "bring Helium forward",
      expect: {
        type: "windowTitle",
        target: { kind: "app", name: "Helium" },
        match: "Google",
      },
    });
  });
});

describe("parseExpectation", () => {
  test("rejects empty artifact paths", () => {
    expect(() => parseExpectation({ type: "artifact", path: "" })).toThrow();
  });
});

describe("parseObserveInput", () => {
  test("accepts capture scope options", () => {
    expect(
      parseObserveInput({
        target: { kind: "app", bundleID: "net.imput.helium" },
        targetScreenshot: true,
        displayScreenshot: { display: "main" },
        accessibility: { x: 0.5, y: 0.5, coord: "normalized" },
        redactedSummary: { maxDepth: 4, maxArrayItems: 20 },
        outDir: "tmp/observe",
        requirePermissions: true,
      }),
    ).toEqual({
      target: { kind: "app", bundleID: "net.imput.helium" },
      targetScreenshot: true,
      displayScreenshot: { display: "main" },
      accessibility: { x: 0.5, y: 0.5, coord: "normalized" },
      redactedSummary: { maxDepth: 4, maxArrayItems: 20 },
      outDir: "tmp/observe",
      requirePermissions: true,
    });
  });

  test("rejects empty observation output directories", () => {
    expect(() => parseObserveInput({ target: { kind: "desktop" }, outDir: "" })).toThrow();
  });
});
