import { spawnSync } from "node:child_process";
import {
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

export const ghosttyAdapter: TerminalAppAdapter = {
  id: "ghostty",
  displayName: "Ghostty",
  kind: "terminal",
  appNames: ["Ghostty"],
  bundleIDs: ["com.mitchellh.ghostty"],
  target: { kind: "app", bundleID: "com.mitchellh.ghostty" },
  terminal: {
    fallbackWindowTitles: ["~"],
    openSession(options: TerminalOpenOptions): void {
      const args = [
        "-na",
        "Ghostty.app",
        "--args",
        "-e",
        options.tmuxBin,
        "attach-session",
        ...(options.readOnly ? ["-r"] : []),
        "-t",
        options.session,
      ];
      const result = spawnSync("open", args, { encoding: "utf8" });
      if (result.status !== 0) {
        throw new Error(result.stderr.trim() || result.stdout.trim() || "failed to open Ghostty");
      }
    },
  },
  launch(options?: AppLaunchOptions) {
    openApplication(ghosttyAdapter, options);
  },
  quit(options?: AppQuitOptions) {
    quitApplication(ghosttyAdapter, options);
  },
  windows(control: ControlPlane): WindowInfo[] {
    return windowsForAdapter(control, ghosttyAdapter);
  },
  selectWindow(windows: WindowInfo[], intent = {}): WindowInfo | undefined {
    return selectAppWindow(windows, intent);
  },
  waitForWindow(control: ControlPlane, options: AppWaitOptions = {}): Promise<WindowInfo> {
    return waitForAdapterWindow(control, ghosttyAdapter, {
      minWidth: 300,
      minHeight: 200,
      delayMs: 100,
      ...options,
    });
  },
};
