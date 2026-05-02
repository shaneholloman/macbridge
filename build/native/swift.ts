import { join } from "node:path";
import type { Logger } from "pino";
import type { BuildArtifact, BuildManifest } from "../runtime/manifest.ts";
import { paths } from "../runtime/paths.ts";
import { copyFile, fileSHA256, run } from "../runtime/runner.ts";
import { macOSTargets, type NativeTarget } from "./targets.ts";

export type NativeBuild = {
  target: NativeTarget;
  binary: string;
};

export function hostTarget(): NativeTarget {
  const target = macOSTargets.find(
    (candidate) => candidate.os === process.platform && candidate.arch === process.arch,
  );
  if (target == null) {
    throw new Error(`unsupported host target: ${process.platform}-${process.arch}`);
  }
  return target;
}

export function parseTargets(args: string[]): NativeTarget[] {
  const index = args.indexOf("--target");
  if (index === -1) return macOSTargets;

  const id = args[index + 1];
  const target = macOSTargets.find((candidate) => candidate.id === id);
  if (target == null) {
    throw new Error(`unknown target: ${id ?? ""}`);
  }
  return [target];
}

export async function buildNative(log: Logger, target: NativeTarget): Promise<NativeBuild> {
  const args = [
    "swift",
    "build",
    "-c",
    "release",
    "--package-path",
    paths.native.swiftPackage,
    "--scratch-path",
    paths.native.swiftScratch,
    "--arch",
    target.swiftArch,
  ];
  await run(log, args);
  return {
    target,
    binary: join(paths.native.swiftScratch, target.buildPath, "release", "macbridge"),
  };
}

export async function stageNative(
  log: Logger,
  manifest: BuildManifest,
  build: NativeBuild,
): Promise<BuildArtifact> {
  const staged = join(paths.dist.bin, build.target.binaryName);
  await copyFile(build.binary, staged);
  await run(log, ["chmod", "755", staged]);

  const artifact = {
    path: staged,
    kind: "native-binary",
    target: build.target.id,
    sha256: await fileSHA256(staged),
    size: Bun.file(staged).size,
  };
  manifest.native.push({
    target: build.target.id,
    source: build.binary,
    staged,
    signed: false,
    notarized: false,
  });
  return artifact;
}
