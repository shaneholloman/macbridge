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
import { createLogger } from "../core/log.js";
import { sleep, type WindowInfo } from "../native/macbridge.js";

const axProbePoints = [
  { name: "toolbar", x: 0.5, y: 0.08, coord: "normalized" as const },
  { name: "left-rail", x: 0.05, y: 0.35, coord: "normalized" as const },
  { name: "message-list", x: 0.28, y: 0.35, coord: "normalized" as const },
  { name: "reading-pane", x: 0.65, y: 0.35, coord: "normalized" as const },
  { name: "center", x: 0.5, y: 0.5, coord: "normalized" as const },
];

export const outlookAdapter: AppAdapter = {
  id: "outlook",
  displayName: "Microsoft Outlook",
  kind: "mail",
  appNames: ["Microsoft Outlook"],
  bundleIDs: ["com.microsoft.Outlook"],
  target: { kind: "app", bundleID: "com.microsoft.Outlook" },
  launch(options?: AppLaunchOptions) {
    openApplication(outlookAdapter, options);
  },
  quit(options?: AppQuitOptions) {
    quitApplication(outlookAdapter, options);
  },
  windows(control: ControlPlane): WindowInfo[] {
    return windowsForAdapter(control, outlookAdapter);
  },
  selectWindow(windows: WindowInfo[], intent = {}): WindowInfo | undefined {
    return selectAppWindow(windows, intent);
  },
  waitForWindow(control: ControlPlane, options: AppWaitOptions = {}): Promise<WindowInfo> {
    return waitForAdapterWindow(control, outlookAdapter, {
      minWidth: 400,
      minHeight: 300,
      delayMs: 500,
      ...options,
    });
  },
  observe(options: AppObserveOptions, control?: ControlPlane): Promise<AppObserveOutput> {
    return observeOutlook(options, control);
  },
};

export async function observeOutlook(
  options: AppObserveOptions,
  control: ControlPlane = createControlPlane(),
): Promise<AppObserveOutput> {
  const log = createLogger("app-outlook-observe");
  mkdirSync(options.outDir, { recursive: true });

  control.permissions({ require: true, prompt: options.prompt });

  let window = outlookAdapter.selectWindow(outlookAdapter.windows(control), {
    minWidth: 400,
    minHeight: 300,
  });
  if (window == null && options.launch) {
    log.info("launching Outlook");
    outlookAdapter.launch();
    window = await outlookAdapter.waitForWindow(control);
  }
  if (window == null) {
    throw new Error("no Outlook window found; rerun with --launch or open Outlook manually");
  }

  const target = { kind: "window" as const, wid: window.wid };
  const frame = control.maximize(target, { display: "main" });
  log.info({ frame }, "maximized Outlook");
  await sleep(500);

  const observation = await control.observe({
    target,
    outDir: options.outDir,
    targetScreenshot: true,
    displayScreenshot: { display: "main" },
    accessibility: { x: 0.5, y: 0.5, coord: "normalized" },
    requirePermissions: true,
    promptPermissions: options.prompt,
  });

  const axProbes = axProbePoints.map((point) => ({
    point,
    dump: control.axDump(target, point),
  }));
  const axProbesPath = join(options.outDir, "ax-probes.json");
  await Bun.write(axProbesPath, `${JSON.stringify(axProbes, null, 2)}\n`);

  const summaryPath = join(options.outDir, "summary.json");
  await Bun.write(
    summaryPath,
    `${JSON.stringify(
      {
        adapter: outlookAdapter.id,
        app: outlookAdapter.displayName,
        bundleID: outlookAdapter.bundleIDs[0],
        window: observation.target,
        frame,
        observation: join(options.outDir, "observation.json"),
        redactedSummary: join(options.outDir, "summary.redacted.json"),
        displayScreenshot: observation.displayScreenshot,
        axProbes: axProbesPath,
        artifacts: observation.artifacts,
      },
      null,
      2,
    )}\n`,
  );
  log.info({ outDir: options.outDir, summaryPath }, "Outlook observation written");
  return {
    adapter: outlookAdapter.id,
    app: outlookAdapter.displayName,
    bundleID: "com.microsoft.Outlook",
    outDir: options.outDir,
    summaryPath,
  };
}
