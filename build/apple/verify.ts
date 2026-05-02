import { join } from "node:path";
import { parseTargets } from "../native/swift.ts";
import type { NativeTarget } from "../native/targets.ts";
import { createBuildLog } from "../runtime/log.ts";
import { createManifest, finishManifest, writeManifest } from "../runtime/manifest.ts";
import { paths } from "../runtime/paths.ts";
import { fileSHA256, run } from "../runtime/runner.ts";
import { appBundlePath, appExecutablePath, appIconPath, appInfoPlistPath } from "./app.ts";

export async function verifyApple(args: string[] = []): Promise<void> {
  const targets = parseTargets(args);
  const log = createBuildLog("apple:verify");
  const manifest = createManifest("apple-verify");

  for (const target of targets) {
    const binary = join(paths.dist.bin, target.binaryName);
    await ensureStagedBinary(binary, target.id);
    await run(log, ["codesign", "--verify", "--strict", "--verbose=2", binary]);
    await run(log, ["codesign", "-dv", "--verbose=4", binary]);
    await verifyAcceptedNotaryEvidence(target.binaryName, target.id);
    await run(log, [binary, "--help"]);
    await run(log, [binary, "permissions", "check"]);
    await verifyApp(log, target);
    manifest.artifacts.push({
      path: binary,
      kind: "verified-native-binary",
      target: target.id,
      sha256: await fileSHA256(binary),
      size: Bun.file(binary).size,
    });
    manifest.native.push({
      target: target.id,
      source: binary,
      staged: binary,
      signed: true,
      notarized: true,
    });
  }

  finishManifest(manifest);
  await writeManifest(manifest);
}

async function verifyApp(
  log: ReturnType<typeof createBuildLog>,
  target: NativeTarget,
): Promise<void> {
  const app = appBundlePath(target);
  const executable = appExecutablePath(target);
  const infoPlist = appInfoPlistPath(target);
  const icon = appIconPath(target);

  await ensureStagedBinary(executable, target.id);
  await ensureStagedBinary(infoPlist, target.id);
  await ensureStagedBinary(icon, target.id);
  await run(log, ["plutil", "-lint", infoPlist]);
  await run(log, ["codesign", "--verify", "--deep", "--strict", "--verbose=2", app]);
  await run(log, ["codesign", "-dv", "--verbose=4", app]);
  await verifyAcceptedAppNotaryEvidence(target.id);
  await run(log, [executable, "--help"]);
  await run(log, [executable, "permissions", "check"]);
}

async function ensureStagedBinary(path: string, target: string): Promise<void> {
  if (!(await Bun.file(path).exists())) {
    throw new Error(`missing staged binary for ${target}: run bun build/cli.ts native first`);
  }
}

async function verifyAcceptedAppNotaryEvidence(target: string): Promise<void> {
  const evidencePath = join(paths.dist.security, `MacBridge-${target}.app.notary.json`);
  if (!(await Bun.file(evidencePath).exists())) {
    throw new Error(
      `missing app notary evidence for ${target}: run bun build/cli.ts apple notarize-app`,
    );
  }
  const evidence = JSON.parse(await Bun.file(evidencePath).text()) as { status?: string };
  if (evidence.status !== "Accepted") {
    throw new Error(`app notary evidence for ${target} is not Accepted`);
  }
}

async function verifyAcceptedNotaryEvidence(binaryName: string, target: string): Promise<void> {
  const evidencePath = join(paths.dist.security, `${binaryName}.notary.json`);
  if (!(await Bun.file(evidencePath).exists())) {
    throw new Error(`missing notary evidence for ${target}: run bun build/cli.ts apple notarize`);
  }
  const evidence = JSON.parse(await Bun.file(evidencePath).text()) as { status?: string };
  if (evidence.status !== "Accepted") {
    throw new Error(`notary evidence for ${target} is not Accepted`);
  }
}
