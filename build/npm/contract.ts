import { packageContract } from "./manifest.ts";

export type PackageMetadata = {
  name?: string;
  private?: boolean;
  type?: string;
  exports?: unknown;
  types?: string;
  bin?: unknown;
  files?: unknown;
  os?: unknown;
  cpu?: unknown;
  license?: string;
  repository?: unknown;
  bugs?: unknown;
  homepage?: string;
  keywords?: unknown;
};

const basePackageFiles = [
  "package/package.json",
  "package/LICENSE",
  "package/README.md",
  "package/docs/cli.md",
  "package/docs/development/repository.md",
  "package/docs/development/rfcs/README.md",
  "package/docs/development/rfcs/implemented/README.md",
  "package/docs/development/rfcs/implemented/rfc-0001-swift-package-structure-and-semantics.md",
  "package/docs/development/rfcs/implemented/rfc-0002-soak-regime-and-run-ledger.md",
  "package/docs/development/rfcs/implemented/rfc-0003-execution-waterfall-reporting.md",
  "package/docs/development/rfcs/implemented/rfc-0004-aggregate-soak-reporting-and-indexing.md",
  "package/docs/development/rfcs/implemented/rfc-0005-npm-package-delivery.md",
  "package/docs/development/rfcs/implemented/rfc-0006-apple-distribution-signing-and-notarization.md",
  "package/docs/development/rfcs/implemented/rfc-0009-public-typescript-api-and-cli-semantics.md",
  "package/docs/development/rfcs/index.md",
  "package/docs/development/rfcs/rfc-0007-app-identity-and-icon-distribution.md",
  "package/docs/development/rfcs/rfc-0008-model-agnostic-agent-loop.md",
  "package/docs/development/rfcs/rfc-0010-multimodal-evidence-and-session-video.md",
  "package/docs/usage.md",
  "package/dist/bin/macbridge",
  "package/dist/build/latest.json",
  "package/dist/build/logs/commands.jsonl",
  "package/dist/build/package-contract.json",
  "package/dist/build/timings/commands.jsonl",
  "package/dist/agent/command.d.ts",
  "package/dist/agent/model.d.ts",
  "package/dist/agent/planner.d.ts",
  "package/dist/agent/session.d.ts",
  "package/dist/cli/command.d.ts",
  "package/dist/bin/macbridge-darwin-arm64",
  "package/dist/cli/main.d.ts",
  "package/dist/core/client.d.ts",
  "package/dist/core/control.d.ts",
  "package/dist/core/log.d.ts",
  "package/dist/index.d.ts",
  "package/dist/index.js",
  "package/dist/media/caps.d.ts",
  "package/dist/media/recording.d.ts",
  "package/dist/native/macbridge.d.ts",
  "package/dist/observe/summary.d.ts",
  "package/dist/observe/targets/outlook.d.ts",
  "package/dist/observe/verify.d.ts",
  "package/dist/protocol/schema.d.ts",
  "package/dist/protocol/types.d.ts",
];

const notarizedPackageFiles: string[] = [];

const optionalPackageFiles: string[] = [];

export const forbiddenPackagePathParts = [
  ".DS_Store",
  ".build/",
  ".env",
  ".npmrc",
  ".zip",
  "node_modules/",
  "screenshots/",
  "soak/runs/",
  "soak/reports/",
  "tmp/",
];

export function assertPackageMetadata(pkg: PackageMetadata): void {
  assertEqual(pkg.name, packageContract.name, "package name");
  assertEqual(pkg.private, false, "private flag");
  assertEqual(pkg.type, "module", "package type");
  assertEqual(pkg.types, "./dist/index.d.ts", "types path");
  assertArray(pkg.files, packageContract.files, "files");
  assertArray(pkg.os, packageContract.os, "os");
  assertArray(pkg.cpu, packageContract.cpu, "cpu");

  assertJSON(pkg.exports, packageContract.exports, "exports");
  assertJSON(pkg.bin, packageContract.bin, "bin");

  if (pkg.license == null || pkg.license.length === 0) {
    throw new Error("package license is required");
  }
  if (pkg.repository == null) throw new Error("package repository is required");
  if (pkg.bugs == null) throw new Error("package bugs URL is required");
  if (pkg.homepage == null || pkg.homepage.length === 0) {
    throw new Error("package homepage is required");
  }
  if (!Array.isArray(pkg.keywords) || pkg.keywords.length === 0) {
    throw new Error("package keywords are required");
  }
}

export function assertPackageContents(
  files: string[],
  options: { notarized?: boolean } = {},
): void {
  const expectedPackageFiles =
    options.notarized === true ? [...basePackageFiles, ...notarizedPackageFiles] : basePackageFiles;
  const fileSet = new Set(files);
  for (const expected of expectedPackageFiles) {
    if (!fileSet.has(expected)) {
      throw new Error(`packed package is missing ${expected}`);
    }
  }

  const manifestFiles = files.filter((file) =>
    /^package\/dist\/build\/manifests\/[^/]+\.json$/.test(file),
  );
  if (manifestFiles.length === 0) {
    throw new Error("expected at least one build manifest");
  }
  const pkgNotaryEvidenceFiles = files.filter((file) =>
    /^package\/dist\/build\/security\/macbridge-[^/]+-darwin-arm64\.pkg\.notary\.json$/.test(file),
  );
  const pkgInstallerFiles = files.filter((file) =>
    /^package\/dist\/pkg\/macbridge-[^/]+-darwin-arm64\.pkg$/.test(file),
  );
  if (pkgInstallerFiles.length !== 1) {
    throw new Error("expected exactly one darwin-arm64 installer pkg in npm payload");
  }
  if (options.notarized === true && pkgNotaryEvidenceFiles.length !== 1) {
    throw new Error("expected notarized pkg evidence for darwin-arm64");
  }
  for (const file of files) {
    for (const part of forbiddenPackagePathParts) {
      if (file.includes(part)) {
        throw new Error(`packed package must not include ${file}`);
      }
    }
  }

  const allowed = new Set([
    ...expectedPackageFiles,
    ...optionalPackageFiles,
    ...manifestFiles,
    ...pkgInstallerFiles,
    ...pkgNotaryEvidenceFiles,
  ]);
  for (const file of files) {
    if (!allowed.has(file)) {
      throw new Error(`packed package has unexpected file ${file}`);
    }
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertArray(actual: unknown, expected: string[], label: string): void {
  if (!Array.isArray(actual) || actual.join("\0") !== expected.join("\0")) {
    throw new Error(`${label} mismatch: expected ${expected.join(", ")}`);
  }
}

function assertJSON(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} does not match package contract`);
  }
}
