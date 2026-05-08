import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { DisplayInfo } from "../protocol/types.js";

export type ScreenPreference = {
  displayID: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Preferences = {
  version: 1;
  workspace: {
    preferredScreen: string;
    terminalApp: string;
    terminalSession: string;
    terminalReadOnly: boolean;
    terminalCwd?: string;
  };
  screens: Record<string, ScreenPreference>;
};

export type ResolvedScreen = {
  name: string;
  preference: ScreenPreference;
  display: DisplayInfo;
};

type PreferenceInput = {
  version?: unknown;
  workspace?: {
    preferredScreen?: unknown;
    terminalApp?: unknown;
    terminalSession?: unknown;
    terminalReadOnly?: unknown;
    terminalCwd?: unknown;
  };
  screens?: Record<
    string,
    {
      displayID?: unknown;
      name?: unknown;
      x?: unknown;
      y?: unknown;
      width?: unknown;
      height?: unknown;
    }
  >;
};

export function preferencesDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.MACBRIDGE_HOME ?? join(homedir(), "MacBridge");
}

export function preferencesPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(preferencesDir(env), "preferences.toml");
}

export function createPreferences(
  displays: DisplayInfo[],
  options: { preferredScreen?: string; cwd?: string } = {},
): Preferences {
  const screens = inferScreenPreferences(displays);
  const preferredScreen = options.preferredScreen ?? (screens.left == null ? "main" : "left");
  return {
    version: 1,
    workspace: {
      preferredScreen,
      terminalApp: "Ghostty",
      terminalSession: "macbridge",
      terminalReadOnly: true,
      ...(options.cwd == null ? {} : { terminalCwd: options.cwd }),
    },
    screens,
  };
}

export function readPreferences(path = preferencesPath()): Preferences {
  return parsePreferences(readFileSync(path, "utf8"));
}

export function loadPreferences(path = preferencesPath()): Preferences {
  if (!preferencesExist(path)) {
    throw new Error("MacBridge preferences are missing; run: macbridge prefs init");
  }
  return readPreferences(path);
}

export function writePreferences(preferences: Preferences, path = preferencesPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, formatPreferences(preferences));
}

export function preferencesExist(path = preferencesPath()): boolean {
  return existsSync(path);
}

export function parsePreferences(text: string): Preferences {
  const parsed = Bun.TOML.parse(text) as PreferenceInput;
  if (parsed.version !== 1) {
    throw new Error("MacBridge preferences version must be 1");
  }
  if (parsed.workspace == null) {
    throw new Error("MacBridge preferences need a [workspace] section");
  }
  if (parsed.screens == null || Object.keys(parsed.screens).length === 0) {
    throw new Error("MacBridge preferences need at least one [screens.<name>] section");
  }

  const preferredScreen = stringValue(
    parsed.workspace.preferredScreen,
    "workspace.preferredScreen",
  );
  const terminalApp = stringValue(
    parsed.workspace.terminalApp ?? "Ghostty",
    "workspace.terminalApp",
  );
  const terminalSession = stringValue(
    parsed.workspace.terminalSession ?? "macbridge",
    "workspace.terminalSession",
  );
  const terminalReadOnly = booleanValue(
    parsed.workspace.terminalReadOnly ?? true,
    "workspace.terminalReadOnly",
  );
  const terminalCwd =
    parsed.workspace.terminalCwd == null
      ? undefined
      : stringValue(parsed.workspace.terminalCwd, "workspace.terminalCwd");

  const screens: Record<string, ScreenPreference> = {};
  for (const [name, screen] of Object.entries(parsed.screens)) {
    screens[name] = {
      displayID: numberValue(screen.displayID, `screens.${name}.displayID`),
      name: stringValue(screen.name, `screens.${name}.name`),
      x: numberValue(screen.x, `screens.${name}.x`),
      y: numberValue(screen.y, `screens.${name}.y`),
      width: numberValue(screen.width, `screens.${name}.width`),
      height: numberValue(screen.height, `screens.${name}.height`),
    };
  }

  return {
    version: 1,
    workspace: {
      preferredScreen,
      terminalApp,
      terminalSession,
      terminalReadOnly,
      ...(terminalCwd == null ? {} : { terminalCwd }),
    },
    screens,
  };
}

export function formatPreferences(preferences: Preferences): string {
  const lines = [
    "# MacBridge user preferences",
    "# Screen aliases are physical workspace intent, not generic display IDs.",
    "version = 1",
    "",
    "[workspace]",
    `preferredScreen = ${tomlString(preferences.workspace.preferredScreen)}`,
    `terminalApp = ${tomlString(preferences.workspace.terminalApp)}`,
    `terminalSession = ${tomlString(preferences.workspace.terminalSession)}`,
    `terminalReadOnly = ${preferences.workspace.terminalReadOnly}`,
  ];
  if (preferences.workspace.terminalCwd != null) {
    lines.push(`terminalCwd = ${tomlString(preferences.workspace.terminalCwd)}`);
  }

  const names = Object.keys(preferences.screens).sort(screenSort);
  for (const name of names) {
    const screen = preferences.screens[name];
    if (screen == null) continue;
    lines.push(
      "",
      `[screens.${name}]`,
      `displayID = ${screen.displayID}`,
      `name = ${tomlString(screen.name)}`,
      `x = ${screen.x}`,
      `y = ${screen.y}`,
      `width = ${screen.width}`,
      `height = ${screen.height}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function inferScreenPreferences(displays: DisplayInfo[]): Record<string, ScreenPreference> {
  const sorted = [...displays].sort((left, right) => left.x - right.x || left.y - right.y);
  const screens: Record<string, ScreenPreference> = {};
  const names = screenNames(sorted.length);
  for (const [index, display] of sorted.entries()) {
    const name = names[index] ?? `screen${index + 1}`;
    screens[name] = screenPreference(display);
  }
  const main = displays.find((display) => display.main);
  if (main != null) {
    screens.main = screenPreference(main);
  }
  return screens;
}

export function resolveWorkspaceScreen(
  preferences: Preferences,
  displays: DisplayInfo[],
  requestedScreen?: string,
): ResolvedScreen {
  const name = requestedScreen ?? preferences.workspace.preferredScreen;
  const screen = preferences.screens[name];
  if (screen == null) {
    throw new Error(`workspace screen "${name}" is not defined in MacBridge preferences`);
  }

  const display =
    displays.find((candidate) => candidate.displayID === screen.displayID) ??
    displays.find((candidate) => sameGeometry(candidate, screen));
  if (display == null) {
    throw new Error(`workspace screen "${name}" is not attached`);
  }

  return { name, preference: screen, display };
}

function screenPreference(display: DisplayInfo): ScreenPreference {
  return {
    displayID: display.displayID,
    name: display.name,
    x: display.x,
    y: display.y,
    width: display.width,
    height: display.height,
  };
}

function sameGeometry(display: DisplayInfo, screen: ScreenPreference): boolean {
  return (
    display.x === screen.x &&
    display.y === screen.y &&
    display.width === screen.width &&
    display.height === screen.height
  );
}

function screenNames(count: number): string[] {
  if (count === 1) return ["main"];
  if (count === 2) return ["left", "right"];
  if (count === 3) return ["left", "middle", "right"];
  return ["left", "middle", "right"];
}

function screenSort(left: string, right: string): number {
  const order = new Map([
    ["left", 1],
    ["middle", 2],
    ["right", 3],
    ["main", 4],
  ]);
  return (order.get(left) ?? 99) - (order.get(right) ?? 99) || left.localeCompare(right);
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function numberValue(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
  return value;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be a boolean`);
  }
  return value;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}
