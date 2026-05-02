import { join } from "node:path";
import { parseTargets } from "../native/swift.ts";
import { createBuildLog } from "../runtime/log.ts";
import { createManifest, finishManifest, writeManifest } from "../runtime/manifest.ts";
import { paths } from "../runtime/paths.ts";
import { fileSHA256, run } from "../runtime/runner.ts";
import { appBundlePath, appExecutablePath } from "./app.ts";
import { appleConfig, requireSignIdentity } from "./config.ts";

export async function sign(args: string[] = []): Promise<void> {
  const targets = parseTargets(args);
  const log = createBuildLog("apple:sign");
  const manifest = createManifest("apple-sign");
  const config = appleConfig();
  const identity = requireSignIdentity(config);

  for (const target of targets) {
    const binary = join(paths.dist.bin, target.binaryName);
    await ensureStagedBinary(binary, target.id);
    await run(log, [
      "codesign",
      "--force",
      "--sign",
      identity,
      "--options",
      "runtime",
      "--timestamp",
      binary,
    ]);
    await run(log, ["codesign", "--verify", "--strict", "--verbose=2", binary]);
    manifest.artifacts.push({
      path: binary,
      kind: "signed-native-binary",
      target: target.id,
      sha256: await fileSHA256(binary),
      size: Bun.file(binary).size,
    });
    manifest.native.push({
      target: target.id,
      source: binary,
      staged: binary,
      signed: true,
      notarized: false,
    });
  }

  finishManifest(manifest);
  await writeManifest(manifest);
}

export async function signApps(args: string[] = []): Promise<void> {
  const targets = parseTargets(args);
  const log = createBuildLog("apple:sign-app");
  const manifest = createManifest("apple-sign-app");
  const config = appleConfig();
  const identity = requireSignIdentity(config);

  for (const target of targets) {
    const app = appBundlePath(target);
    const executable = appExecutablePath(target);
    await ensureStagedBinary(executable, target.id);
    await run(log, [
      "codesign",
      "--force",
      "--sign",
      identity,
      "--options",
      "runtime",
      "--timestamp",
      executable,
    ]);
    await run(log, [
      "codesign",
      "--force",
      "--sign",
      identity,
      "--options",
      "runtime",
      "--timestamp",
      app,
    ]);
    await run(log, ["codesign", "--verify", "--deep", "--strict", "--verbose=2", app]);
    manifest.artifacts.push({
      path: executable,
      kind: "signed-app-executable",
      target: target.id,
      sha256: await fileSHA256(executable),
      size: Bun.file(executable).size,
    });
    manifest.native.push({
      target: target.id,
      source: executable,
      staged: executable,
      signed: true,
      notarized: false,
    });
  }

  finishManifest(manifest);
  await writeManifest(manifest);
}

async function ensureStagedBinary(path: string, target: string): Promise<void> {
  if (!(await Bun.file(path).exists())) {
    throw new Error(`missing staged binary for ${target}: run bun build/cli.ts native first`);
  }
}
