import { describe, expect, test } from "bun:test";
import type { Observation } from "../protocol/types.js";
import { createObservationSummary, redactText } from "./summary.js";

function fixtureObservation(): Observation {
  return {
    id: "obs-1",
    target: { kind: "window", wid: 42 },
    capturedAt: "2026-05-02T00:00:00.000Z",
    permissions: {
      ok: false,
      prompted: false,
      permissions: [
        { id: "accessibility", name: "Accessibility", granted: true, requiredFor: ["input"] },
        { id: "screen", name: "Screen Recording", granted: false, requiredFor: ["capture"] },
      ],
    },
    displays: [
      {
        index: 0,
        displayID: 1,
        screenNumber: 1,
        name: "Built-in Display",
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        visibleX: 0,
        visibleY: 55,
        visibleWidth: 1920,
        visibleHeight: 995,
        pixelWidth: 3840,
        pixelHeight: 2160,
        scaleFactor: 2,
        main: true,
        builtin: true,
      },
    ],
    windows: [
      {
        pid: 100,
        wid: 42,
        x: 0,
        y: 55,
        width: 1920,
        height: 995,
        owner: "Microsoft Outlook",
        name: "Inbox • person@example.com",
        bundleID: "com.microsoft.Outlook",
      },
    ],
    artifacts: [
      { path: "tmp/observations/outlook/target.png", kind: "target-screenshot", bytes: 100 },
      { path: "tmp/observations/outlook/display.png", kind: "display-screenshot", bytes: 200 },
    ],
    targetScreenshot: {
      path: "tmp/observations/outlook/target.png",
      kind: "target-screenshot",
      bytes: 100,
    },
    displayScreenshot: {
      path: "tmp/observations/outlook/display.png",
      kind: "display-screenshot",
      bytes: 200,
    },
    accessibility: {
      plan: { name: "select_row_attr", role: "AXRow" },
      target: {
        AXRole: "AXCell",
        AXDescription: "Private subject and message preview",
        AXTitle: "Private title",
        actions: ["AXPress", "AXShowMenu"],
        bounds: { x: 1, y: 2, width: 3, height: 4 },
      },
    },
  };
}

describe("createObservationSummary", () => {
  test("redacts user text while preserving structural accessibility metadata", () => {
    const summary = createObservationSummary(fixtureObservation());

    expect(summary.permissions).toEqual({ ok: false, missing: ["Screen Recording"] });
    expect(summary.targetWindow?.wid).toBe(42);
    expect(summary.windows[0]?.title).toEqual(redactText("Inbox • person@example.com"));
    expect(summary.accessibility).toMatchObject({
      plan: { name: "select_row_attr", role: "AXRow" },
      target: {
        AXRole: "AXCell",
        actions: ["AXPress", "AXShowMenu"],
        bounds: { x: 1, y: 2, width: 3, height: 4 },
      },
    });
    expect(JSON.stringify(summary)).not.toContain("person@example.com");
    expect(JSON.stringify(summary)).not.toContain("Private subject");
    expect(summary.redaction.textFieldsRedacted).toBeGreaterThanOrEqual(3);
  });

  test("keeps capture scopes explicit in summary artifacts", () => {
    const summary = createObservationSummary(fixtureObservation());

    expect(summary.captures.target?.kind).toBe("target-screenshot");
    expect(summary.captures.display?.kind).toBe("display-screenshot");
    expect(summary.artifacts.map((artifact) => artifact.kind)).toEqual([
      "target-screenshot",
      "display-screenshot",
    ]);
  });

  test("truncates large accessibility arrays", () => {
    const observation = fixtureObservation();
    observation.accessibility = {
      appChildren: [
        { AXRole: "AXButton", AXTitle: "One" },
        { AXRole: "AXButton", AXTitle: "Two" },
        { AXRole: "AXButton", AXTitle: "Three" },
      ],
    };

    const summary = createObservationSummary(observation, { maxArrayItems: 2 });

    expect(summary.redaction.arraysTruncated).toBe(1);
    expect(summary.accessibility).toMatchObject({
      appChildren: [
        { AXRole: "AXButton" },
        { AXRole: "AXButton" },
        { truncated: true, omitted: 1, reason: "max-array-items" },
      ],
    });
    expect(JSON.stringify(summary)).not.toContain("Three");
  });
});
