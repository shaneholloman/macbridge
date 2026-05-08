import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { ControlPlane } from "../core/control.js";
import type { WindowInfo } from "../native/macbridge.js";
import { loadPreferences, resolveWorkspaceScreen } from "../prefs/preferences.js";
import type { DisplayInfo, Rect } from "../protocol/types.js";

export type TerminalLane = {
  session: string;
  screen: string;
  display: DisplayInfo;
  window?: WindowInfo;
};

export type TerminalStartOptions = {
  screen?: string;
  session?: string;
  cwd?: string;
  command?: string;
  writable?: boolean;
};

export type TerminalSendOptions = {
  screen?: string;
  session?: string;
  text: string;
  enter?: boolean;
};

export type TerminalCaptureOptions = {
  screen?: string;
  session?: string;
  out?: string;
};

const tmuxBin = "/opt/homebrew/bin/tmux";

export function resolveLane(
  control: ControlPlane,
  options: { screen?: string; session?: string } = {},
): TerminalLane {
  const preferences = loadPreferences();
  const resolved = resolveWorkspaceScreen(preferences, control.displays(), options.screen);
  const session = options.session ?? preferences.workspace.terminalSession;
  const windows = terminalWindows(control, preferences.workspace.terminalApp).filter((window) =>
    containsWindow(resolved.display, window),
  );
  return {
    session,
    screen: resolved.name,
    display: resolved.display,
    ...(windows[0] == null ? {} : { window: windows[0] }),
  };
}

export function startLane(control: ControlPlane, options: TerminalStartOptions = {}): TerminalLane {
  const preferences = loadPreferences();
  const resolved = resolveWorkspaceScreen(preferences, control.displays(), options.screen);
  const session = options.session ?? preferences.workspace.terminalSession;
  const cwd = options.cwd ?? preferences.workspace.terminalCwd ?? process.cwd();

  ensureTmuxSession(session, cwd);
  if (options.command != null) {
    sendTmux(session, options.command, true);
  }

  const before = terminalWindows(control, preferences.workspace.terminalApp);
  const attachArgs = [
    "-na",
    terminalAppTarget(preferences.workspace.terminalApp),
    "--args",
    "-e",
    tmuxBin,
    "attach-session",
  ];
  if (preferences.workspace.terminalReadOnly && !options.writable) {
    attachArgs.push("-r");
  }
  attachArgs.push("-t", session);
  spawnSync("open", attachArgs);

  const window = waitForTerminalWindow(control, preferences.workspace.terminalApp, before, 5000);
  const targetWindow =
    window ??
    terminalWindows(control, preferences.workspace.terminalApp).find(
      (candidate) => candidate.name === "~",
    );
  if (targetWindow != null) {
    control.setFrame({ kind: "window", wid: targetWindow.wid }, laneFrame(resolved.display));
  }

  return resolveLane(control, { screen: resolved.name, session });
}

export function sendLane(control: ControlPlane, options: TerminalSendOptions): TerminalLane {
  const lane = resolveLane(control, options);
  sendTmux(lane.session, options.text, options.enter ?? true);
  return lane;
}

export function captureLane(control: ControlPlane, options: TerminalCaptureOptions = {}): string {
  const lane = resolveLane(control, options);
  const out = options.out ?? `screenshots/workspace-${lane.screen}.png`;
  control.capture({ kind: "display", display: lane.display.displayID }, out);
  return out;
}

export function stopLane(control: ControlPlane, options: { session?: string } = {}): TerminalLane {
  const lane = resolveLane(control, options);
  runTmux(["kill-session", "-t", lane.session], { allowFailure: true });
  return lane;
}

function terminalWindows(control: ControlPlane, app: string): WindowInfo[] {
  return control.windows({ kind: "app", name: terminalAppName(app) });
}

function terminalAppTarget(app: string): string {
  if (app.includes("/") || app.endsWith(".app")) return app;
  return `${app}.app`;
}

function terminalAppName(app: string): string {
  const name = app.replace(/\/+$/u, "").split("/").at(-1);
  return (name ?? app).replace(/\.app$/u, "");
}

function containsWindow(display: DisplayInfo, window: WindowInfo): boolean {
  const displayRight = display.x + display.width;
  const displayBottom = display.y + display.height;
  const windowCenterX = window.x + window.width / 2;
  const windowCenterY = window.y + window.height / 2;
  return (
    windowCenterX >= display.x &&
    windowCenterX <= displayRight &&
    windowCenterY >= display.y &&
    windowCenterY <= displayBottom
  );
}

function laneFrame(display: DisplayInfo): Rect {
  return {
    x: display.visibleX,
    y: display.visibleY,
    width: display.visibleWidth,
    height: display.visibleHeight,
  };
}

function sendTmux(session: string, text: string, enter: boolean): void {
  runTmux(["send-keys", "-t", session, "-l", text]);
  if (enter) {
    runTmux(["send-keys", "-t", session, "Enter"]);
  }
}

function ensureTmuxSession(session: string, cwd: string): void {
  const result = spawnSync(tmuxBin, ["has-session", "-t", session], { encoding: "utf8" });
  if (result.status === 0) return;
  runTmux(["new-session", "-d", "-s", session, "-c", cwd]);
}

function runTmux(args: string[], options: { allowFailure?: boolean } = {}): void {
  if (!existsSync(tmuxBin)) {
    throw new Error(`tmux is missing at ${tmuxBin}`);
  }
  const result = spawnSync(tmuxBin, args, { encoding: "utf8" });
  if (result.status !== 0 && !options.allowFailure) {
    const detail = result.stderr || result.stdout || `exit ${result.status}`;
    throw new Error(`${tmuxBin} ${args.join(" ")} failed: ${detail.trim()}`);
  }
}

function waitForTerminalWindow(
  control: ControlPlane,
  app: string,
  before: WindowInfo[],
  timeoutMs: number,
): WindowInfo | undefined {
  const known = new Set(before.map((window) => window.wid));
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const current = terminalWindows(control, app);
    const fresh = current.find((window) => !known.has(window.wid));
    if (fresh != null) return fresh;
    Bun.sleepSync(100);
  }
  return undefined;
}
