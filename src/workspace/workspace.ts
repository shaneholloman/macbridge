import type { ControlPlane } from "../core/control.js";
import type { WindowInfo } from "../native/macbridge.js";
import { loadPreferences, resolveWorkspaceScreen } from "../prefs/preferences.js";
import type { DisplayInfo, Rect, Target } from "../protocol/types.js";

export type WorkspaceSelection = {
  screen: string;
  display: DisplayInfo;
  windows: WindowInfo[];
};

export function workspaceSelection(
  control: ControlPlane,
  options: { screen?: string } = {},
): WorkspaceSelection {
  const preferences = loadPreferences();
  const resolved = resolveWorkspaceScreen(preferences, control.displays(), options.screen);
  const windows = control
    .windows()
    .filter((window) => containsWindow(resolved.display, window))
    .sort(windowSort);
  return {
    screen: resolved.name,
    display: resolved.display,
    windows,
  };
}

export function maximizeTarget(
  control: ControlPlane,
  target: Target,
  options: { screen?: string; activate?: boolean } = {},
): WindowInfo | undefined {
  const selection = workspaceSelection(control, options);
  const targetWindow = resolveWorkspaceWindow(control, target, selection);
  if (targetWindow == null) return undefined;

  control.setFrame({ kind: "window", wid: targetWindow.wid }, workspaceFrame(selection.display));
  if (options.activate ?? true) {
    control.activate({ kind: "window", wid: targetWindow.wid });
  }
  return targetWindow;
}

export function focusOffset(
  control: ControlPlane,
  options: { screen?: string; offset: number },
): WindowInfo | undefined {
  const selection = workspaceSelection(control, options);
  if (selection.windows.length === 0) return undefined;
  const active = activeWindow(control);
  const activeIndex =
    active == null ? -1 : selection.windows.findIndex((window) => window.wid === active.wid);
  const nextIndex = positiveModulo(activeIndex + options.offset, selection.windows.length);
  const next = selection.windows[nextIndex];
  if (next == null) return undefined;
  control.activate({ kind: "window", wid: next.wid });
  return next;
}

function resolveWorkspaceWindow(
  control: ControlPlane,
  target: Target,
  selection: WorkspaceSelection,
): WindowInfo | undefined {
  if (target.kind === "window") {
    return control.windows().find((window) => window.wid === target.wid);
  }
  if (target.kind === "app") {
    const candidates = control.windows(target);
    return candidates.find((window) => containsWindow(selection.display, window)) ?? candidates[0];
  }
  return undefined;
}

function activeWindow(control: ControlPlane): WindowInfo | undefined {
  return control.json<WindowInfo>(["active-window"]);
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

function workspaceFrame(display: DisplayInfo): Rect {
  return {
    x: display.visibleX,
    y: display.visibleY,
    width: display.visibleWidth,
    height: display.visibleHeight,
  };
}

function windowSort(left: WindowInfo, right: WindowInfo): number {
  return (
    left.owner.localeCompare(right.owner) ||
    left.name.localeCompare(right.name) ||
    left.wid - right.wid
  );
}

function positiveModulo(value: number, size: number): number {
  return ((value % size) + size) % size;
}
