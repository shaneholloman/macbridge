import { mkdirSync } from "node:fs";
import { join } from "node:path";
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
  AppObserveOptions,
  AppObserveOutput,
  AppQuitOptions,
  AppWaitOptions,
} from "../adapter/types.js";
import { createControlPlane } from "../core/client.js";
import type { ControlPlane } from "../core/control.js";
import type { WindowInfo } from "../native/macbridge.js";

export const ARIA_BUNDLE_ID = "nz.uic.aria";
export const ARIA_DEV_COMMAND = "bun run dev";
export const ARIA_DEV_SESSION = "aria-dev";

export const ariaAdapter: AppAdapter = {
  id: "aria",
  displayName: "Aria",
  kind: "app",
  appNames: ["Aria", "Aria Dev", "Aria Core"],
  bundleIDs: [ARIA_BUNDLE_ID],
  target: { kind: "app", bundleID: ARIA_BUNDLE_ID },
  launch(options?: AppLaunchOptions) {
    openApplication(ariaAdapter, options);
  },
  quit(options?: AppQuitOptions) {
    quitApplication(ariaAdapter, options);
  },
  windows(control: ControlPlane): WindowInfo[] {
    return windowsForAdapter(control, ariaAdapter);
  },
  selectWindow(windows: WindowInfo[], intent = {}): WindowInfo | undefined {
    return selectAppWindow(windows, intent);
  },
  waitForWindow(control: ControlPlane, options: AppWaitOptions = {}): Promise<WindowInfo> {
    return waitForAdapterWindow(control, ariaAdapter, {
      minWidth: 600,
      minHeight: 360,
      delayMs: 300,
      ...options,
    });
  },
  observe(options: AppObserveOptions, control?: ControlPlane): Promise<AppObserveOutput> {
    return observeAriaInstalled(options, control);
  },
};

export async function observeAriaInstalled(
  options: AppObserveOptions,
  control: ControlPlane = createControlPlane(),
): Promise<AppObserveOutput> {
  mkdirSync(options.outDir, { recursive: true });
  control.permissions({ require: true, prompt: options.prompt });

  let window = ariaAdapter.selectWindow(ariaAdapter.windows(control), {
    minWidth: 600,
    minHeight: 360,
  });
  if (window == null && options.launch) {
    ariaAdapter.launch();
    window = await ariaAdapter.waitForWindow(control);
  }
  if (window == null) {
    throw new Error("no Aria window found; rerun with --launch or open Aria manually");
  }

  const target = { kind: "window" as const, wid: window.wid };
  const observation = await control.observe({
    target,
    outDir: options.outDir,
    targetScreenshot: true,
    displayScreenshot: { display: "main" },
    accessibility: { x: 0.5, y: 0.5, coord: "normalized" },
    requirePermissions: true,
    promptPermissions: options.prompt,
  });

  const summaryPath = join(options.outDir, "summary.json");
  await Bun.write(
    summaryPath,
    `${JSON.stringify(
      {
        adapter: ariaAdapter.id,
        app: ariaAdapter.displayName,
        mode: "installed",
        bundleID: ARIA_BUNDLE_ID,
        window: observation.target,
        observation: join(options.outDir, "observation.json"),
        redactedSummary: join(options.outDir, "summary.redacted.json"),
        displayScreenshot: observation.displayScreenshot,
        artifacts: observation.artifacts,
      },
      null,
      2,
    )}\n`,
  );

  return {
    adapter: ariaAdapter.id,
    app: ariaAdapter.displayName,
    bundleID: ARIA_BUNDLE_ID,
    outDir: options.outDir,
    summaryPath,
  };
}
