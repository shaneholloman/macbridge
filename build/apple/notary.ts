import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseTargets } from "../native/swift.ts";
import { createBuildLog } from "../runtime/log.ts";
import { createManifest, finishManifest, writeManifest } from "../runtime/manifest.ts";
import { paths } from "../runtime/paths.ts";
import { ensureDir, fileSHA256, removePath, run } from "../runtime/runner.ts";
import { appBundlePath, appNotaryEvidencePath } from "./app.ts";
import { appleConfig, requireNotaryProfile } from "./config.ts";

export async function notarize(args: string[] = []): Promise<void> {
  const targets = parseTargets(args);
  const log = createBuildLog("apple:notarize");
  const manifest = createManifest("apple-notarize");
  const config = appleConfig();

  if (config.skipNotarize) {
    throw new Error(
      "MACBRIDGE_SKIP_NOTARIZE is set; refusing to create release notarization evidence",
    );
  }

  const profile = requireNotaryProfile(config);
  await ensureDir(paths.dist.security);
  await ensureDir(paths.tmpNotary);

  for (const target of targets) {
    const binary = join(paths.dist.bin, target.binaryName);
    await ensureStagedBinary(binary, target.id);
    const archive = join(paths.tmpNotary, `${target.binaryName}.zip`);
    await run(log, ["ditto", "-c", "-k", "--keepParent", binary, archive]);

    const submit = [
      "xcrun",
      "notarytool",
      "submit",
      archive,
      "--keychain-profile",
      profile,
      "--wait",
      "--output-format",
      "json",
    ];
    if (config.notaryKeychain != null) {
      submit.push("--keychain", config.notaryKeychain);
    }
    const result = await run(log, submit);
    const notaryResult = JSON.parse(result.stdout) as { status?: string; id?: string };
    if (notaryResult.status !== "Accepted") {
      throw new Error(
        `notarization for ${target.id} was not accepted: ${JSON.stringify(notaryResult)}`,
      );
    }
    const evidencePath = join(paths.dist.security, `${target.binaryName}.notary.json`);
    await Bun.write(evidencePath, `${result.stdout}\n`);

    manifest.artifacts.push({
      path: archive,
      kind: "notary-upload-archive",
      target: target.id,
      sha256: await fileSHA256(archive),
      size: Bun.file(archive).size,
    });
    manifest.artifacts.push({
      path: evidencePath,
      kind: "notary-evidence",
      target: target.id,
      sha256: await fileSHA256(evidencePath),
      size: Bun.file(evidencePath).size,
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

export async function notarizeApps(args: string[] = []): Promise<void> {
  const targets = parseTargets(args);
  const log = createBuildLog("apple:notarize-app");
  const manifest = createManifest("apple-notarize-app");
  const config = appleConfig();

  if (config.skipNotarize) {
    throw new Error(
      "MACBRIDGE_SKIP_NOTARIZE is set; refusing to create release notarization evidence",
    );
  }

  const profile = requireNotaryProfile(config);
  await ensureDir(paths.dist.security);
  await ensureDir(paths.tmpNotary);

  for (const target of targets) {
    const app = appBundlePath(target);
    if (!existsSync(app)) {
      throw new Error(
        `missing staged app for ${target.id}: run bun build/cli.ts app --from-dist first`,
      );
    }
    const archive = join(paths.tmpNotary, `MacBridge-${target.id}.app.zip`);
    await removePath(archive);
    await run(log, ["ditto", "-c", "-k", "--keepParent", app, archive]);

    const submit = [
      "xcrun",
      "notarytool",
      "submit",
      archive,
      "--keychain-profile",
      profile,
      "--wait",
      "--output-format",
      "json",
    ];
    if (config.notaryKeychain != null) {
      submit.push("--keychain", config.notaryKeychain);
    }
    const result = await run(log, submit);
    const notaryResult = JSON.parse(result.stdout) as { status?: string; id?: string };
    if (notaryResult.status !== "Accepted") {
      throw new Error(
        `app notarization for ${target.id} was not accepted: ${JSON.stringify(notaryResult)}`,
      );
    }

    const evidencePath = appNotaryEvidencePath(target);
    await Bun.write(evidencePath, `${result.stdout}\n`);
    await run(log, ["xcrun", "stapler", "staple", app]);
    await run(log, ["xcrun", "stapler", "validate", app]);

    manifest.artifacts.push({
      path: archive,
      kind: "app-notary-upload-archive",
      target: target.id,
      sha256: await fileSHA256(archive),
      size: Bun.file(archive).size,
    });
    manifest.artifacts.push({
      path: evidencePath,
      kind: "app-notary-evidence",
      target: target.id,
      sha256: await fileSHA256(evidencePath),
      size: Bun.file(evidencePath).size,
    });
    manifest.native.push({
      target: target.id,
      source: app,
      staged: app,
      signed: true,
      notarized: true,
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
