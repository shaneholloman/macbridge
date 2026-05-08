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

export const textEditAdapter: AppAdapter = {
  id: "textedit",
  displayName: "TextEdit",
  kind: "editor",
  appNames: ["TextEdit"],
  bundleIDs: ["com.apple.TextEdit"],
  target: { kind: "app", bundleID: "com.apple.TextEdit" },
  launch(options?: AppLaunchOptions) {
    openApplication(textEditAdapter, options);
  },
  quit(options?: AppQuitOptions) {
    quitApplication(textEditAdapter, { saving: "no", ...options });
  },
  windows(control: ControlPlane): WindowInfo[] {
    return windowsForAdapter(control, textEditAdapter);
  },
  selectWindow(windows: WindowInfo[], intent = {}): WindowInfo | undefined {
    return selectAppWindow(windows, intent);
  },
  waitForWindow(control: ControlPlane, options: AppWaitOptions = {}): Promise<WindowInfo> {
    return waitForAdapterWindow(control, textEditAdapter, {
      minWidth: 200,
      minHeight: 120,
      delayMs: 200,
      ...options,
    });
  },
};
