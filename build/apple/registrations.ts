import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createBuildLog } from "../runtime/log.ts";
import { removePath, run } from "../runtime/runner.ts";
import { LEGACY_MACBRIDGE_BUNDLE_IDS, MACBRIDGE_BUNDLE_ID } from "./identity.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const LSREGISTER =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

const TCC_SERVICES = ["Accessibility", "ScreenCapture"] as const;
const USER_TCC_DB = join(process.env.HOME ?? "", "Library/Application Support/com.apple.TCC/TCC.db");
const SYSTEM_TCC_DB = "/Library/Application Support/com.apple.TCC/TCC.db";

const STALE_LAUNCH_SERVICES_PATHS = [
  "/Applications/MacBridge.app",
  join(ROOT, "dist/app/darwin-arm64/MacBridge.app"),
  join(ROOT, "dist/app/darwin-x64/MacBridge.app"),
  join(ROOT, "dist/darwin-arm64/MacBridge.app"),
  join(ROOT, "dist/darwin-x64/MacBridge.app"),
  join(ROOT, "dist/pkg/darwin-arm64/payload/Applications/MacBridge.app"),
  join(ROOT, "dist/pkg/darwin-x64/payload/Applications/MacBridge.app"),
  join(ROOT, "tmp/package-consumer/node_modules/macbridge/dist/app/darwin-arm64/MacBridge.app"),
  join(ROOT, "tmp/package-consumer/node_modules/macbridge/dist/app/darwin-x64/MacBridge.app"),
  join(ROOT, "tmp/ghostty/macos/build/ReleaseLocal/MacBridge.app"),
  join(
    ROOT,
    "tmp/ghostty/macos/build/ReleaseLocal/MacBridge.app/Contents/Frameworks/Sparkle.framework/Versions/B/Updater.app",
  ),
  join(ROOT, "tmp/ghostty/macos/build/ReleaseLocal/MacBridgeShell.app"),
  join(
    ROOT,
    "tmp/ghostty/macos/build/ReleaseLocal/MacBridgeShell.app/Contents/Frameworks/Sparkle.framework/Versions/B/Updater.app",
  ),
  join(ROOT, "tmp/pkg-copy-test-90421/Applications/MacBridge.app"),
  join(ROOT, "tmp/pkg-full/component.pkg/Payload/Applications/MacBridge.app"),
  "/Applications/MacBridge.localized/MacBridge.app",
  "/Applications/MacBridge.app/Contents/Frameworks/Sparkle.framework/Versions/B/Updater.app",
  "/Applications/MacBridge.localized/MacBridge.app/Contents/Frameworks/Sparkle.framework/Versions/B/Updater.app",
  `${process.env.HOME ?? ""}/.Trash/MacBridge.app`,
  `${process.env.HOME ?? ""}/.Trash/darwin-arm64/MacBridge.app`,
].filter((path) => path.length > 0);

const INSTALLED_MACBRIDGE_PATHS = [
  "/Applications/MacBridge.app",
  "/Applications/MacBridge.localized",
  `${process.env.HOME ?? ""}/.Trash/MacBridge.app`,
  `${process.env.HOME ?? ""}/.Trash/darwin-arm64`,
  join(ROOT, "dist/pkg/darwin-arm64/payload/Applications/MacBridge.app"),
  join(ROOT, "dist/pkg/darwin-x64/payload/Applications/MacBridge.app"),
  join(ROOT, "tmp/ghostty/macos/build/ReleaseLocal/MacBridge.app"),
  join(ROOT, "tmp/ghostty/macos/build/ReleaseLocal/MacBridgeShell.app"),
].filter((path) => path.length > 0);

export type RegistrationCleanupOptions = {
  dryRun?: boolean;
  includeCurrent?: boolean;
  removeInstalledApps?: boolean;
};

export async function terminateMacBridgeProcesses(
  options: RegistrationCleanupOptions = {},
): Promise<void> {
  const log = createBuildLog("process-cleanup");
  const patterns = [
    "/MacBridge.app/Contents/MacOS/macbridge",
    "/MacBridge.app/Contents/MacOS/macbridge-launch",
    "/MacBridge.app/Contents/MacOS/macbridge-runtime",
    "/MacBridge.app/Contents/MacOS/macbridge-shell",
    "/MacBridge.app/Contents/MacOS/macbridge-cli",
  ];

  for (const pattern of patterns) {
    if (options.dryRun === true) {
      log.info({ cmd: `pkill -f ${pattern}` }, "dry run");
      continue;
    }

    await run(log, ["pkill", "-f", pattern], { allowFailure: true });
  }
}

export async function resetMacBridgeTcc(options: RegistrationCleanupOptions = {}): Promise<void> {
  const log = createBuildLog("tcc-reset");
  const canUseSudo =
    options.dryRun === true ? false : await canUseSudoNonInteractive(log);
  const bundleIds = [
    ...(options.includeCurrent === false ? [] : [MACBRIDGE_BUNDLE_ID]),
    ...LEGACY_MACBRIDGE_BUNDLE_IDS,
    ...(options.dryRun === true ? [] : await discoverMacBridgeTccClients(log)),
  ];

  for (const bundleId of new Set(bundleIds)) {
    for (const service of TCC_SERVICES) {
      if (options.dryRun === true) {
        log.info({ cmd: `tccutil reset ${service} ${bundleId}` }, "dry run");
        continue;
      }

      const result = await run(log, ["tccutil", "reset", service, bundleId], {
        allowFailure: true,
      });
      if (result.status !== 0 && LEGACY_MACBRIDGE_BUNDLE_IDS.includes(bundleId as never)) {
        await resetResolvableLegacyTccClient(log, service, bundleId, canUseSudo);
      } else if (result.status !== 0 && bundleId.toLowerCase().includes("macbridge")) {
        await resetResolvableLegacyTccClient(log, service, bundleId, canUseSudo);
      }
    }
  }

  if (options.dryRun !== true) {
    await deleteMacBridgeTccRows(log, canUseSudo);
    await verifyNoMacBridgeTccRows(log);
  }
}

async function canUseSudoNonInteractive(log: ReturnType<typeof createBuildLog>): Promise<boolean> {
  const result = await run(log, ["sudo", "-n", "true"], { allowFailure: true });
  if (result.status !== 0) {
    log.info("sudo is unavailable non-interactively; privileged TCC cleanup will be skipped");
    return false;
  }

  return true;
}

async function resetResolvableLegacyTccClient(
  log: ReturnType<typeof createBuildLog>,
  service: (typeof TCC_SERVICES)[number],
  bundleId: string,
  canUseSudo: boolean,
): Promise<void> {
  if (!canUseSudo) {
    return;
  }

  const localAppPath = join(
    ROOT,
    "tmp",
    "tcc-reset",
    `${bundleId.replaceAll(".", "-")}.app`,
  );
  const appPath = `/Applications/MacBridge TCC Reset ${bundleId.replaceAll(".", "-")}.app`;
  const contents = join(localAppPath, "Contents");
  const macos = join(contents, "MacOS");
  const executable = join(macos, "noop");

  rmSync(localAppPath, { force: true, recursive: true });
  mkdirSync(macos, { recursive: true });
  writeFileSync(
    join(contents, "Info.plist"),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      "<dict>",
      "  <key>CFBundleExecutable</key>",
      "  <string>noop</string>",
      "  <key>CFBundleIdentifier</key>",
      `  <string>${escapePlist(bundleId)}</string>`,
      "  <key>CFBundleInfoDictionaryVersion</key>",
      "  <string>6.0</string>",
      "  <key>CFBundleName</key>",
      "  <string>MacBridge TCC Reset</string>",
      "  <key>CFBundlePackageType</key>",
      "  <string>APPL</string>",
      "  <key>CFBundleShortVersionString</key>",
      "  <string>1.0</string>",
      "  <key>CFBundleVersion</key>",
      "  <string>1</string>",
      "</dict>",
      "</plist>",
      "",
    ].join("\n"),
  );
  writeFileSync(executable, "#!/bin/sh\nexit 0\n");

  await run(log, ["chmod", "755", executable], { allowFailure: true });
  await run(log, ["sudo", "-n", "rm", "-rf", appPath], { allowFailure: true });
  await run(log, ["sudo", "-n", "cp", "-R", localAppPath, appPath], { allowFailure: true });
  await run(log, ["sudo", "-n", LSREGISTER, "-f", appPath], { allowFailure: true });
  await run(log, ["sudo", "-n", "tccutil", "reset", service, bundleId], { allowFailure: true });
  await run(log, ["sudo", "-n", LSREGISTER, "-u", appPath], { allowFailure: true });
  await run(log, ["sudo", "-n", "rm", "-rf", appPath], { allowFailure: true });
  rmSync(localAppPath, { force: true, recursive: true });
}

async function deleteMacBridgeTccRows(
  log: ReturnType<typeof createBuildLog>,
  canUseSudo: boolean,
): Promise<void> {
  const sql = "delete from access where lower(client) like '%macbridge%';";

  if (existsSync(USER_TCC_DB)) {
    await run(log, ["sqlite3", USER_TCC_DB, sql], { allowFailure: true });
  }

  if (canUseSudo && existsSync(SYSTEM_TCC_DB)) {
    await run(log, ["sudo", "-n", "sqlite3", SYSTEM_TCC_DB, sql], { allowFailure: true });
  }

  await run(log, ["killall", "tccd"], { allowFailure: true });
  if (canUseSudo) {
    await run(log, ["sudo", "-n", "killall", "tccd"], { allowFailure: true });
  }
}

async function verifyNoMacBridgeTccRows(log: ReturnType<typeof createBuildLog>): Promise<void> {
  const rows = await readMacBridgeTccRows(log);
  if (rows.length === 0) {
    return;
  }

  throw new Error(
    [
      "MacBridge TCC cleanup left stale rows behind:",
      ...rows.map((row) => `  ${row}`),
      "Run with sudo credentials available, or clear these rows before building another installer.",
    ].join("\n"),
  );
}

async function readMacBridgeTccRows(log: ReturnType<typeof createBuildLog>): Promise<string[]> {
  const sql =
    "select service || '|' || client || '|' || client_type || '|' || auth_value || '|' || auth_reason || '|' || auth_version from access where lower(client) like '%macbridge%' order by service,client;";
  const rows: string[] = [];

  for (const database of [USER_TCC_DB, SYSTEM_TCC_DB]) {
    if (!existsSync(database)) {
      continue;
    }

    const result = await run(log, ["sqlite3", database, sql], { allowFailure: true });
    if (result.status !== 0) {
      continue;
    }

    for (const line of result.stdout.split("\n")) {
      const row = line.trim();
      if (row.length > 0) {
        rows.push(row);
      }
    }
  }

  return rows;
}

function escapePlist(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function discoverMacBridgeTccClients(log: ReturnType<typeof createBuildLog>): Promise<string[]> {
  const sql = "select distinct client from access where lower(client) like '%macbridge%';";
  const clients = new Set<string>();

  for (const database of [USER_TCC_DB, SYSTEM_TCC_DB]) {
    if (!existsSync(database)) {
      continue;
    }

    const result = await run(log, ["sqlite3", database, sql], { allowFailure: true });
    if (result.status !== 0) {
      continue;
    }

    for (const line of result.stdout.split("\n")) {
      const client = line.trim();
      if (client.length > 0) {
        clients.add(client);
      }
    }
  }

  return [...clients];
}

export async function unregisterMacBridgeApps(
  options: RegistrationCleanupOptions = {},
): Promise<void> {
  const log = createBuildLog("lsregister-cleanup");

  for (const appPath of new Set(STALE_LAUNCH_SERVICES_PATHS)) {
    if (options.dryRun === true) {
      log.info({ cmd: `${LSREGISTER} -u ${appPath}` }, "dry run");
      continue;
    }

    await run(log, [LSREGISTER, "-u", appPath], { allowFailure: true });

    if (existsSync(appPath)) {
      log.info({ path: appPath }, "unregistered stale MacBridge app path");
    }
  }
}

export async function removeInstalledMacBridgeApps(
  options: RegistrationCleanupOptions = {},
): Promise<void> {
  const log = createBuildLog("app-cleanup");
  if (options.removeInstalledApps === false) {
    log.info("Installed app removal skipped");
    return;
  }

  for (const appPath of new Set(INSTALLED_MACBRIDGE_PATHS)) {
    if (options.dryRun === true) {
      log.info({ cmd: `rm -rf ${appPath}` }, "dry run");
      continue;
    }

    try {
      await removePath(appPath);
    } catch (error) {
      log.info({ path: appPath }, "direct removal failed; retrying with sudo");
      await run(log, ["sudo", "rm", "-rf", appPath], { allowFailure: false });
    }

    if (!existsSync(appPath)) {
      log.info({ path: appPath }, "removed installed MacBridge path");
    }
  }
}

export async function cleanMacBridgeRegistrations(
  options: RegistrationCleanupOptions = {},
): Promise<void> {
  await terminateMacBridgeProcesses(options);
  await resetMacBridgeTcc(options);
  await unregisterMacBridgeApps(options);
  await removeInstalledMacBridgeApps(options);
}
