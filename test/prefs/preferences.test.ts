import { describe, expect, test } from "bun:test";
import {
  createPreferences,
  formatPreferences,
  parsePreferences,
  resolveWorkspaceScreen,
} from "../../src/prefs/preferences.ts";
import type { DisplayInfo } from "../../src/protocol/types.ts";

const displays: DisplayInfo[] = [
  display({ displayID: 1, name: "middle", x: 0, main: true }),
  display({ displayID: 2, name: "left", x: -1920 }),
  display({ displayID: 3, name: "right", x: 1920 }),
];

describe("MacBridge preferences", () => {
  test("creates physical workspace screen aliases from display geometry", () => {
    const preferences = createPreferences(displays, { preferredScreen: "left" });

    expect(preferences.workspace.preferredScreen).toBe("left");
    expect(preferences.workspace.terminalAdapter).toBe("ghostty");
    expect(preferences.workspace.terminalReadOnly).toBe(true);
    expect(preferences.screens.left?.displayID).toBe(2);
    expect(preferences.screens.middle?.displayID).toBe(1);
    expect(preferences.screens.right?.displayID).toBe(3);
    expect(preferences.screens.main?.displayID).toBe(1);
  });

  test("round-trips preferences through TOML", () => {
    const preferences = createPreferences(displays, {
      preferredScreen: "left",
      cwd: "/Users/shaneholloman/git/sources/uicnz/aria",
    });

    expect(parsePreferences(formatPreferences(preferences))).toEqual(preferences);
  });

  test("resolves the preferred workspace screen against attached displays", () => {
    const preferences = createPreferences(displays, { preferredScreen: "left" });
    const resolved = resolveWorkspaceScreen(preferences, displays);

    expect(resolved.name).toBe("left");
    expect(resolved.display.displayID).toBe(2);
  });
});

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
