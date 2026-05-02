import { join } from "node:path";
import { appBundlePath, appExecutablePath, appNotaryEvidencePath } from "../apple/app.ts";
import { macOSTargets } from "../native/targets.ts";
import { assertPackageContents } from "../npm/contract.ts";
import { createBuildLog } from "../runtime/log.ts";
import { createManifest, finishManifest, writeManifest } from "../runtime/manifest.ts";
import { paths } from "../runtime/paths.ts";
import { ensureDir, fileSHA256, removePath, run } from "../runtime/runner.ts";
import { dist } from "./dist.ts";

export type PackResult = {
  tarball: string;
  files: string[];
};

async function tarballName(): Promise<string> {
  const pkg = JSON.parse(await Bun.file("package.json").text()) as {
    name: string;
    version: string;
  };
  return `${pkg.name}-${pkg.version}.tgz`;
}

export async function pack(args: string[] = []): Promise<PackResult> {
  const log = createBuildLog("pack");
  const fromDist = args.includes("--from-dist");
  const requireSigned = args.includes("--require-signed");
  const buildArgs = args.filter((arg) => arg !== "--from-dist" && arg !== "--require-signed");

  if (fromDist) {
    await cleanPackageScratch();
  } else {
    await dist(buildArgs);
  }
  if (requireSigned) {
    await verifySignedPackageInputs(log);
  }

  const manifest = createManifest("pack");
  await ensureDir(paths.dist.npm);

  const filename = await tarballName();
  await run(log, ["bun", "pm", "pack", "--destination", paths.dist.npm, "--ignore-scripts"]);

  const tarball = join(paths.dist.npm, filename);
  const contents = await run(log, ["tar", "-tzf", tarball]);
  const reportPath = join(paths.dist.build, "package-contents.json");
  const files = contents.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  assertPackageContents(files, { notarized: requireSigned });
  await Bun.write(
    reportPath,
    `${JSON.stringify({ tarball, files, expectedFilesVerified: true }, null, 2)}\n`,
  );

  manifest.artifacts.push({
    path: tarball,
    kind: "npm-tarball",
    sha256: await fileSHA256(tarball),
    size: Bun.file(tarball).size,
  });
  manifest.artifacts.push({
    path: reportPath,
    kind: "package-contents",
    sha256: await fileSHA256(reportPath),
    size: Bun.file(reportPath).size,
  });

  finishManifest(manifest);
  await writeManifest(manifest);
  return { tarball, files };
}

async function cleanPackageScratch(): Promise<void> {
  await removePath(paths.dist.npm);
  await removePath(join(paths.dist.build, "package-contents.json"));
  await removePath(join(paths.dist.build, "verification.json"));
}

async function verifySignedPackageInputs(log: ReturnType<typeof createBuildLog>): Promise<void> {
  for (const target of macOSTargets) {
    const binary = join(paths.dist.bin, target.binaryName);
    const evidence = join(paths.dist.security, `${target.binaryName}.notary.json`);
    if (!(await Bun.file(binary).exists())) {
      throw new Error(`missing signed package binary: ${binary}`);
    }
    if (!(await Bun.file(evidence).exists())) {
      throw new Error(`missing notary evidence: ${evidence}`);
    }
    const notary = JSON.parse(await Bun.file(evidence).text()) as { status?: string };
    if (notary.status !== "Accepted") {
      throw new Error(`notary evidence is not Accepted for ${target.id}`);
    }
    await run(log, ["codesign", "--verify", "--strict", "--verbose=2", binary]);

    const app = appBundlePath(target);
    const appExecutable = appExecutablePath(target);
    const appEvidence = appNotaryEvidencePath(target);
    if (!(await Bun.file(appExecutable).exists())) {
      throw new Error(`missing signed app executable: ${appExecutable}`);
    }
    if (!(await Bun.file(appEvidence).exists())) {
      throw new Error(`missing app notary evidence: ${appEvidence}`);
    }
    const appNotary = JSON.parse(await Bun.file(appEvidence).text()) as { status?: string };
    if (appNotary.status !== "Accepted") {
      throw new Error(`app notary evidence is not Accepted for ${target.id}`);
    }
    await run(log, ["codesign", "--verify", "--deep", "--strict", "--verbose=2", app]);
  }
}
