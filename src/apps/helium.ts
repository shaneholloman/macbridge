import {
  openApplication,
  quitApplication,
  selectAppWindow,
  waitForAdapterWindow,
  windowsForAdapter,
} from "../adapter/helpers.js";
import type {
  AppAdapter,
  AppLaunchOptions,
  AppQuitOptions,
  AppWaitOptions,
} from "../adapter/types.js";
import type { ControlPlane } from "../core/control.js";
import type { WindowInfo } from "../native/macbridge.js";

export const heliumAdapter: AppAdapter = {
  id: "helium",
  displayName: "Helium",
  kind: "browser",
  appNames: ["Helium"],
  bundleIDs: ["net.imput.helium"],
  target: { kind: "app", bundleID: "net.imput.helium" },
  launch(options?: AppLaunchOptions) {
    openApplication(heliumAdapter, options);
  },
  quit(options?: AppQuitOptions) {
    quitApplication(heliumAdapter, options);
  },
  windows(control: ControlPlane): WindowInfo[] {
    return windowsForAdapter(control, heliumAdapter);
  },
  selectWindow(windows: WindowInfo[], intent = {}): WindowInfo | undefined {
    return selectAppWindow(windows, intent);
  },
  waitForWindow(control: ControlPlane, options: AppWaitOptions = {}): Promise<WindowInfo> {
    return waitForAdapterWindow(control, heliumAdapter, {
      minWidth: 400,
      minHeight: 300,
      delayMs: 300,
      ...options,
    });
  },
};
