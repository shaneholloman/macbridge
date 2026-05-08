import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createControlPlane } from "../core/client.js";
import type { ControlPlane } from "../core/control.js";
import { sleep, type WindowInfo } from "../native/macbridge.js";
import type { Observation } from "../protocol/types.js";
import type {
  AppAdapter,
  AppLaunchOptions,
  AppObserveOptions,
  AppObserveOutput,
  AppQuitOptions,
  AppWaitOptions,
  AppWindowIntent,
  TerminalAppAdapter,
} from "./types.js";

export function appTarget(adapter: AppAdapter): AppAdapter["target"] {
  return adapter.target;
}

export function openApplication(adapter: AppAdapter, options: AppLaunchOptions = {}): void {
  const bundleID = adapter.bundleIDs[0];
  const appName = adapter.appNames[0];
  if (bundleID == null && appName == null) {
    throw new Error(`${adapter.id} adapter needs an app name or bundle id`);
  }
  const args: string[] =
    bundleID == null ? ["-a", appName ?? adapter.displayName] : ["-b", bundleID];
  const files = options.files ?? [];
  const appArgs = options.args ?? [];
  const result = spawnSync(
    "open",
    [...args, ...files, ...(appArgs.length === 0 ? [] : ["--args", ...appArgs])],
    {
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() || result.stdout.trim() || `failed to launch ${adapter.displayName}`,
    );
  }
}

export function quitApplication(adapter: AppAdapter, options: AppQuitOptions = {}): void {
  const name = adapter.appNames[0] ?? adapter.displayName;
  const saving = options.saving ?? "ask";
  const result = spawnSync(
    "osascript",
    [
      "-e",
      `if application ${appleScriptString(name)} is running then`,
      "-e",
      `tell application ${appleScriptString(name)} to quit${saving === "ask" ? "" : ` saving ${saving}`}`,
      "-e",
      "end if",
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() || result.stdout.trim() || `failed to quit ${adapter.displayName}`,
    );
  }
}

export function windowsForAdapter(control: ControlPlane, adapter: AppAdapter): WindowInfo[] {
  const seen = new Set<number>();
  const windows: WindowInfo[] = [];
  const targets =
    adapter.bundleIDs.length === 0
      ? adapter.appNames.map((name) => ({ kind: "app" as const, name }))
      : adapter.bundleIDs.map((bundleID) => ({ kind: "app" as const, bundleID }));
  for (const target of targets) {
    for (const window of control.windows(target)) {
      if (seen.has(window.wid)) continue;
      seen.add(window.wid);
      windows.push(window);
    }
  }
  return windows;
}

export function selectAppWindow(
  windows: WindowInfo[],
  intent: AppWindowIntent = {},
): WindowInfo | undefined {
  return windows.find((window) => windowMatchesIntent(window, intent));
}

export async function waitForAdapterWindow(
  control: ControlPlane,
  adapter: AppAdapter,
  options: AppWaitOptions = {},
): Promise<WindowInfo> {
  const attempts = options.attempts ?? 30;
  const delayMs = options.delayMs ?? 300;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = adapter.selectWindow(adapter.windows(control), options);
    if (candidate != null) return candidate;
    await sleep(delayMs);
  }
  throw new Error(`no matching ${adapter.displayName} window appeared`);
}

export async function observeApp(
  adapter: AppAdapter,
  options: AppObserveOptions,
  control: ControlPlane = createControlPlane(),
): Promise<AppObserveOutput> {
  mkdirSync(options.outDir, { recursive: true });
  control.permissions({ require: true, prompt: options.prompt });
  if (options.launch && adapter.windows(control).length === 0) {
    adapter.launch();
  }
  const window = await adapter.waitForWindow(control);
  const target = { kind: "window" as const, wid: window.wid };
  const observation: Observation = await control.observe({
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
        adapter: adapter.id,
        app: adapter.displayName,
        bundleID: adapter.bundleIDs[0],
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
    adapter: adapter.id,
    app: adapter.displayName,
    ...(adapter.bundleIDs[0] == null ? {} : { bundleID: adapter.bundleIDs[0] }),
    outDir: options.outDir,
    summaryPath,
  };
}

export function isTerminalAppAdapter(adapter: AppAdapter): adapter is TerminalAppAdapter {
  return adapter.kind === "terminal" && "terminal" in adapter;
}

export function appleScriptString(value: string): string {
  return JSON.stringify(value);
}

function windowMatchesIntent(window: WindowInfo, intent: AppWindowIntent): boolean {
  if (intent.wid != null && window.wid !== intent.wid) return false;
  if (intent.title != null && !intent.title.test(window.name)) return false;
  if (intent.minWidth != null && window.width < intent.minWidth) return false;
  if (intent.minHeight != null && window.height < intent.minHeight) return false;
  if (intent.display != null && !containsWindow(intent.display, window)) return false;
  if (intent.predicate != null && !intent.predicate(window)) return false;
  return true;
}

function containsWindow(
  display: { x: number; y: number; width: number; height: number },
  window: WindowInfo,
): boolean {
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
