export type PackageContract = {
  name: string;
  bin: Record<string, string>;
  exports: Record<string, { types: string; import: string }>;
  files: string[];
  os: string[];
  cpu: string[];
};

export const packageContract: PackageContract = {
  name: "macbridge",
  bin: {
    macbridge: "./dist/bin/macbridge",
  },
  exports: {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    },
  },
  files: [
    "dist/agent/*.d.ts",
    "dist/pkg/macbridge-*-darwin-arm64.pkg",
    "dist/bin/macbridge",
    "dist/bin/macbridge-darwin-arm64",
    "dist/build/latest.json",
    "dist/build/logs/commands.jsonl",
    "dist/build/manifests/*.json",
    "dist/build/package-contract.json",
    "dist/build/security/macbridge-*-darwin-arm64.pkg.notary.json",
    "dist/build/timings/commands.jsonl",
    "dist/cli/*.d.ts",
    "dist/core/*.d.ts",
    "dist/index.d.ts",
    "dist/index.js",
    "dist/media/*.d.ts",
    "dist/native/*.d.ts",
    "dist/observe/*.d.ts",
    "dist/observe/targets/*.d.ts",
    "dist/protocol/*.d.ts",
    "docs/usage.md",
    "docs/cli.md",
    "docs/development/repository.md",
    "docs/development/rfcs/README.md",
    "docs/development/rfcs/index.md",
    "docs/development/rfcs/rfc-0007-app-identity-and-icon-distribution.md",
    "docs/development/rfcs/rfc-0008-model-agnostic-agent-loop.md",
    "docs/development/rfcs/rfc-0010-multimodal-evidence-and-session-video.md",
    "docs/development/rfcs/implemented/README.md",
    "docs/development/rfcs/implemented/rfc-0001-swift-package-structure-and-semantics.md",
    "docs/development/rfcs/implemented/rfc-0002-soak-regime-and-run-ledger.md",
    "docs/development/rfcs/implemented/rfc-0003-execution-waterfall-reporting.md",
    "docs/development/rfcs/implemented/rfc-0004-aggregate-soak-reporting-and-indexing.md",
    "docs/development/rfcs/implemented/rfc-0005-npm-package-delivery.md",
    "docs/development/rfcs/implemented/rfc-0006-apple-distribution-signing-and-notarization.md",
    "docs/development/rfcs/implemented/rfc-0009-public-typescript-api-and-cli-semantics.md",
    "README.md",
  ],
  os: ["darwin"],
  cpu: ["arm64"],
};
