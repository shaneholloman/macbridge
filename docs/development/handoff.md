# Development Handoff

This document preserves current project context for future sessions. Read this
before continuing package, distribution, or build-system work.

## Current State

MacBridge is a greenfield native macOS adapter for TypeScript-first agent
systems. The current product shape is:

- CLI application: `macbridge`
- TypeScript library package: `macbridge`
- Native Swift library module: `MacBridgeCore`
- Future SDK once the TypeScript API becomes stable and domain-shaped

Do not call the TypeScript layer an SDK yet. It is currently a small library
wrapper around the CLI plus shared types. SDK language becomes accurate once
the public API exposes intentional domain operations such as `displays.list()`,
`capture.display()`, `windows.list()`, or `act.window().click()`.

The repo should be renamed to `macbridge` after the current session. Do not
commit local absolute checkout paths into source or docs.

## Active RFCs

Active RFCs live in `docs/development/rfcs/` and are intentionally not
implemented yet:

- `RFC-0005: NPM Package Delivery`
- `RFC-0006: Apple Distribution Signing and Notarization`

Implemented RFCs live in `docs/development/rfcs/implemented/`.

Never mark an RFC `Implemented` until its implementation is complete and tested
end to end. After a tested RFC is marked implemented, run:

```sh
bun run rfc:sync
```

This moves implemented RFCs, regenerates the RFC index, and refreshes README
RFC links.

## Build-System Direction

The next major body of work is to add a first-class `build/` module. Avoid
turning package and release work into many independent package scripts. The
build pipeline should be treated as product code with typed modules, manifests,
logs, target definitions, and verification commands.

The intended shape is:

```text
build/
  README.md
  cli.ts
  commands/
  native/
  npm/
  apple/
  runtime/
```

Use the Aria build system as the conceptual pattern:

- `build/cli.ts` as the canonical command surface
- `build/runtime/targets.ts` for target definitions
- `build/runtime/manifest.ts` for run manifests and history
- `build/runtime/log.ts` for timed build output
- `build/runtime/runner.ts` for command execution
- Apple signing/notary code isolated from npm packaging

Keep `package.json` scripts thin wrappers over `build/cli.ts`.

## Recommended Next Order

1. Rename the checkout directory to `macbridge`.
2. Reopen a fresh session and read:
   - `AGENTS.md`
   - `SKILL.md`
   - this handoff
   - `docs/development/rfcs/rfc-0005-npm-package-delivery.md`
   - `docs/development/rfcs/rfc-0006-apple-distribution-signing-and-notarization.md`
3. Run the baseline gate:

   ```sh
   bun run check
   bun run soak:smoke
   ```

4. Continue RFC-0005 only for issues found by package verification.
5. Start RFC-0006 now that the build module stages native release artifacts
   into `dist/bin` and `check:pack` verifies the npm package locally.

## Current Verification Commands

Use these before commits:

```sh
bun run check
```

Use these for soak confidence:

```sh
bun run soak:smoke
bun run soak:burn
bun run soak:stress
bun run soak:tui
```

Generated soak artifacts are local and ignored:

- `soak/runs/`
- `soak/reports/latest.md`
- `soak/reports/latest.json`
- `soak/reports/index.db`

## Publication Notes

The npm package name `macbridge` was checked during this work and was available
at that time. Re-check before publishing.

RFC-0005 should produce an npm package that includes:

- TypeScript entrypoint and declarations
- npm `bin` entry for `macbridge`
- macOS platform metadata
- explicit `files`
- packed package verification in a temporary consumer project

RFC-0006 should produce signed and notarized macOS binaries:

- `dist/bin/macbridge-darwin-arm64`
- `dist/bin/macbridge-darwin-x64`

Signing credentials, keychains, Apple IDs, app-specific passwords, and API keys
must never be committed.

## Cleaned-Up Decisions

The old examples regime was removed. Executable validation now belongs to
`soak/`; lightweight manual flows remain in the README.

The old RFC-0001 proof checker was removed. The durable gates are now:

- `bun run check`
- `bun run rfc:check`
- `bun run soak:smoke`

The current repository should remain free of the old experimental directory
name.

## Capture Semantics

Keep target/window capture and display capture semantically distinct. A
`targetScreenshot` is a cropped target artifact for app reasoning and
window-local coordinates. A `displayScreenshot` is a full monitor sanity check
that may include menu bar, Dock, translucent window chrome, or unrelated apps.
Do not collapse these concepts into a generic `screenshot` field in public
TypeScript APIs or observation artifacts.

## Build Directory Convention

`build/` is source code for MacBridge release and packaging orchestration.
Generated SwiftPM build state should not live under `native/swift/.build` when
using repository-managed commands. Use `tmp/swiftpm` as the SwiftPM scratch path
so `native/swift/` remains source-only and `dist/` remains the generated package
artifact tree.
