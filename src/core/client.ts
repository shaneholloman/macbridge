import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  defaultBin,
  ensureExecutable,
  type Json,
  type RunOptions,
  type RunResult,
  run,
  runJSON,
  type WindowInfo,
} from "../native/macbridge.js";
import { createObservationSummary } from "../observe/summary.js";
import { verifyExpectation } from "../observe/verify.js";
import { parseAction, parseObserveInput } from "../protocol/schema.js";
import type {
  Action,
  ActionResult,
  Artifact,
  CoordMode,
  DisplayInfo,
  DisplaySelector,
  Expectation,
  MacBridgeOptions,
  Observation,
  ObservationSummary,
  ObserveInput,
  PermissionReport,
  Point,
  Rect,
  RedactionOptions,
  Target,
  Verification,
} from "../protocol/types.js";
import type { ControlPlane } from "./control.js";

function stamp(): string {
  return new Date().toISOString().replaceAll(/[-:.]/g, "").replace("T", "T").replace("Z", "Z");
}

function targetLabel(target: Target): string {
  switch (target.kind) {
    case "window":
      return `window-${target.wid}`;
    case "app":
      return `app-${target.bundleID ?? target.name ?? target.pid ?? "target"}`;
    case "display":
      return `display-${target.display}`;
    case "desktop":
      return "desktop";
  }
}

function artifact(path: string, kind: Artifact["kind"]): Artifact {
  try {
    return { path, kind, bytes: statSync(path).size };
  } catch {
    return { path, kind };
  }
}

function screenshotKind(target: Target): Artifact["kind"] {
  switch (target.kind) {
    case "window":
    case "app":
      return "target-screenshot";
    case "display":
      return "display-screenshot";
    case "desktop":
      return "desktop-screenshot";
  }
}

function pushCoord(args: string[], coord?: CoordMode): void {
  if (coord != null) args.push("--coord", coord);
}

function pointArgs(point: Point): string[] {
  return [String(point.x), String(point.y)];
}

function windowTarget(target: Target): string {
  if (target.kind === "window") return String(target.wid);
  if (target.kind === "app") {
    if (target.name != null) return target.name;
    if (target.pid != null) return String(target.pid);
  }
  throw new Error(`target kind ${target.kind} cannot be used as a window target`);
}

function appFilter(target: Target): string[] {
  if (target.kind !== "app") return [];
  if (target.bundleID != null) return ["--bundle-id", target.bundleID];
  if (target.pid != null) return ["--pid", String(target.pid)];
  if (target.name != null) return ["--app", target.name];
  return [];
}

function targetFromWindow(window: WindowInfo): Target {
  return { kind: "window", wid: window.wid };
}

function displayScreenshotTarget(
  input: true | { display?: DisplaySelector },
): Target & { kind: "display" } {
  if (input === true) return { kind: "display", display: "main" };
  return { kind: "display", display: input.display ?? "main" };
}

function summaryOptions(input: ObserveInput["redactedSummary"]): false | RedactionOptions {
  if (input === false) return false;
  if (input === true || input == null) return {};
  return input;
}

function resolveRunOptions(options: MacBridgeOptions): RunOptions {
  return {
    ...(options.bin == null ? {} : { bin: options.bin }),
    ...(options.cwd == null ? {} : { cwd: options.cwd }),
    ...(options.env == null ? {} : { env: options.env }),
  };
}

export class MacBridge implements ControlPlane {
  readonly bin: string;
  private readonly runOptions: RunOptions;

  constructor(options: MacBridgeOptions = {}) {
    this.bin = options.bin ?? defaultBin;
    this.runOptions = resolveRunOptions({ ...options, bin: this.bin });
    ensureExecutable(this.bin);
  }

  run(args: string[]): RunResult {
    return run(args, this.runOptions);
  }

  json<T extends Json>(args: string[]): T {
    return runJSON<T>(args, this.runOptions);
  }

  permissions(options: { prompt?: boolean; require?: boolean } = {}): PermissionReport {
    const args = ["permissions", "check"];
    if (options.require) args.push("--require");
    if (options.prompt) args.push("--prompt");
    return this.json<PermissionReport>(args);
  }

  displays(): DisplayInfo[] {
    return this.json<DisplayInfo[]>(["displays", "list"]);
  }

  display(display: Target & { kind: "display" }): DisplayInfo {
    return this.json<DisplayInfo>(["displays", "info", String(display.display)]);
  }

  windows(target?: Target): WindowInfo[] {
    return this.json<WindowInfo[]>([
      "windows",
      "list",
      ...appFilter(target ?? { kind: "desktop" }),
    ]);
  }

  frame(target: Target): Rect {
    const raw = this.json<Rect>(["windows", "frame", windowTarget(target), "--any-window"]);
    return raw;
  }

  maximize(target: Target, options: { display?: string | number; margin?: number } = {}): Rect {
    const args = ["windows", "maximize", windowTarget(target), "--any-window"];
    if (options.display != null) args.push("--display", String(options.display));
    if (options.margin != null) args.push("--margin", String(options.margin));
    return this.json<Rect>(args);
  }

  activate(target: Target): Json {
    return this.json<Json>(["windows", "activate", windowTarget(target), "--any-window"]);
  }

  setFrame(target: Target, frame: Rect): Rect {
    return this.json<Rect>([
      "windows",
      "set-frame",
      windowTarget(target),
      String(frame.x),
      String(frame.y),
      String(frame.width),
      String(frame.height),
      "--any-window",
    ]);
  }

  capture(target: Target, outPath: string): Artifact {
    switch (target.kind) {
      case "window":
      case "app":
        this.run([
          "capture",
          "window",
          windowTarget(target),
          "--png",
          "-o",
          outPath,
          "--any-window",
        ]);
        break;
      case "display":
        this.run(["capture", "display", String(target.display), "--png", "-o", outPath]);
        break;
      case "desktop":
        this.run(["capture", "desktop", "--png", "-o", outPath]);
        break;
    }
    return artifact(outPath, screenshotKind(target));
  }

  axDump(target: Target, point: Point): Json {
    const args = [
      "background",
      "ax-dump",
      windowTarget(target),
      ...pointArgs(point),
      "--any-window",
    ];
    pushCoord(args, point.coord);
    return this.json<Json>(args);
  }

  async observe(input: ObserveInput): Promise<Observation> {
    const observeInput = parseObserveInput(input);
    const id = `${stamp()}-${targetLabel(observeInput.target).replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;
    const outDir = observeInput.outDir ?? `tmp/observations/${id}`;
    mkdirSync(outDir, { recursive: true });

    const permissions = this.permissions({
      require: observeInput.requirePermissions ?? false,
      prompt: observeInput.promptPermissions ?? false,
    });
    const displays = this.displays();
    const windows = this.windows(
      observeInput.target.kind === "app" ? observeInput.target : undefined,
    );
    const soleWindow = windows[0];
    const target =
      observeInput.target.kind === "app" && windows.length === 1 && soleWindow != null
        ? targetFromWindow(soleWindow)
        : observeInput.target;
    const artifacts: Artifact[] = [];

    let targetScreenshot: Artifact | undefined;
    if (observeInput.targetScreenshot ?? true) {
      targetScreenshot = this.capture(target, join(outDir, "target.png"));
      artifacts.push(targetScreenshot);
    }

    let displayScreenshot: Artifact | undefined;
    if (observeInput.displayScreenshot) {
      displayScreenshot = this.capture(
        displayScreenshotTarget(observeInput.displayScreenshot),
        join(outDir, "display.png"),
      );
      artifacts.push(displayScreenshot);
    }

    let accessibility: Json | undefined;
    if (observeInput.accessibility) {
      const point =
        observeInput.accessibility === true
          ? ({ x: 0.5, y: 0.5, coord: "normalized" } satisfies Point)
          : observeInput.accessibility;
      accessibility = this.axDump(target, point);
      const path = join(outDir, "accessibility.json");
      await Bun.write(path, `${JSON.stringify(accessibility, null, 2)}\n`);
      artifacts.push(artifact(path, "accessibility"));
    }

    const writeSummary = summaryOptions(observeInput.redactedSummary);
    const summaryPath = join(outDir, "summary.redacted.json");
    const summaryArtifact: Artifact = { path: summaryPath, kind: "summary" };
    const summaryArtifacts = writeSummary === false ? [] : [summaryArtifact];
    const observationPath = join(outDir, "observation.json");
    const observationArtifact: Artifact = { path: observationPath, kind: "observation" };
    const observation: Observation = {
      id,
      target,
      capturedAt: new Date().toISOString(),
      permissions,
      displays,
      windows,
      artifacts: [...artifacts, observationArtifact, ...summaryArtifacts],
      ...(targetScreenshot == null ? {} : { targetScreenshot }),
      ...(displayScreenshot == null ? {} : { displayScreenshot }),
      ...(accessibility === undefined ? {} : { accessibility }),
    };

    let summary: ObservationSummary | undefined;
    if (writeSummary !== false) {
      summary = createObservationSummary(observation, writeSummary);
      observation.summary = summary;
      await Bun.write(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    }

    await Bun.write(observationPath, `${JSON.stringify(observation, null, 2)}\n`);
    return observation;
  }

  async act(action: Action): Promise<ActionResult> {
    const parsedAction = parseAction(action);
    const startedAt = new Date();
    const artifacts: Artifact[] = [];
    let stdout: string | undefined;
    let stderr: string | undefined;
    let json: Json | undefined;
    let error: string | undefined;

    try {
      switch (parsedAction.type) {
        case "activate":
          json = this.activate(parsedAction.target);
          break;
        case "click": {
          const args = [
            "background",
            "click",
            windowTarget(parsedAction.target),
            ...pointArgs(parsedAction.point),
            "--any-window",
          ];
          pushCoord(args, parsedAction.point.coord);
          json = this.json<Json>(args);
          break;
        }
        case "type": {
          const args = [
            "background",
            "type",
            windowTarget(parsedAction.target),
            parsedAction.text,
            "--any-window",
          ];
          if (parsedAction.at != null) {
            args.push("--at", ...pointArgs(parsedAction.at));
            pushCoord(args, parsedAction.at.coord);
          }
          if (parsedAction.replace) args.push("--replace");
          json = this.json<Json>(args);
          break;
        }
        case "paste": {
          const args = [
            "background",
            "paste",
            windowTarget(parsedAction.target),
            parsedAction.text,
            "--any-window",
          ];
          if (parsedAction.at != null) {
            args.push("--at", ...pointArgs(parsedAction.at));
            pushCoord(args, parsedAction.at.coord);
          }
          if (parsedAction.activate) args.push("--activate");
          if (parsedAction.submit) args.push("--submit");
          if (parsedAction.preserveClipboard === false) args.push("--keep-clipboard");
          json = this.json<Json>(args);
          break;
        }
        case "press": {
          const args = [
            "background",
            "press",
            windowTarget(parsedAction.target),
            parsedAction.key,
            "--any-window",
          ];
          for (const mod of parsedAction.modifiers ?? []) args.push("--mod", mod);
          json = this.json<Json>(args);
          break;
        }
        case "axAction": {
          const args = [
            "background",
            "ax-action",
            windowTarget(parsedAction.target),
            ...pointArgs(parsedAction.point),
            parsedAction.action,
            "--any-window",
          ];
          pushCoord(args, parsedAction.point.coord);
          json = this.json<Json>(args);
          break;
        }
        case "setFrame":
          json = this.setFrame(parsedAction.target, parsedAction.frame) as unknown as Json;
          break;
        case "maximize": {
          const options: { display?: string | number; margin?: number } = {};
          if (parsedAction.display !== undefined) options.display = parsedAction.display;
          if (parsedAction.margin !== undefined) options.margin = parsedAction.margin;
          json = this.maximize(parsedAction.target, options) as unknown as Json;
          break;
        }
        case "command": {
          const result = this.run(parsedAction.argv);
          stdout = result.stdout;
          stderr = result.stderr;
          break;
        }
      }
      return {
        id: `${stamp()}-action`,
        action: parsedAction,
        status: "pass",
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        artifacts,
        ...(stdout === undefined ? {} : { stdout }),
        ...(stderr === undefined ? {} : { stderr }),
        ...(json === undefined ? {} : { json }),
      };
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      return {
        id: `${stamp()}-action`,
        action: parsedAction,
        status: "fail",
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        artifacts,
        error,
      };
    }
  }

  verify(expectation: Expectation): Verification {
    return verifyExpectation(expectation, { control: this });
  }
}

export function createControlPlane(options: MacBridgeOptions = {}): ControlPlane {
  return new MacBridge(options);
}
