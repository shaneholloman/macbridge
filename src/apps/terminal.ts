import { spawnSync } from "node:child_process";
import {
  appleScriptString,
  openApplication,
  quitApplication,
  selectAppWindow,
  waitForAdapterWindow,
  windowsForAdapter,
} from "../adapter/helpers.js";
import type {
  AppLaunchOptions,
  AppQuitOptions,
  AppWaitOptions,
  TerminalAppAdapter,
  TerminalOpenOptions,
} from "../adapter/types.js";
import type { ControlPlane } from "../core/control.js";
import type { WindowInfo } from "../native/macbridge.js";

export const macosTerminalAdapter: TerminalAppAdapter = {
  id: "terminal",
  displayName: "Terminal",
  kind: "terminal",
  appNames: ["Terminal"],
  bundleIDs: ["com.apple.Terminal"],
  target: { kind: "app", bundleID: "com.apple.Terminal" },
  terminal: {
    fallbackWindowTitles: ["tmux", "~"],
    openSession(options: TerminalOpenOptions): void {
      const command = [
        shellQuote(options.tmuxBin),
        "attach-session",
        ...(options.readOnly ? ["-r"] : []),
        "-t",
        shellQuote(options.session),
      ].join(" ");
      const result = spawnSync(
        "osascript",
        [
          "-e",
          'tell application "Terminal"',
          "-e",
          `do script ${appleScriptString(command)}`,
          "-e",
          "activate",
          "-e",
          "end tell",
        ],
        { encoding: "utf8" },
      );
      if (result.status !== 0) {
        throw new Error(result.stderr.trim() || result.stdout.trim() || "failed to open Terminal");
      }
    },
  },
  launch(options?: AppLaunchOptions) {
    openApplication(macosTerminalAdapter, options);
  },
  quit(options?: AppQuitOptions) {
    quitApplication(macosTerminalAdapter, options);
  },
  windows(control: ControlPlane): WindowInfo[] {
    return windowsForAdapter(control, macosTerminalAdapter);
  },
  selectWindow(windows: WindowInfo[], intent = {}): WindowInfo | undefined {
    return selectAppWindow(windows, intent);
  },
  waitForWindow(control: ControlPlane, options: AppWaitOptions = {}): Promise<WindowInfo> {
    return waitForAdapterWindow(control, macosTerminalAdapter, {
      minWidth: 300,
      minHeight: 200,
      delayMs: 100,
      ...options,
    });
  },
};

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
