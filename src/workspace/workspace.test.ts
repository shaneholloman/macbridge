import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ControlPlane } from "../core/control.ts";
import { createPreferences, writePreferences } from "../prefs/preferences.ts";
import type { DisplayInfo, Target } from "../protocol/types.ts";
import { focusOffset, workspaceSelection } from "./workspace.ts";

const displays: DisplayInfo[] = [
  display({ displayID: 1, name: "middle", x: 0, main: true }),
  display({ displayID: 2, name: "left", x: -1920 }),
  display({ displayID: 3, name: "right", x: 1920 }),
];

describe("workspace selection", () => {
  const previousHome = process.env.MACBRIDGE_HOME;

  beforeEach(() => {
    process.env.MACBRIDGE_HOME = mkdtempSync(join(tmpdir(), "macbridge-home-"));
    writePreferences(createPreferences(displays, { preferredScreen: "left" }));
  });

  afterEach(() => {
    if (previousHome == null) {
      delete process.env.MACBRIDGE_HOME;
    } else {
      process.env.MACBRIDGE_HOME = previousHome;
    }
  });

  test("returns windows on the selected workspace screen", () => {
    const control = fakeControl();

    expect(
      workspaceSelection(control, { screen: "left" }).windows.map((window) => window.owner),
    ).toEqual(["Ghostty"]);
  });

  test("cycles within the selected workspace screen", () => {
    const activated: number[] = [];
    const control = fakeControl(activated);

    const focused = focusOffset(control, { screen: "right", offset: 1 });

    expect(focused?.owner).toBe("VS Code");
    expect(activated).toEqual([303]);
  });
});

function fakeControl(activated: number[] = []): ControlPlane {
  return {
    displays: () => displays,
    windows: () => [
      { wid: 101, pid: 1, owner: "Ghostty", name: "~", x: -1920, y: 0, width: 1920, height: 1080 },
      {
        wid: 202,
        pid: 2,
        owner: "Activity Monitor",
        name: "Activity Monitor",
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
      },
      {
        wid: 303,
        pid: 3,
        owner: "VS Code",
        name: "aria",
        x: 1920,
        y: 0,
        width: 1920,
        height: 1080,
      },
    ],
    json: () => ({
      wid: 101,
      pid: 1,
      owner: "Ghostty",
      name: "~",
      x: -1920,
      y: 0,
      width: 1920,
      height: 1080,
    }),
    activate(target: Target) {
      if (target.kind === "window") activated.push(target.wid);
      return {};
    },
  } as unknown as ControlPlane;
}

function display(input: {
  displayID: number;
  name: string;
  x: number;
  main?: boolean;
}): DisplayInfo {
  return {
    index: input.displayID,
    displayID: input.displayID,
    screenNumber: input.displayID,
    name: input.name,
    x: input.x,
    y: 0,
    width: 1920,
    height: 1080,
    visibleX: input.x,
    visibleY: 0,
    visibleWidth: 1920,
    visibleHeight: 1080,
    pixelWidth: 1920,
    pixelHeight: 1080,
    scaleFactor: 2,
    main: input.main ?? false,
    builtin: false,
  };
}
