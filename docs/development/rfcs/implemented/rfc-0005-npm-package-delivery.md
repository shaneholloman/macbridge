---
id: RFC-0005
name: NPM Package Delivery
status: Implemented
owners:
    - MacBridge maintainers
created: 2026-05-02
updated: 2026-05-02
supersedes: []
superseded_by: null
---

# NPM Package Delivery

## Summary

MacBridge will become a publishable npm package named `macbridge` that delivers
the TypeScript harness API and the native macOS CLI as one coherent product.
The package should be designed as a reusable adapter for TypeScript-first agent
systems, while leaving room for a richer SDK surface as the API matures.

## Implementation Status

Package delivery is implemented for local and signed release artifacts:

- `build/cli.ts` owns the `dist`, `pack`, and `verify` command surface.
- `src/index.ts` is the public TypeScript package entrypoint.
- `dist/bin/macbridge` is a JavaScript npm launcher that selects the native
  binary by `process.platform` and `process.arch`.
- `dist/bin/macbridge-darwin-arm64` and `dist/bin/macbridge-darwin-x64` are
  staged by the build module.
- `bun run check:pack` packs the local package, validates package metadata and
  tarball contents, installs into a temporary consumer project, imports with
  Node, type-checks a TypeScript consumer, runs installed CLI commands, and
  performs a capture smoke when permissions are available.
- `bun run build:release` builds both macOS targets, signs them with Developer
  ID, notarizes them with Apple, verifies the signed binaries, packs from the
  signed `dist`, and reruns package installation checks with signed artifacts
  required.
- Package verification records metadata, tarball contents, checksums, logs,
  timings, notarization evidence, CLI smoke checks, and consumer import/type
  checks under `dist/build`.

## Context

The package name `macbridge` is currently available on npm. MacBridge is
greenfield, but the repository is already moving toward a reusable product:
Swift owns native macOS capabilities, TypeScript owns harness ergonomics, and
the soak regime owns executable confidence.

The next risk is build and release drift. A native npm package can easily become
a bag of `package.json` scripts, postinstall hooks, copied binaries, and manual
release notes. Aria avoids this by treating `build/` as a first-class module
with command dispatch, target definitions, artifact manifests, logs, and
packaging contracts. MacBridge should adopt the same mental model early.

MacBridge should be described as:

- a native macOS adapter product
- a CLI application named `macbridge`
- a TypeScript library package named `macbridge`
- a future SDK when the TypeScript API becomes intentionally stable and
  domain-shaped beyond process wrapping

## Goals

- Publish `macbridge` as an npm package for macOS users.
- Keep the package Bun-first for repository development and release tooling.
- Expose a stable TypeScript entrypoint with declarations.
- Expose a `macbridge` CLI binary through npm `bin`.
- Include signed native binaries produced by the distribution build.
- Add a first-class `build/` module rather than accumulating release scripts.
- Produce machine-readable build manifests and package contents reports.
- Verify packed package installation in a throwaway consumer project before any
  publish.

## Non-Goals

- Publishing the package before end-to-end package installation is proven.
- Supporting Linux or Windows in the initial npm package.
- Replacing the Swift CLI with a native Node/Bun binding.
- Defining the final SDK API shape in this RFC.
- Handling Apple signing and notarization details; that belongs to RFC-0006.

## Proposal

Add a MacBridge build module inspired by Aria's `build/` architecture:

```text
build/
  README.md
  cli.ts
  commands/
    dist.ts
    pack.ts
    verify.ts
  npm/
    manifest.ts
    package.ts
    wrapper.ts
  native/
    swift.ts
    targets.ts
  runtime/
    log.ts
    manifest.ts
    paths.ts
    runner.ts
```

The build module should own release orchestration. `package.json` scripts should
be thin entrypoints into this module:

```json
{
  "scripts": {
    "build:dist": "bun build/cli.ts dist",
    "pack:npm": "bun build/cli.ts pack",
    "check:pack": "bun build/cli.ts verify"
  }
}
```

The npm package should emit a compact distribution layout:

```text
dist/
  index.js
  index.d.ts
  bin/
    macbridge
    macbridge-darwin-arm64
    macbridge-darwin-x64
  build/
    latest.json
    manifests/
    logs/
```

`dist/bin/macbridge` should be a small JavaScript or shell-compatible launcher
that chooses the correct native binary for `process.platform` and
`process.arch`. The TypeScript wrapper should resolve the packaged binary by
default, while still allowing callers to override the binary path.

The package metadata should include:

- `name: "macbridge"`
- `private: false`
- `type: "module"`
- `exports`
- `types`
- `bin`
- `files`
- `os: ["darwin"]`
- `cpu: ["arm64", "x64"]`
- `license`
- `repository`
- `bugs`
- `homepage`
- `keywords`

The initial TypeScript API should remain small and honest:

- command execution helpers
- typed JSON helpers
- binary path resolution
- shared result and domain types

MacBridge should be called an SDK only once the TypeScript API provides stable,
intentional domain operations such as `displays.list()`, `capture.display()`,
`windows.list()`, or `act.window().click()`. Until then, it is a library package
and CLI distribution with SDK-compatible direction.

## Alternatives Considered

- Keep the repository private and source-only.
  This avoids release complexity but does not support reuse across Aria and
  other harnesses.

- Publish TypeScript only and build Swift on postinstall.
  This keeps the package small but creates a fragile user install path because
  users need Swift tooling and a working local build environment.

- Publish only a CLI binary with no TypeScript entrypoint.
  This is simpler but underserves TypeScript-first agent harnesses.

- Add many direct `package.json` release scripts.
  This is rejected because release orchestration should be a typed module with
  manifests, logs, target contracts, and tests.

## Security Impact

The npm package will distribute executable native macOS code. Package contents
must be explicit through `files`, and generated package manifests should record
all emitted binaries and checksums. The package must not include local soak
runs, screenshots, `.build`, credentials, or notarization secrets.

The native binary signing and notarization process is covered by RFC-0006, but
RFC-0005 must consume only signed release artifacts once that RFC is
implemented.

## Reliability Impact

A build module improves release reliability by making targets, artifact paths,
logs, and manifests explicit. Package verification should install the packed
tarball into a temporary consumer project and run:

- importing the TypeScript entrypoint
- resolving the native binary
- `macbridge --help`
- `macbridge displays list`
- a smoke capture when permissions are available

Build manifests should make failures inspectable without rerunning the entire
pipeline.

## Compatibility Impact

The npm package should be macOS-only at first. Runtime checks should fail with a
clear message on unsupported platforms. The CLI grammar remains the same as the
native `macbridge` binary.

The TypeScript wrapper API is not yet a stable SDK contract. Before publishing
`1.0`, public exports must be reviewed and documented as compatibility-bearing
surface area.

## Testing and Quality Gates

- `bun run check`
- `bun run soak:smoke`
- `bun run build:dist`
- `bun run pack:npm`
- `bun run check:pack`
- inspect generated npm tarball contents
- install packed tarball into a temporary consumer project
- run `macbridge --help` from the installed package
- import the TypeScript entrypoint from the installed package

## Rollout Plan

1. Draft the build module structure and npm package contract.
2. Add TypeScript build output and package metadata.
3. Add native binary staging into `dist/bin`.
4. Add npm pack and install verification.
5. Consume signed/notarized binaries from RFC-0006.
6. Publish a prerelease only after package install verification passes.

## Open Questions

- Should the first public release be `0.1.0` or an npm prerelease tag?
  Decision: keep the package version at `0.1.0` for local package verification.
  Use an npm prerelease tag such as `next` for any public release before the
  signing/notarization flow has run end to end.
- Should `dist/bin/macbridge` be JavaScript for portability inside npm, or a
  shell script for simplicity on macOS?
  Decision: use JavaScript so npm `bin` launching, unsupported-platform errors,
  and architecture selection are handled in one portable launcher.
- Should packed package verification use Bun only, or also prove Node import
  compatibility for downstream harnesses that are not Bun-first?
  Decision: prove Node import compatibility and TypeScript consumer compilation
  in addition to Bun-driven repository tooling.
- What public TypeScript functions are compatibility-bearing before `1.0`?
  Decision: only exports from `src/index.ts` are public. The initial surface is
  `run`, `runJSON`, `defaultBin`, `packagedBin`, `resolveDefaultBin`,
  `ensureExecutable`, `envString`, `envNumber`, `sleep`, and the shared
  `Json`, `RunOptions`, `RunResult`, and `WindowInfo` types.
