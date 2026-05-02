import { existsSync, readdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { $ } from "bun";
import { appendArtifactSecurityRecord } from "../runtime/evidence.js";
import type { BuildLogger } from "../runtime/log.js";
import { notarizeArtifact } from "../runtime/notary.js";

export interface SignAppBundleInputs {
  appBundlePath: string;
  entitlementsAppPath: string;
  entitlementsCliPath: string;
  log: BuildLogger;
  signIdentity: string;
}

export interface NotarizeGhosttyArtifactsInputs {
  appBundlePath: string;
  appName: string;
  dmgName: string;
  dmgPath: string | null;
  keychainProfile: string;
  log: BuildLogger;
}

export async function signAppBundle(inputs: SignAppBundleInputs): Promise<void> {
  const appBundleName = basename(inputs.appBundlePath);
  const stage = inputs.log.start(`Signing ${appBundleName}`);
  try {
    const macosDir = join(inputs.appBundlePath, "Contents/MacOS");

    const runtimeBinaryInBundle = join(macosDir, "macbridge-runtime");
    if (existsSync(runtimeBinaryInBundle)) {
      await $`codesign --sign ${inputs.signIdentity} --options runtime --entitlements ${inputs.entitlementsCliPath} --timestamp --force ${runtimeBinaryInBundle}`.quiet();
      inputs.log.info("Runtime binary signed (with JIT entitlements)");
    }

    const launcherScript = join(macosDir, "macbridge-launch");
    if (existsSync(launcherScript)) {
      await $`codesign --sign ${inputs.signIdentity} --options runtime --timestamp --force ${launcherScript}`.quiet();
      inputs.log.info("Launcher script signed");
    }

    const frameworksDir = join(inputs.appBundlePath, "Contents/Frameworks");
    if (existsSync(frameworksDir)) {
      for (const entry of readdirSync(frameworksDir, { withFileTypes: true })) {
        const full = join(frameworksDir, entry.name);
        if (
          entry.isDirectory() &&
          (entry.name.endsWith(".framework") || entry.name.endsWith(".app"))
        ) {
          await $`codesign --sign ${inputs.signIdentity} --options runtime --timestamp --force --deep ${full}`.quiet();
          inputs.log.info(`Signed framework: ${entry.name}`);
        }
      }
    }

    const pluginsDir = join(inputs.appBundlePath, "Contents/PlugIns");
    if (existsSync(pluginsDir)) {
      for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
        const full = join(pluginsDir, entry.name);
        if (entry.isDirectory()) {
          await $`codesign --sign ${inputs.signIdentity} --options runtime --timestamp --force --deep ${full}`.quiet();
          inputs.log.info(`Signed plugin: ${entry.name}`);
        }
      }
    }

    await $`codesign --sign ${inputs.signIdentity} --options runtime --entitlements ${inputs.entitlementsAppPath} --timestamp --force ${inputs.appBundlePath}`.quiet();
    await $`codesign --verify --verbose=2 --deep --strict ${inputs.appBundlePath}`.quiet();
    inputs.log.info("App bundle signed and verified");
    appendArtifactSecurityRecord({
      artifactKind: "appBundle",
      artifactPath: inputs.appBundlePath,
      operation: "sign",
      status: "ok",
    });

    await $`touch ${inputs.appBundlePath}`.quiet();
    stage.ok(`${appBundleName} signing complete`);
  } catch (error) {
    appendArtifactSecurityRecord({
      artifactKind: "appBundle",
      artifactPath: inputs.appBundlePath,
      note: error instanceof Error ? error.message : String(error),
      operation: "sign",
      status: "failed",
    });
    throw error;
  }
}

export async function notarizeGhosttyArtifacts(
  inputs: NotarizeGhosttyArtifactsInputs,
): Promise<void> {
  const appBundleName = basename(inputs.appBundlePath);
  const appNotarizeStage = inputs.log.start(`Notarizing ${appBundleName}`);
  const appZip = `${inputs.appBundlePath}.zip`;
  await $`ditto -c -k --keepParent ${inputs.appBundlePath} ${appZip}`.quiet();
  try {
    try {
      await notarizeArtifact({
        artifactPath: appZip,
        keychainProfile: inputs.keychainProfile,
        log: inputs.log,
        name: `${inputs.appName}.app`,
        staplePath: inputs.appBundlePath,
      });
      appendArtifactSecurityRecord({
        artifactKind: "appBundle",
        artifactPath: inputs.appBundlePath,
        operation: "notarize",
        status: "ok",
      });
    } catch (error) {
      appendArtifactSecurityRecord({
        artifactKind: "appBundle",
        artifactPath: inputs.appBundlePath,
        note: error instanceof Error ? error.message : String(error),
        operation: "notarize",
        status: "failed",
      });
      throw error;
    }
  } finally {
    rmSync(appZip, { force: true });
  }
  appNotarizeStage.ok(`${appBundleName} notarization complete`);

  if (inputs.dmgPath && existsSync(inputs.dmgPath)) {
    const dmgNotarizeStage = inputs.log.start("Notarizing DMG");
    try {
      await notarizeArtifact({
        artifactPath: inputs.dmgPath,
        keychainProfile: inputs.keychainProfile,
        log: inputs.log,
        name: inputs.dmgName,
        staplePath: inputs.dmgPath,
      });
      appendArtifactSecurityRecord({
        artifactKind: "dmg",
        artifactPath: inputs.dmgPath,
        operation: "notarize",
        status: "ok",
      });
    } catch (error) {
      appendArtifactSecurityRecord({
        artifactKind: "dmg",
        artifactPath: inputs.dmgPath,
        note: error instanceof Error ? error.message : String(error),
        operation: "notarize",
        status: "failed",
      });
      throw error;
    }
    dmgNotarizeStage.ok("DMG notarization complete");
  }
}
