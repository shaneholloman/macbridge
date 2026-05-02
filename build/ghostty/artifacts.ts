import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import { appendArtifactSecurityRecord } from "../runtime/evidence.js";
import type { BuildLogger } from "../runtime/log.js";
import { getProfileArtifactSuffix, type RuntimeProfile } from "../runtime/profiles.js";

export interface DmgConfig {
  appName: string;
  runtimeProfile: RuntimeProfile;
  version: string;
}

export interface DmgInputs {
  appBundlePath: string;
  distDir: string;
  log: BuildLogger;
  signIdentity: string;
  target: string;
}

export async function createDmg(config: DmgConfig, inputs: DmgInputs): Promise<string> {
  const stage = inputs.log.start("Creating DMG");
  const profileSuffix = getProfileArtifactSuffix(config.runtimeProfile);
  const dmgName = `${config.appName.toLowerCase()}-${config.version}-${inputs.target}${profileSuffix}.dmg`;
  const dmgPath = join(inputs.distDir, dmgName);
  const tempDmg = join(inputs.distDir, "temp-ghostty.dmg");
  const volumeName = `${config.appName} ${config.version}`;

  const tempDir = (await $`mktemp -d`.quiet()).stdout.toString().trim();
  await $`cp -R ${inputs.appBundlePath} ${tempDir}/`.quiet();
  await $`ln -s /Applications ${tempDir}/Applications`.quiet();

  const bundleSizeText =
    (await $`du -sm ${inputs.appBundlePath}`.quiet()).stdout.toString().split("\t")[0] ?? "0";
  const bundleSize = parseInt(bundleSizeText, 10);
  const dmgSize = bundleSize + 50;

  await $`hdiutil create -volname ${volumeName} -srcfolder ${tempDir} -ov -format UDRW -size ${dmgSize}m ${tempDmg}`.quiet();

  if (existsSync(dmgPath)) rmSync(dmgPath);
  await $`hdiutil convert ${tempDmg} -format UDZO -imagekey zlib-level=9 -o ${dmgPath}`.quiet();

  rmSync(tempDmg);
  rmSync(tempDir, { recursive: true });

  try {
    await $`codesign --sign ${inputs.signIdentity} --timestamp ${dmgPath}`.quiet();
    inputs.log.info("DMG signed");
    appendArtifactSecurityRecord({
      artifactKind: "dmg",
      artifactPath: dmgPath,
      operation: "sign",
      status: "ok",
    });
  } catch (error) {
    appendArtifactSecurityRecord({
      artifactKind: "dmg",
      artifactPath: dmgPath,
      note: error instanceof Error ? error.message : String(error),
      operation: "sign",
      status: "failed",
    });
    throw error;
  }

  const stats = await $`du -h ${dmgPath}`.quiet();
  const size = (stats.stdout.toString().split("\t")[0] ?? "").trim();
  stage.ok(`${dmgPath} (${size})`);
  return dmgPath;
}
