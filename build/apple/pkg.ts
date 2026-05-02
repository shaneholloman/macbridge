import { join } from "node:path";
import { parseTargets } from "../native/swift.ts";
import { createBuildLog } from "../runtime/log.ts";
import { createManifest, finishManifest, writeManifest } from "../runtime/manifest.ts";
import { paths } from "../runtime/paths.ts";
import { ensureDir, fileSHA256, removePath, run } from "../runtime/runner.ts";
import { appBundlePath } from "./app.ts";
import { appleConfig, requireInstallerIdentity, requireNotaryProfile } from "./config.ts";

const bundleID = "com.shaneholloman.macbridge";

export async function pkg(args: string[] = []): Promise<void> {
  const fromDist = args.includes("--from-dist");
  const skipNotarize = args.includes("--skip-notarize");
  const buildArgs = args.filter((arg) => arg !== "--from-dist" && arg !== "--skip-notarize");
  const targets = parseTargets(buildArgs);
  const log = createBuildLog("apple:pkg");
  const manifest = createManifest("apple-pkg");
  const config = appleConfig();
  const installerIdentity = requireInstallerIdentity(config);

  if (!fromDist) {
    throw new Error("pkg packaging requires --from-dist after signed app bundles are staged");
  }

  await ensureDir(paths.dist.pkg);
  await ensureDir(paths.dist.security);

  const packageJSON = JSON.parse(await Bun.file("package.json").text()) as {
    version: string;
  };

  for (const target of targets) {
    const app = appBundlePath(target);
    const pkgRoot = join(paths.dist.pkg, target.id);
    const payload = join(pkgRoot, "payload");
    const scripts = join(pkgRoot, "scripts");
    const component = join(pkgRoot, "component.pkg");
    const unsigned = join(pkgRoot, "unsigned.pkg");
    const installer = join(paths.dist.pkg, `macbridge-${packageJSON.version}-${target.id}.pkg`);
    const packageEnv = { ...Bun.env, COPYFILE_DISABLE: "1" };

    await run(log, ["codesign", "--verify", "--deep", "--strict", "--verbose=2", app]);
    await removePath(pkgRoot);
    await ensureDir(join(payload, "Applications"));
    await ensureDir(join(payload, "usr", "local", "bin"));
    await ensureDir(scripts);

    await run(log, ["ditto", "--norsrc", app, join(payload, "Applications", "MacBridge.app")], {
      env: packageEnv,
    });
    await Bun.write(
      join(payload, "usr", "local", "bin", "macbridge"),
      ["#!/bin/zsh", 'exec "/Applications/MacBridge.app/Contents/MacOS/macbridge" "$@"', ""].join(
        "\n",
      ),
    );
    await run(log, ["chmod", "755", join(payload, "usr", "local", "bin", "macbridge")]);
    await Bun.write(join(scripts, "postinstall"), postinstallScript(packageJSON.version));
    await run(log, ["chmod", "755", join(scripts, "postinstall")]);
    await run(log, ["dot_clean", "-m", payload]);
    await run(log, ["xattr", "-cr", payload]);
    await run(log, [
      "codesign",
      "--verify",
      "--deep",
      "--strict",
      "--verbose=2",
      join(payload, "Applications", "MacBridge.app"),
    ]);

    await run(
      log,
      [
        "pkgbuild",
        "--root",
        payload,
        "--identifier",
        `${bundleID}.pkg.${target.id}`,
        "--version",
        packageJSON.version,
        "--scripts",
        scripts,
        "--install-location",
        "/",
        component,
      ],
      { env: packageEnv },
    );
    await run(log, ["productbuild", "--package", component, unsigned], { env: packageEnv });
    await run(log, [
      "productsign",
      "--sign",
      installerIdentity,
      "--timestamp",
      unsigned,
      installer,
    ]);
    await run(log, ["pkgutil", "--check-signature", installer]);
    await run(log, ["pkgutil", "--payload-files", installer]);

    manifest.artifacts.push({
      path: installer,
      kind: "signed-pkg-installer",
      target: target.id,
      sha256: await fileSHA256(installer),
      size: Bun.file(installer).size,
    });

    if (!skipNotarize && !config.skipNotarize) {
      const profile = requireNotaryProfile(config);
      const result = await run(log, [
        "xcrun",
        "notarytool",
        "submit",
        installer,
        "--keychain-profile",
        profile,
        "--wait",
        "--output-format",
        "json",
      ]);
      const notaryResult = JSON.parse(result.stdout) as { status?: string; id?: string };
      if (notaryResult.status !== "Accepted") {
        throw new Error(
          `pkg notarization for ${target.id} was not accepted: ${JSON.stringify(notaryResult)}`,
        );
      }
      const evidencePath = join(
        paths.dist.security,
        `macbridge-${packageJSON.version}-${target.id}.pkg.notary.json`,
      );
      await Bun.write(evidencePath, `${result.stdout}\n`);
      await run(log, ["xcrun", "stapler", "staple", installer]);
      await run(log, ["xcrun", "stapler", "validate", installer]);
      manifest.artifacts.push({
        path: evidencePath,
        kind: "pkg-notary-evidence",
        target: target.id,
        sha256: await fileSHA256(evidencePath),
        size: Bun.file(evidencePath).size,
      });
    }
  }

  finishManifest(manifest);
  await writeManifest(manifest);
}

function postinstallScript(version: string): string {
  return [
    "#!/bin/zsh",
    `echo "MacBridge ${version} installed."`,
    'echo "Run: macbridge permissions check --prompt"',
    "exit 0",
    "",
  ].join("\n");
}
