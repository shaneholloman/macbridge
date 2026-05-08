#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { appleConfig, requireNotaryProfile, requireSignIdentity } from "../apple/config.ts";
import { MACBRIDGE_BUNDLE_ID } from "../apple/identity.ts";
import { createBuildLogger } from "../runtime/log.js";
import type { RuntimeProfile } from "../runtime/profiles.js";
import { createDmg } from "./artifacts.js";
import { applyBranding, replaceIcons, rewriteDocsUrl, stampVersion } from "./branding.js";
import {
  assertTargetBinaries,
  buildTerminal,
  checkPrerequisites,
  findExistingBuiltApp,
  rebuildAgentBinaries,
} from "./build.js";
import { createAppBundle } from "./bundle.js";
import { applyGhosttySwiftPatches } from "./patches.js";
import { notarizeGhosttyArtifacts, signAppBundle } from "./signing.js";
import { prepareGhosttySource } from "./source.js";

const ROOT = resolve(import.meta.dirname, "../..");
const GHOSTTY_DIR = join(ROOT, "tmp/ghostty");
const ENTITLEMENTS_CLI = join(
  ROOT,
  "build/packaging/entitlements/macbridge-shell-cli.entitlements",
);
const ENTITLEMENTS_APP = join(
  ROOT,
  "build/packaging/entitlements/macbridge-shell-app.entitlements",
);
const MACBRIDGE_DOCS_URL = "https://github.com/shaneholloman/macbridge/tree/main/docs";

const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const VERSION: string = packageJson.version;

const apple = appleConfig();
const SIGN_APP = requireSignIdentity(apple);
const NOTARIZE_PROFILE = requireNotaryProfile(apple);

const CONFIG = {
  appName: "MacBridge",
  appNameShort: "MacBridge",
  bundleId: MACBRIDGE_BUNDLE_ID,
  minOSVersion: "13.0",
} as const;

const log = createBuildLogger();

function parseArgs(args: string[]): {
  createDmg: boolean;
  debugMaps: boolean;
  help: boolean;
  latestGhostty: boolean;
  runtimeProfile: RuntimeProfile;
  skipAgentRebuild: boolean;
  skipBuild: boolean;
  target: string;
  upgradeOnly: boolean;
  verboseXcodebuild: boolean;
} {
  const targetArg = args.find((a) => a.startsWith("--target="));
  const target = targetArg?.split("=")[1] ?? "darwin-arm64";
  const runtimeProfileArg = args.find((a) => a.startsWith("--runtime-profile="));
  const runtimeProfile = runtimeProfileArg?.split("=")[1] ?? "shell";
  if (runtimeProfile !== "shell") {
    throw new Error(`Invalid --runtime-profile "${runtimeProfile}". Expected "shell".`);
  }
  return {
    createDmg: args.includes("--dmg"),
    debugMaps: args.includes("--debug-maps"),
    help: args.includes("--help") || args.includes("-h"),
    latestGhostty:
      args.includes("--latest-ghostty") ||
      args.includes("--refresh-ghostty") ||
      args.includes("--update-ghostty"),
    runtimeProfile,
    skipAgentRebuild: args.includes("--skip-agent-rebuild"),
    skipBuild: args.includes("--skip-build"),
    target,
    upgradeOnly: args.includes("--upgrade-only"),
    verboseXcodebuild:
      args.includes("--verbose-xcodebuild") ||
      process.env.MACBRIDGE_VERBOSE_XCODEBUILD === "1" ||
      process.env.MACBRIDGE_VERBOSE_XCODEBUILD?.toLowerCase() === "true",
  };
}

function usage(): string {
  return `
MacBridge Builder

Usage:
  bun build/ghostty/cli.ts [--target=<target>] [--runtime-profile=<shell>] [--dmg] [--latest-ghostty] [--skip-build] [--skip-agent-rebuild] [--debug-maps] [--upgrade-only] [--verbose-xcodebuild]

Examples:
  bun build/ghostty/cli.ts --target=darwin-arm64
  bun build/ghostty/cli.ts --target=darwin-arm64 --runtime-profile=shell
  bun build/ghostty/cli.ts --dmg --latest-ghostty
  bun build/ghostty/cli.ts --skip-build --skip-agent-rebuild
  bun build/ghostty/cli.ts --latest-ghostty --upgrade-only
`.trim();
}

async function patchSwiftSources(): Promise<void> {
  const stage = log.start("Patching Swift sources for bundled config");
  applyGhosttySwiftPatches(log, GHOSTTY_DIR);
  stage.ok("Swift patches applied");
}

async function verifyUpgradeCompatibility(): Promise<void> {
  const stage = log.start("Generating Ghostty compatibility report");
  const proc = Bun.spawn(["bun", "build/scripts/rebrand-ghostty.ts", "--verify"], {
    cwd: ROOT,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error("Ghostty compatibility verification failed");
  }
  stage.ok("Ghostty compatibility report complete");
}

export async function runGhosttyPackaging(args = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(args);
  if (args.includes("--skip-notarize")) {
    throw new Error("shell builds must be notarized; remove --skip-notarize");
  }
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (!options.target.startsWith("darwin")) {
    throw new Error("Terminal build is macOS only");
  }

  process.stdout.write(`\nMacBridge Builder v${VERSION}\n`);

  await checkPrerequisites(log);
  if (options.skipAgentRebuild) {
    log.info("Skipping agent binary rebuild (--skip-agent-rebuild)");
  } else {
    await rebuildAgentBinaries(log, ROOT, options.target, {
      debugMaps: options.debugMaps,
      runtimeProfile: options.runtimeProfile,
    });
  }

  assertTargetBinaries(log, ROOT, options.target, options.runtimeProfile);
  await prepareGhosttySource(log, options.latestGhostty);
  await applyBranding(log, GHOSTTY_DIR, {
    appName: CONFIG.appName,
    bundleId: CONFIG.bundleId,
    lowerName: "macbridge",
  });
  stampVersion(log, GHOSTTY_DIR, VERSION);
  await patchSwiftSources();
  rewriteDocsUrl(log, GHOSTTY_DIR, MACBRIDGE_DOCS_URL);
  await replaceIcons(log, GHOSTTY_DIR);

  if (options.upgradeOnly) {
    await verifyUpgradeCompatibility();
    process.stdout.write("\nUpgrade report complete.\n");
    return;
  }

  let builtAppPath: string;
  if (options.skipBuild) {
    const existing = findExistingBuiltApp(GHOSTTY_DIR, CONFIG.appName);
    if (!existing) {
      throw new Error("No existing build found. Remove --skip-build.");
    }
    builtAppPath = existing;
  } else {
    builtAppPath = await buildTerminal(log, GHOSTTY_DIR, VERSION, CONFIG.appName, {
      verboseXcodebuild: options.verboseXcodebuild,
    });
  }

  const distDir = join(ROOT, "dist", options.target);
  const { appBundlePath, dmgName } = await createAppBundle(CONFIG, {
    appPath: builtAppPath,
    distDir,
    log,
    runtimeProfile: options.runtimeProfile,
    target: options.target,
    version: VERSION,
  });
  await signAppBundle({
    appBundlePath,
    entitlementsAppPath: ENTITLEMENTS_APP,
    entitlementsCliPath: ENTITLEMENTS_CLI,
    log,
    signIdentity: SIGN_APP,
  });

  let dmgPath: string | null = null;
  if (options.createDmg) {
    dmgPath = await createDmg(
      {
        appName: CONFIG.appNameShort,
        runtimeProfile: options.runtimeProfile,
        version: VERSION,
      },
      {
        appBundlePath,
        distDir,
        log,
        signIdentity: SIGN_APP,
        target: options.target,
      },
    );
  }

  await notarizeGhosttyArtifacts({
    appBundlePath,
    appName: CONFIG.appNameShort,
    dmgName,
    dmgPath,
    keychainProfile: NOTARIZE_PROFILE,
    log,
    target: options.target,
  });

  process.stdout.write("\nBuild complete.\n");
}

if (import.meta.main) {
  runGhosttyPackaging().catch((err) => {
    log.error(`Build failed: ${err}`);
    process.exit(1);
  });
}
