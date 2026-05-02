import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createControlPlane } from "../../core/client.js";
import type { ControlPlane } from "../../core/control.js";
import { createLogger } from "../../core/log.js";
import { sleep, type WindowInfo } from "../../native/macbridge.js";

const outlookBundleID = "com.microsoft.Outlook";
const outlookName = "Microsoft Outlook";

export type OutlookObserveOptions = {
  launch: boolean;
  prompt: boolean;
  outDir: string;
};

export type OutlookObserveOutput = {
  app: string;
  bundleID: string;
  outDir: string;
  summaryPath: string;
};

const axProbePoints = [
  { name: "toolbar", x: 0.5, y: 0.08, coord: "normalized" as const },
  { name: "left-rail", x: 0.05, y: 0.35, coord: "normalized" as const },
  { name: "message-list", x: 0.28, y: 0.35, coord: "normalized" as const },
  { name: "reading-pane", x: 0.65, y: 0.35, coord: "normalized" as const },
  { name: "center", x: 0.5, y: 0.5, coord: "normalized" as const },
];

export function outlookObserveUsage(): string {
  return [
    "usage:",
    "  macbridge observe outlook [--launch] [--prompt] [--out DIR]",
    "",
    "Read-only Outlook discovery:",
    "  - optionally launches Microsoft Outlook",
    "  - maximizes the first Outlook window to the main display",
    "  - captures window and display screenshots, window/display state, permission state, and AX center context",
    "  - writes artifacts under tmp/observations by default",
  ].join("\n");
}

export function parseOutlookObserveArgs(args: string[]): OutlookObserveOptions {
  const options: OutlookObserveOptions = {
    launch: false,
    prompt: false,
    outDir: `tmp/observations/outlook-${stamp()}`,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--launch":
        options.launch = true;
        break;
      case "--prompt":
        options.prompt = true;
        break;
      case "--out": {
        const value = args[index + 1];
        if (value == null) throw new Error("--out needs a directory");
        options.outDir = value;
        index += 1;
        break;
      }
      case "-h":
      case "--help":
        throw new Error(outlookObserveUsage());
      default:
        throw new Error(`unknown option: ${arg}\n${outlookObserveUsage()}`);
    }
  }
  return options;
}

export async function runOutlookObserve(
  options: OutlookObserveOptions,
  control: ControlPlane = createControlPlane(),
): Promise<OutlookObserveOutput> {
  const log = createLogger("outlook-observe");
  mkdirSync(options.outDir, { recursive: true });

  control.permissions({ require: true, prompt: options.prompt });

  let window = await waitForOutlookWindow(control, 1);
  if (window == null && options.launch) {
    log.info("launching Outlook");
    openOutlook();
    window = await waitForOutlookWindow(control);
  }
  if (window == null) {
    throw new Error("no Outlook window found; rerun with --launch or open Outlook manually");
  }

  const target = { kind: "window", wid: window.wid } as const;
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
        app: outlookName,
        bundleID: outlookBundleID,
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
  return { app: outlookName, bundleID: outlookBundleID, outDir: options.outDir, summaryPath };
}

function stamp(): string {
  return new Date().toISOString().replaceAll(/[-:.]/g, "").replace("T", "T").replace("Z", "Z");
}

function openOutlook(): void {
  const byBundle = Bun.spawnSync({
    cmd: ["open", "-b", outlookBundleID],
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (byBundle.exitCode === 0) return;

  const byName = Bun.spawnSync({
    cmd: ["open", "-a", outlookName],
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (byName.exitCode !== 0) {
    throw new Error(
      byName.stderr.toString().trimEnd() ||
        byBundle.stderr.toString().trimEnd() ||
        "failed to launch Microsoft Outlook",
    );
  }
}

async function waitForOutlookWindow(
  control: ControlPlane,
  attempts = 30,
): Promise<WindowInfo | undefined> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const windows = control.windows({ kind: "app", bundleID: outlookBundleID });
    const candidate = windows.find((window) => window.width > 400 && window.height > 300);
    if (candidate != null) return candidate;
    await sleep(500);
  }
  return undefined;
}
