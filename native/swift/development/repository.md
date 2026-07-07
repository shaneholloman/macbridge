# Repository Development

This repository keeps product code and workflow code in separate places:

- `src/`: TypeScript package, product CLI, agent harness, and SDK surface.
- `native/swift/`: Swift Package Manager project for the native macOS adapter.
- `build/`: checked-in build, package, release, RFC, and repository workflow code.
- `soak/`: source for smoke, burn, stress, TUI, and aggregate reporting.
- `docs/`: user, architecture, and development documentation.

`tools/` must not exist. Product behavior belongs in `src/`; repository
workflow belongs in `build/`.

## Build

```bash
bun run build:native
```

Repository-managed SwiftPM output uses:

```text
tmp/swiftpm/
```

Do not rely on `native/swift/.build` for repo workflows.

## Checks

Run the full gate before committing:

```bash
bun run check
```

Narrow checks:

```bash
bun run check:ts
bun run check:pack
bun run test:native
```

`check:pack` builds the Apple Silicon macOS binary, packs the npm tarball,
installs it into a temporary consumer project, imports the package with Node,
type-checks a TypeScript consumer, runs the installed CLI, and performs a
capture smoke when Screen Recording permission is available.

## Distribution Artifacts

- `dist/`: generated package artifacts, manifests, and npm tarballs.
- `tmp/`: local scratch space.
- `~/macbridge/soak/runs/`: durable local soak run evidence.
- `~/macbridge/soak/reports/`: durable local aggregate soak reports and index.

Generated soak state lives outside the repository so the native app, npm CLI,
and Bun development commands all read the same ledger. Set
`MACBRIDGE_SOAK_ROOT` only when a test or advanced workflow needs an isolated
run store.

Generated artifacts are local and ignored.

## RFC Workflow

Architecture decisions live under:

```text
docs/development/rfcs/
```

Use:

```bash
bun run rfc:check
bun run rfc:sync
```

Implemented RFCs live under `docs/development/rfcs/implemented/`.
