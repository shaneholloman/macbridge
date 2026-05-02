import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type BuildLogger, formatDuration } from "../runtime/log.js";
import type { RuntimeProfile } from "../runtime/profiles.js";

const XCODE_NOISE_PATTERNS: RegExp[] = [
  /IDERunDestination: Supported platforms for the buildables in the current scheme is empty\./,
  /DTDKRemoteDeviceConnection: Failed to start remote service "com\.apple\.mobile\.notification_proxy"/,
  /Error Domain=com\.apple\.dtdevicekit Code=811/,
  /Error Domain=com\.apple\.dt\.MobileDeviceErrorDomain Code=-402653158/,
  /MobileDeviceErrorCode=\(0xE800001A\)/,
  /The device is passcode protected\./,
];
const XCODE_DEVICE_WARNING_END =
  'NSLocalizedDescription=Failed to start remote service "com.apple.mobile.notification_proxy" on device.}';
const DEFAULT_ZIG_BUILD_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const ZIG_BUILD_WATCHDOG_INTERVAL_MS = 30 * 1000;

function readEnvDurationMs(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function checkCommand(cmd: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", cmd], {
      stdout: "ignore",
      stderr: "ignore",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

type PrerequisiteProbeResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

type PrerequisiteProbe = {
  checkCommand: (cmd: string) => Promise<boolean>;
  runCommand: (parts: string[]) => Promise<PrerequisiteProbeResult>;
};

async function runProbeCommand(parts: string[]): Promise<PrerequisiteProbeResult> {
  const proc = Bun.spawn(parts, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stderr, stdout };
}

function detectMissingMetalToolchain(output: string): boolean {
  return (
    output.includes("missing Metal Toolchain") ||
    output.includes("xcodebuild -downloadComponent MetalToolchain")
  );
}

export async function checkPrerequisites(
  log: BuildLogger,
  probe: PrerequisiteProbe = {
    checkCommand,
    runCommand: runProbeCommand,
  },
): Promise<void> {
  const stage = log.start("Checking prerequisites");

  if (!(await probe.checkCommand("zig"))) {
    throw new Error("Zig compiler not found. Install with: brew install zig");
  }
  if (!(await probe.checkCommand("xcodebuild"))) {
    throw new Error("Xcode command line tools not found. Install with: xcode-select --install");
  }
  if (!(await probe.checkCommand("git"))) {
    throw new Error("git not found. Install Xcode command line tools or git.");
  }
  const metalProbe = await probe.runCommand(["xcrun", "metal", "-v"]);
  if (metalProbe.exitCode !== 0) {
    const combinedOutput = `${metalProbe.stdout}${metalProbe.stderr}`.trim();
    if (detectMissingMetalToolchain(combinedOutput)) {
      throw new Error(
        "Metal Toolchain not installed. Install with: xcodebuild -downloadComponent MetalToolchain",
      );
    }
    throw new Error(
      `Metal compiler not available via xcrun. Verify the active Xcode install and command line tools. ${combinedOutput}`,
    );
  }

  stage.ok("All prerequisites satisfied");
}

export async function rebuildAgentBinaries(
  log: BuildLogger,
  root: string,
  target: string,
  options: { debugMaps?: boolean; runtimeProfile?: RuntimeProfile } = {},
): Promise<void> {
  const stage = log.start(`Rebuilding MacBridge binaries for ${target}`);
  const args = ["build/cli.ts", "dist", "--target", target];
  if (options.debugMaps) {
    args.push("--debug-maps");
  }
  const proc = Bun.spawn(["bun", ...args], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Runtime binary rebuild failed with exit code ${exitCode}`);
  }
  stage.ok("MacBridge binaries rebuilt");
}

export function assertTargetBinaries(
  _log: BuildLogger,
  root: string,
  target: string,
  runtimeProfile: RuntimeProfile = "shell",
): void {
  void runtimeProfile;
  const distDir = join(root, "dist/bin");
  const required = [join(distDir, `macbridge-${target}`)];
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length > 0) {
    throw new Error(`Missing required binaries for ${target}: ${missing.join(", ")}`);
  }
}

function filterXcodebuildStderr(
  stderrText: string,
  options: { suppressNoise: boolean },
): { filtered: string; suppressedCount: number } {
  if (!options.suppressNoise || stderrText.length === 0) {
    return { filtered: stderrText, suppressedCount: 0 };
  }

  let suppressedCount = 0;
  let inDeviceWarningBlock = false;
  let deviceWarningBlockLines = 0;
  const outputLines: string[] = [];
  const lines = stderrText.split("\n");

  for (const line of lines) {
    const startsDeviceWarning = line.includes(
      'DTDKRemoteDeviceConnection: Failed to start remote service "com.apple.mobile.notification_proxy"',
    );
    const matchesNoise = XCODE_NOISE_PATTERNS.some((pattern) => pattern.test(line));

    if (startsDeviceWarning) {
      inDeviceWarningBlock = true;
      deviceWarningBlockLines = 0;
    }
    if (inDeviceWarningBlock) {
      deviceWarningBlockLines += 1;
    }

    if (matchesNoise || inDeviceWarningBlock) {
      suppressedCount += 1;
    } else {
      outputLines.push(line);
    }

    if (inDeviceWarningBlock) {
      if (
        line.includes(XCODE_DEVICE_WARNING_END) ||
        line.trim().length === 0 ||
        deviceWarningBlockLines >= 80
      ) {
        inDeviceWarningBlock = false;
        deviceWarningBlockLines = 0;
      }
    }
  }

  return { filtered: outputLines.join("\n"), suppressedCount };
}

async function collectProcessOutput(
  stream: ReadableStream<Uint8Array>,
  options: {
    onActivity: () => void;
    write?: (chunk: string) => void;
  },
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value.length === 0) continue;

    options.onActivity();
    const chunk = decoder.decode(value, { stream: true });
    output += chunk;
    options.write?.(chunk);
  }

  const trailing = decoder.decode();
  if (trailing.length > 0) {
    output += trailing;
    options.write?.(trailing);
  }

  return output;
}

async function runZigBuild(
  log: BuildLogger,
  ghosttyDir: string,
  version: string,
  options: { suppressXcodeNoise: boolean },
): Promise<void> {
  const idleTimeoutMs = readEnvDurationMs(
    "MACBRIDGE_GHOSTTY_ZIG_IDLE_TIMEOUT_MS",
    DEFAULT_ZIG_BUILD_IDLE_TIMEOUT_MS,
  );
  let lastActivityAt = Date.now();
  let timedOut = false;

  const markActivity = (): void => {
    lastActivityAt = Date.now();
  };

  const proc = Bun.spawn(
    [
      "zig",
      "build",
      "-Doptimize=ReleaseFast",
      "-Dcpu=baseline",
      "-Dxcframework-target=native",
      `-Dversion-string=${version}`,
    ],
    {
      cwd: ghosttyDir,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  log.info(
    `Zig build idle watchdog: ${idleTimeoutMs === 0 ? "disabled" : formatDuration(idleTimeoutMs)} without child output`,
  );

  const watchdog =
    idleTimeoutMs > 0
      ? setInterval(
          () => {
            const idleMs = Date.now() - lastActivityAt;
            if (idleMs < idleTimeoutMs || timedOut) return;

            timedOut = true;
            log.warn(
              `Zig build produced no output for ${formatDuration(idleMs)}; terminating stalled child process`,
            );
            log.warn(
              "If this stopped during package fetch, remove the partial Zig temp cache under ~/.cache/zig/tmp and rerun the release",
            );
            proc.kill();
          },
          Math.min(ZIG_BUILD_WATCHDOG_INTERVAL_MS, idleTimeoutMs),
        )
      : null;

  const stdoutTask = collectProcessOutput(proc.stdout, {
    onActivity: markActivity,
    write: (chunk) => process.stdout.write(chunk),
  });
  const stderrTask = collectProcessOutput(proc.stderr, {
    onActivity: markActivity,
    ...(options.suppressXcodeNoise
      ? {}
      : {
          write: (chunk: string) => {
            process.stderr.write(chunk);
          },
        }),
  });
  const exitCode = await proc.exited;
  if (watchdog) clearInterval(watchdog);

  await stdoutTask;
  const stderrText = await stderrTask;
  if (options.suppressXcodeNoise) {
    const { filtered, suppressedCount } = filterXcodebuildStderr(stderrText, {
      suppressNoise: options.suppressXcodeNoise,
    });
    if (filtered.trim().length > 0) {
      process.stderr.write(`${filtered.trimEnd()}\n`);
    }
    if (suppressedCount > 0) {
      log.info(
        `Suppressed ${suppressedCount} non-actionable xcodebuild line(s). Use --verbose-xcodebuild to show all logs.`,
      );
    }
  }
  if (timedOut) {
    throw new Error(
      `zig build stalled after ${formatDuration(idleTimeoutMs)} without output; package fetch or compiler child likely hung`,
    );
  }
  if (exitCode !== 0) {
    throw new Error(`zig build failed with exit code ${exitCode}`);
  }
}

function clearLocalZigCache(log: BuildLogger, ghosttyDir: string): void {
  const localZigCache = join(ghosttyDir, ".zig-cache");
  if (!existsSync(localZigCache)) return;

  rmSync(localZigCache, { recursive: true, force: true });
  log.info("Cleared Zig cache: .zig-cache");
}

function clearExistingXcframework(log: BuildLogger, ghosttyDir: string): void {
  const xcframeworkPath = join(ghosttyDir, "macos/MacBridgeKit.xcframework");
  if (!existsSync(xcframeworkPath)) return;

  rmSync(xcframeworkPath, { recursive: true, force: true });
  log.info("Cleared stale xcframework: macos/MacBridgeKit.xcframework");
}

function clearReleaseLocalApp(log: BuildLogger, ghosttyDir: string, appName: string): void {
  const releaseLocalApp = join(ghosttyDir, `macos/build/ReleaseLocal/${appName}.app`);
  if (!existsSync(releaseLocalApp)) return;

  try {
    rmSync(releaseLocalApp, { recursive: true, force: true });
    log.info(`Cleared stale ReleaseLocal app bundle: macos/build/ReleaseLocal/${appName}.app`);
  } catch (error) {
    throw new Error(
      `Failed to clear stale ReleaseLocal app bundle at ${releaseLocalApp}. Remove it and rerun the build. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function buildTerminal(
  log: BuildLogger,
  ghosttyDir: string,
  version: string,
  appName: string,
  options: { verboseXcodebuild: boolean },
): Promise<string> {
  const stage = log.start("Building terminal (this may take several minutes)");

  const derivedData = join(process.env.HOME ?? "~", "Library/Developer/Xcode/DerivedData");
  if (existsSync(derivedData)) {
    for (const entry of readdirSync(derivedData)) {
      if (
        entry.startsWith("MacBridge-") ||
        entry.startsWith("MacBridgeShell-") ||
        entry.startsWith("Ghostty-")
      ) {
        rmSync(join(derivedData, entry), { recursive: true });
        log.info(`Cleared Xcode cache: ${entry}`);
      }
    }
  }

  clearLocalZigCache(log, ghosttyDir);
  clearExistingXcframework(log, ghosttyDir);
  clearReleaseLocalApp(log, ghosttyDir, appName);
  await runZigBuild(log, ghosttyDir, version, { suppressXcodeNoise: !options.verboseXcodebuild });

  const possiblePaths = [
    join(ghosttyDir, `zig-out/${appName}.app`),
    join(ghosttyDir, `zig-out/bin/${appName}.app`),
    join(ghosttyDir, `macos/build/ReleaseLocal/${appName}.app`),
    join(ghosttyDir, `macos/build/Release/${appName}.app`),
    join(ghosttyDir, "zig-out/Ghostty.app"),
    join(ghosttyDir, "zig-out/bin/Ghostty.app"),
    join(ghosttyDir, "macos/build/Release/Ghostty.app"),
  ];
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      stage.ok(`Built at ${path}`);
      return path;
    }
  }

  throw new Error("Built app not found");
}

export function findExistingBuiltApp(ghosttyDir: string, appName: string): string | null {
  const possiblePaths = [
    join(ghosttyDir, `zig-out/${appName}.app`),
    join(ghosttyDir, `zig-out/bin/${appName}.app`),
    join(ghosttyDir, `macos/build/ReleaseLocal/${appName}.app`),
    join(ghosttyDir, "zig-out/Ghostty.app"),
    join(ghosttyDir, "zig-out/bin/Ghostty.app"),
  ];
  return possiblePaths.find((path) => existsSync(path)) ?? null;
}
