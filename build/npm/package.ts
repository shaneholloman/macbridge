import { join } from "node:path";
import type { Logger } from "pino";
import type { BuildArtifact, BuildManifest } from "../runtime/manifest.ts";
import { paths } from "../runtime/paths.ts";
import { fileSHA256, removePath, run } from "../runtime/runner.ts";
import { packageContract } from "./manifest.ts";

export async function buildEntrypoint(
  log: Logger,
  manifest: BuildManifest,
): Promise<BuildArtifact> {
  await run(log, [
    "bun",
    "build",
    paths.src.entrypoint,
    "--outdir",
    paths.dist.root,
    "--target",
    "node",
    "--format",
    "esm",
    "--packages",
    "external",
    "--entry-naming",
    "index.js",
  ]);

  const typesDir = join(paths.dist.build, "types");
  await run(log, [
    "bun",
    "x",
    "tsc",
    paths.src.entrypoint,
    "--declaration",
    "--emitDeclarationOnly",
    "--outDir",
    typesDir,
    "--module",
    "Preserve",
    "--moduleResolution",
    "Bundler",
    "--target",
    "ESNext",
    "--lib",
    "ESNext",
    "--types",
    "bun",
    "--strict",
    "--noUncheckedIndexedAccess",
    "--exactOptionalPropertyTypes",
    "--skipLibCheck",
    "--allowImportingTsExtensions",
    "false",
  ]);

  const sourceTypesDir = join(typesDir, "src");
  const sourceEntrypointTypes = join(sourceTypesDir, "index.d.ts");
  if (!(await Bun.file(sourceEntrypointTypes).exists())) {
    throw new Error(`Type declaration preflight did not produce ${sourceEntrypointTypes}`);
  }
  await run(log, ["cp", "-R", `${sourceTypesDir}/.`, paths.dist.root]);
  await removePath(typesDir);

  const jsPath = join(paths.dist.root, "index.js");
  const typesPath = join(paths.dist.root, "index.d.ts");
  manifest.package = {
    entrypoint: jsPath,
    types: typesPath,
  };
  manifest.artifacts.push({
    path: typesPath,
    kind: "typescript-declarations",
    sha256: await fileSHA256(typesPath),
    size: Bun.file(typesPath).size,
  });

  return {
    path: jsPath,
    kind: "typescript-entrypoint",
    sha256: await fileSHA256(jsPath),
    size: Bun.file(jsPath).size,
  };
}

export async function writePackageManifest(
  _log: Logger,
  _manifest: BuildManifest,
): Promise<BuildArtifact> {
  const path = join(paths.dist.build, "package-contract.json");
  await Bun.write(path, `${JSON.stringify(packageContract, null, 2)}\n`);
  return {
    path,
    kind: "package-contract",
    sha256: await fileSHA256(path),
    size: Bun.file(path).size,
  };
}
