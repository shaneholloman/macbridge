import {
  type Action,
  type ActionResult,
  type ControlPlane,
  createControlPlane,
  FrameRecorder,
  fixturePlanner,
  type Json,
  type PlannedAction,
  Session,
  type Target,
  type WindowInfo,
} from "../../src/index.ts";
import type { Soak } from "./context.ts";
import { fileSize } from "./fs.ts";

type DisplayInfo = {
  index: number;
  displayID: number;
  screenNumber: number;
  name: string;
  visibleX: number;
  visibleY: number;
  visibleWidth: number;
  visibleHeight: number;
  width: number;
  height: number;
  main: boolean;
};

type AppInfo = {
  pid: number;
  name: string;
  bundleID?: string;
  running: boolean;
};

type PermissionReport = {
  ok: boolean;
  prompted: boolean;
  permissions: Array<{
    id: string;
    name: string;
    granted: boolean;
    requiredFor: string[];
  }>;
};

const heliumBundleID = "net.imput.helium";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function collectStrings(value: Json, strings: string[] = []): string[] {
  if (typeof value === "string") {
    strings.push(value);
    return strings;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, strings);
    return strings;
  }

  if (value != null && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, strings);
  }

  return strings;
}

async function assertImage(path: string): Promise<{ path: string; bytes: number }> {
  const size = await fileSize(path);
  assert(size > 0, `missing or empty image: ${path}`);
  return { path, bytes: size };
}

function assertAction(result: ActionResult): Json {
  assert(result.status === "pass", result.error ?? "action failed");
  return result.json ?? { status: result.status };
}

async function waitForWindow(ctx: Soak, owner: string, attempts = 25): Promise<WindowInfo> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const windows = ctx.json<WindowInfo[]>(["windows", "list", "--app", owner]);
    const candidate = windows.find((window) => window.width > 200 && window.height > 120);
    if (candidate != null) return candidate;
    await Bun.sleep(200);
  }
  throw new Error(`no usable ${owner} window appeared`);
}

async function waitForHelium(
  control: ControlPlane,
  predicate: (window: WindowInfo) => boolean = () => true,
  attempts = 30,
): Promise<WindowInfo> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const windows = control.windows({ kind: "app", bundleID: heliumBundleID });
    const candidate = windows.find(
      (window) => window.width > 400 && window.height > 300 && predicate(window),
    );
    if (candidate != null) return candidate;
    await Bun.sleep(300);
  }
  throw new Error("no matching Helium window appeared");
}

async function tryWaitForHelium(
  control: ControlPlane,
  predicate: (window: WindowInfo) => boolean,
  attempts = 8,
): Promise<WindowInfo | undefined> {
  try {
    return await waitForHelium(control, predicate, attempts);
  } catch {
    return undefined;
  }
}

async function openFocusedResult(
  run: (name: string, action: Action) => Promise<ActionResult>,
  target: { kind: "window"; wid: number },
): Promise<Json[]> {
  const actions: Action[] = [
    { type: "press", target, key: "Escape" },
    { type: "press", target, key: "Tab" },
    { type: "press", target, key: "Enter" },
    { type: "press", target, key: "Tab" },
    { type: "press", target, key: "Tab" },
    { type: "press", target, key: "Tab", modifiers: ["shift"] },
    { type: "press", target, key: "Tab", modifiers: ["shift"] },
    { type: "press", target, key: "Enter" },
  ];

  const results: Json[] = [];
  for (const [index, action] of actions.entries()) {
    results.push(assertAction(await run(`keyboard-open-${index + 1}`, action)));
  }
  return results;
}

async function runPlannedAction(
  ctx: Soak,
  session: Session,
  name: string,
  plan: PlannedAction,
): Promise<ActionResult> {
  const observeTarget =
    plan.action.type === "command" ? { kind: "desktop" as const } : plan.action.target;
  const record = await session.runOnce({
    observe: {
      target: observeTarget,
      outDir: ctx.path(`agent-${name}-observe`),
      targetScreenshot: false,
      displayScreenshot: false,
      redactedSummary: false,
    },
    planner: fixturePlanner(plan),
  });
  await Bun.write(ctx.path(`agent-${name}.json`), `${JSON.stringify(record, null, 2)}\n`);
  assert(record.action.status === "pass", record.action.error ?? `${name} action failed`);
  if (record.verification != null) {
    assert(
      record.verification.status === "pass",
      record.verification.error ?? `${name} verification failed`,
    );
  }
  return record.action;
}

export function cleanupTextEdit(ctx: Soak): void {
  try {
    ctx.system([
      "osascript",
      "-e",
      'if application "TextEdit" is running then',
      "-e",
      'tell application "TextEdit" to quit saving no',
      "-e",
      "end if",
    ]);
  } catch (error) {
    ctx.logger.warn({ error }, "textedit cleanup failed");
  }
}

export function cleanupHelium(ctx: Soak): void {
  try {
    ctx.system([
      "osascript",
      "-e",
      'if application "Helium" is running then',
      "-e",
      'tell application "Helium" to quit',
      "-e",
      "end if",
    ]);
  } catch (error) {
    ctx.logger.warn({ error }, "helium cleanup failed");
  }
}

export async function basicDiscovery(ctx: Soak): Promise<void> {
  await ctx.step("apps discovered", () => {
    const apps = ctx.json<AppInfo[]>(["list-apps"]);
    assert(apps.length > 0, "list-apps returned no apps");
    return { count: apps.length };
  });

  await ctx.step("display aliases agree", () => {
    const legacy = ctx.json<DisplayInfo[]>(["list-displays"]);
    const canonical = ctx.json<DisplayInfo[]>(["displays", "list"]);
    assert(legacy.length > 0, "list-displays returned no displays");
    assert(legacy.length === canonical.length, "display aliases returned different counts");
    return { count: legacy.length };
  });

  await ctx.step("main display resolved", () => {
    const main = ctx.json<DisplayInfo>(["displays", "info", "main"]);
    assert(main.main, "displays info main did not return main display");
    return { displayID: main.displayID, name: main.name };
  });
}

export async function permissionPreflight(ctx: Soak): Promise<void> {
  await ctx.step("permissions required", () => {
    const args = ["permissions", "check", "--require"];
    if (ctx.options.regime !== "smoke") args.push("--prompt");
    const report = ctx.json<PermissionReport>(args);
    assert(report.ok, "permissions check reported not ok");
    const missing = report.permissions.filter((permission) => !permission.granted);
    assert(
      missing.length === 0,
      `missing permissions: ${missing.map((item) => item.name).join(", ")}`,
    );
    return {
      prompted: report.prompted,
      permissions: report.permissions.map((permission) => ({
        id: permission.id,
        granted: permission.granted,
      })),
    };
  });
}

export async function captureDisplays(ctx: Soak): Promise<void> {
  await ctx.step("capture display main", async () => {
    const path = ctx.path("display-main.png");
    ctx.run(["capture", "display", "main", "--png", "-o", path]);
    return assertImage(path);
  });

  await ctx.step("capture desktop", async () => {
    const path = ctx.path("desktop-main.png");
    ctx.run(["capture", "desktop", "--png", "-o", path]);
    return assertImage(path);
  });

  await ctx.step("foreground display screenshot", async () => {
    const path = ctx.path("foreground-display-main.png");
    ctx.run(["foreground-display", "main", "screenshot", "--png", "-o", path]);
    return assertImage(path);
  });
}

export async function captureActiveWindow(ctx: Soak): Promise<void> {
  await ctx.step("windows listed", () => {
    const windows = ctx.json<WindowInfo[]>(["windows", "list"]);
    return { count: windows.length };
  });

  await ctx.step("capture active window", async () => {
    let active: WindowInfo | undefined;
    try {
      active = ctx.json<WindowInfo>(["active-window"]);
    } catch {
      const windows = ctx.json<WindowInfo[]>(["windows", "list"]);
      active = windows.find((window) => window.width > 200 && window.height > 120);
    }
    assert(active != null, "no active or fallback window available");
    assert(active.wid > 0, "active-window returned invalid wid");
    const path = ctx.path("active-window.png");
    ctx.run(["capture", "window", String(active.wid), "--png", "-o", path]);
    return { ...(await assertImage(path)), wid: active.wid, owner: active.owner };
  });
}

export async function serviceWorkflow(ctx: Soak): Promise<void> {
  await ctx.step("service start", () => {
    ctx.run(["service", "start"]);
    return undefined;
  });

  await ctx.step("service ping", () => ctx.json<Json>(["service", "ping"]));

  await ctx.step("service status", () => ctx.json<Json>(["service", "status"]));

  await ctx.step("service send displays list", () => {
    const result = ctx.run(["service", "send", "displays", "list"]);
    assert(result.stdout.length > 0, "service send displays list returned no stdout");
    return { bytes: result.stdout.length };
  });
}

export async function cursorWorkflow(ctx: Soak): Promise<void> {
  await ctx.step("cursor display start", () => {
    ctx.run(["cursor", "start", "display", "main", "60", "60", "--duration", "0.0", "--wait"]);
    return ctx.json<Json>(["cursor", "status"]);
  });

  await ctx.step("cursor display move", () => {
    ctx.run(["cursor", "move", "120", "120", "--duration", "0.05", "--wait"]);
    return undefined;
  });

  await ctx.step("cursor display stop", () => {
    ctx.run(["cursor", "hide"]);
    ctx.run(["cursor", "stop"]);
    return undefined;
  });
}

export async function liveTextEditWorkflow(ctx: Soak): Promise<void> {
  const fixture = ctx.path("textedit-fixture.txt");

  await ctx.step("textedit cleanup before", async () => {
    cleanupTextEdit(ctx);
    await Bun.sleep(500);
    return undefined;
  });

  await ctx.step("textedit open fixture", async () => {
    await Bun.write(fixture, "MacBridge soak fixture\n");
    ctx.system(["open", "-a", "TextEdit", fixture]);
    const window = await waitForWindow(ctx, "TextEdit");
    return { wid: window.wid, width: window.width, height: window.height };
  });

  const window = await waitForWindow(ctx, "TextEdit");

  await ctx.step("textedit capture before", async () => {
    const path = ctx.path("textedit-before.png");
    ctx.run(["capture", "window", String(window.wid), "--png", "-o", path]);
    return assertImage(path);
  });

  const marker = `MacBridge live soak ${new Date().toISOString()}`;
  await ctx.step("textedit ax type", () => {
    ctx.run(["act", "window", String(window.wid), "click", "80", "80"]);
    return ctx.json<Json>(["background", "type", String(window.wid), marker, "--at", "80", "80"]);
  });

  await ctx.step("textedit ax verify", async () => {
    const dump = ctx.json<Json>([
      "background",
      "ax-dump",
      String(window.wid),
      "80",
      "80",
      "--coord",
      "pixel",
    ]);
    const observed = collectStrings(dump).find((value) => value.includes(marker));
    assert(observed != null, "typed marker was not found in TextEdit AX dump");
    await Bun.write(ctx.path("textedit-ax-value.txt"), observed);
    return { bytes: observed.length, marker };
  });

  await ctx.step("textedit capture after", async () => {
    const path = ctx.path("textedit-after.png");
    ctx.run(["capture", "window", String(window.wid), "--png", "-o", path]);
    return assertImage(path);
  });

  await ctx.step("textedit cleanup after", async () => {
    cleanupTextEdit(ctx);
    await Bun.sleep(500);
    const windows = ctx.json<WindowInfo[]>(["windows", "list", "--app", "TextEdit"]);
    assert(windows.length === 0, "TextEdit window remained after cleanup");
    return { windows: windows.length };
  });
}

export async function liveHeliumWorkflow(ctx: Soak): Promise<void> {
  const control = createControlPlane();
  const session = new Session({ control, outDir: ctx.path("agent-session") });
  let recorder: FrameRecorder | undefined;
  let recordingStarted = false;
  const startRecorder = async (target: Target, label: string): Promise<Json | undefined> => {
    if (!ctx.options.recordVideo || recorder != null) return undefined;
    recorder = new FrameRecorder({
      control,
      target,
      outDir: ctx.path("helium-recording"),
      fps: ctx.options.recordFps,
      videoPath: ctx.path("helium-session.mp4"),
    });
    await recorder.start();
    recordingStarted = true;
    return recordFrame(label);
  };
  const recordFrame = async (label: string): Promise<Json | undefined> => {
    if (recorder == null) return undefined;
    const frame = await recorder.frame(label);
    return {
      path: frame.artifact.path,
      ...(frame.artifact.bytes == null ? {} : { bytes: frame.artifact.bytes }),
    };
  };
  const run = (name: string, action: Action, expect?: PlannedAction["expect"]) =>
    runPlannedAction(ctx, session, name, {
      action,
      reason: `helium ${name}`,
      ...(expect == null ? {} : { expect }),
    });
  let window: WindowInfo | undefined;

  try {
    if (ctx.options.recordVideo && ctx.options.recordTarget !== "window") {
      await ctx.step("helium recording start", async () => {
        const target =
          ctx.options.recordTarget === "desktop"
            ? { kind: "desktop" as const }
            : { kind: "display" as const, display: ctx.options.recordDisplay };
        return startRecorder(target, "start");
      });
    }

    await ctx.step("helium cleanup before", async () => {
      cleanupHelium(ctx);
      await Bun.sleep(800);
      return recordFrame("cleanup-before");
    });

    await ctx.step("helium cold start", async () => {
      ctx.system(["open", "-a", "Helium"]);
      window = await waitForHelium(control);
      const recordingFrame =
        ctx.options.recordTarget === "window"
          ? await startRecorder({ kind: "window", wid: window.wid }, "cold-start")
          : await recordFrame("cold-start");
      return {
        wid: window.wid,
        width: window.width,
        height: window.height,
        title: window.name,
        ...(recordingFrame == null ? {} : { recordingFrame }),
      };
    });

    await ctx.step("helium maximize", async () => {
      assert(window != null, "Helium window was not opened");
      const target = { kind: "window", wid: window.wid } as const;
      let frame: Json;
      try {
        frame = assertAction(await run("maximize", { type: "maximize", target, display: "main" }));
      } catch (error) {
        assert(
          window.width >= 900 && window.height >= 600,
          error instanceof Error ? error.message : "helium maximize failed",
        );
        frame = { x: window.x, y: window.y, width: window.width, height: window.height };
      }
      window = await waitForHelium(
        control,
        (candidate) =>
          candidate.wid === window?.wid && candidate.width >= 900 && candidate.height >= 600,
      );
      const recordingFrame = await recordFrame("maximize");
      return {
        frame,
        wid: window.wid,
        width: window.width,
        height: window.height,
        ...(recordingFrame == null ? {} : { recordingFrame }),
      };
    });

    await ctx.step("helium activate", async () => {
      assert(window != null, "Helium window was not opened");
      const target = { kind: "window", wid: window.wid } as const;
      const activated = assertAction(await run("activate", { type: "activate", target }));
      const recordingFrame = await recordFrame("activate");
      return { wid: window.wid, activated, ...(recordingFrame == null ? {} : { recordingFrame }) };
    });

    await ctx.step("helium capture start", async () => {
      assert(window != null, "Helium window was not opened");
      const path = ctx.path("helium-start.png");
      control.capture({ kind: "window", wid: window.wid }, path);
      const image = await assertImage(path);
      const recordingFrame = await recordFrame("capture-start");
      return { ...image, ...(recordingFrame == null ? {} : { recordingFrame }) };
    });

    await ctx.step("helium navigate google", async () => {
      assert(window != null, "Helium window was not opened");
      const target = { kind: "window", wid: window.wid } as const;
      assertAction(
        await run("navigate-focus-location", {
          type: "press",
          target,
          key: "l",
          modifiers: ["command"],
        }),
      );
      assertAction(
        await run("navigate-type-google", {
          type: "type",
          target,
          text: "https://www.google.com",
          replace: true,
        }),
      );
      assertAction(await run("navigate-submit", { type: "press", target, key: "Enter" }));
      window = await waitForHelium(control, (candidate) => /google/i.test(candidate.name));
      const path = ctx.path("helium-google.png");
      control.capture({ kind: "window", wid: window.wid }, path);
      const recordingFrame = await recordFrame("google");
      return {
        ...(await assertImage(path)),
        title: window.name,
        ...(recordingFrame == null ? {} : { recordingFrame }),
      };
    });

    await ctx.step("helium google search", async () => {
      assert(window != null, "Helium window was not opened");
      const target = { kind: "window", wid: window.wid } as const;
      assertAction(
        await run("search-focus-location", {
          type: "press",
          target,
          key: "l",
          modifiers: ["command"],
        }),
      );
      assertAction(
        await run("search-type-query", {
          type: "type",
          target,
          text: "https://www.google.com/search?q=example+domain",
          replace: true,
        }),
      );
      assertAction(await run("search-submit", { type: "press", target, key: "Enter" }));
      window = await waitForHelium(control, (candidate) =>
        /example domain.*google search/i.test(candidate.name),
      );
      const path = ctx.path("helium-results.png");
      control.capture({ kind: "window", wid: window.wid }, path);
      const recordingFrame = await recordFrame("results");
      return {
        ...(await assertImage(path)),
        title: window.name,
        ...(recordingFrame == null ? {} : { recordingFrame }),
      };
    });

    await ctx.step("helium click first result", async () => {
      assert(window != null, "Helium window was not opened");
      const wid = window.wid;
      const target = { kind: "window", wid } as const;
      const activated = assertAction(await run("result-activate", { type: "activate", target }));
      const axAction = assertAction(
        await run("result-ax-press", {
          type: "axAction",
          target,
          point: { x: 0.16, y: 0.32, coord: "normalized" },
          action: "AXPress",
        }),
      );
      window = await tryWaitForHelium(control, (candidate) =>
        /^Example Domain$/i.test(candidate.name),
      );
      let click: Json | undefined;
      let keyboard: Json[] | undefined;
      if (window == null) {
        click = assertAction(
          await run("result-click", {
            type: "click",
            target,
            point: { x: 0.16, y: 0.32, coord: "normalized" },
          }),
        );
        window = await tryWaitForHelium(control, (candidate) =>
          /^Example Domain$/i.test(candidate.name),
        );
      }
      if (window == null) {
        keyboard = await openFocusedResult(run, target);
        window = await waitForHelium(control, (candidate) =>
          /^Example Domain$/i.test(candidate.name),
        );
      }
      const path = ctx.path("helium-result-clicked.png");
      control.capture({ kind: "window", wid: window.wid }, path);
      const recordingFrame = await recordFrame("result-clicked");
      return {
        ...(await assertImage(path)),
        title: window.name,
        activated,
        axAction,
        ...(recordingFrame == null ? {} : { recordingFrame }),
        ...(click == null ? {} : { click }),
        ...(keyboard == null ? {} : { keyboard }),
      };
    });

    await ctx.step("helium cleanup after", async () => {
      const recordingFrame =
        ctx.options.recordTarget === "window" ? await recordFrame("cleanup-after") : undefined;
      cleanupHelium(ctx);
      await Bun.sleep(800);
      const postCleanupFrame =
        ctx.options.recordTarget === "window" ? undefined : await recordFrame("cleanup-after");
      return recordingFrame ?? postCleanupFrame;
    });
  } finally {
    const activeRecorder = recorder;
    if (activeRecorder != null && recordingStarted) {
      await ctx.step("helium recording stop", async () => {
        if (ctx.options.recordTarget !== "window") {
          await recordFrame("stop");
        }
        const recording = await activeRecorder.stop();
        await Bun.write(
          ctx.path("helium-recording.json"),
          `${JSON.stringify(recording, null, 2)}\n`,
        );
        return {
          frames: recording.frames.length,
          ...(recording.video == null ? {} : { video: recording.video }),
          ...(recording.probe == null ? {} : { probe: recording.probe }),
          manifest: ctx.path("helium-recording.json"),
        };
      });
    }
  }
}

export async function stopServices(ctx: Soak): Promise<void> {
  await ctx.step("service stop", () => {
    ctx.run(["service", "stop"]);
    return undefined;
  });

  await ctx.step("cursor stop", () => {
    ctx.run(["cursor", "stop"]);
    return undefined;
  });
}
