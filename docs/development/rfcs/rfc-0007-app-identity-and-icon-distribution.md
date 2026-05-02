---
id: RFC-0007
name: App Identity and Icon Distribution
status: In Progress
owners:
    - MacBridge maintainers
created: 2026-05-02
updated: 2026-05-02
supersedes: []
superseded_by: null
---

# App Identity and Icon Distribution

## Summary

MacBridge should gain an intentional macOS product identity, including a stable
bundle identifier and official icon, so permission prompts and System Settings
entries are recognizable to users. This should be treated as a distribution
shape decision, not as a decorative asset task.

## Context

MacBridge is currently distributed as standalone signed Mach-O binaries inside
an npm package. That is appropriate for TypeScript-first agents, but macOS
privacy prompts are user-facing product moments. If the requesting process
appears as a terminal, a generic executable, or an unfamiliar helper, users are
less likely to understand why Accessibility or Screen Recording is needed.

Apple's signing guidance allows single-file tools to carry an `Info.plist` with
keys such as `CFBundleIdentifier` and `CFBundleName`. Apple's bundle resource
keys also define `CFBundleIconFile` for an app icon resource. A standalone CLI
can have code-signing identity, but an icon is most reliable and visible when
MacBridge ships an app bundle or launcher bundle with `Contents/Resources`.

This RFC exists because "add an icon" has two different meanings:

- a brand asset for documentation and package pages
- a macOS bundle identity that can appear clearly in permission UIs

MacBridge needs both, but the second one affects signing, notarization,
packaging, and TCC user experience.

## Goals

- Establish a stable MacBridge bundle identifier strategy.
- Add an official MacBridge icon source and generated `.icns` artifact.
- Decide whether permission-sensitive user flows should be launched through a
  `MacBridge.app` bundle, the standalone npm CLI, or both.
- Preserve the npm CLI workflow for agents and automation.
- Make TCC prompts and System Settings entries understandable to non-expert
  users.
- Add release verification for product identity, icon resources, signing, and
  notarization.

## Non-Goals

- Requesting or bypassing macOS permissions automatically.
- Shipping a menu bar app, full GUI, updater, or installer in the first pass.
- Moving TypeScript agent integration out of npm.
- Replacing the signed standalone CLI before the app-bundle path is proven.

## Proposal

Treat product identity as a staged distribution surface:

1. Add a canonical icon source under `assets/icon/`.
2. Generate `MacBridge.icns` during the build from checked-in source assets.
3. Add bundle metadata for MacBridge:
   - `CFBundleIdentifier`: `nz.uic.macbridge`
   - `CFBundleName`: `MacBridge`
   - `CFBundleDisplayName`: `MacBridge`
   - `CFBundleExecutable`: `macbridge-shell`
   - `CFBundleIconFile`: `MacBridge`
4. Add target-specific `MacBridge.app` release artifacts under
   `dist/darwin-arm64/MacBridge.app` and
   `dist/darwin-x64/MacBridge.app`.
5. Embed or copy the signed native adapter into each app bundle at
   `Contents/MacOS/macbridge`. Keep the rebranded terminal host as the internal
   `Contents/MacOS/macbridge-shell` executable so the public `macbridge` name
   always means the adapter command.
6. Sign nested code first, then sign the app bundle.
7. Notarize the app bundle in addition to the standalone binaries.
8. Keep standalone npm package binaries available for fallback verification,
   but have the npm wrapper prefer the app-bundled executable.
9. When the app-bundled executable is launched from Finder without arguments,
   open Terminal with a first-run `permissions check --prompt` command.

The build module should own this shape:

```text
build/
  apple/
    app.ts
    icon.ts
  assets/
    icon/
```

Potential commands:

```bash
bun build/cli.ts app
bun build/cli.ts apple sign-app
bun build/cli.ts apple notarize-app
bun build/cli.ts apple verify-app
```

The exact command names can change, but the build output should make the app
bundle's identity auditable through `Info.plist`, `codesign`, and generated
manifests.

## Alternatives Considered

- Only add a PNG or SVG to the README.
  This helps branding but does not improve macOS permission identity.

- Only embed an `Info.plist` into the standalone CLI.
  This may improve code-signing identity, but it does not provide a reliable
  icon resource story for System Settings.

- Force all usage through `MacBridge.app`.
  This would improve user-facing identity, but it would make TypeScript agent
  integration more awkward and less Unix-like.

- Keep the current CLI-only distribution forever.
  This is simplest, but it asks users to trust permission prompts that may not
  clearly look like MacBridge.

## Security Impact

The app bundle must not expand MacBridge's privileges. Accessibility and Screen
Recording remain explicit TCC grants. The product should continue to expose
`permissions check` and fail clearly when grants are absent.

Signing must preserve distinct identities where appropriate. If MacBridge ships
both an app and helper tools, each component should have an intentional signing
identifier, and any shared designated requirement should be a deliberate choice
rather than a side effect.

## Reliability Impact

An app bundle adds release complexity: bundle layout, icon generation,
resource sealing, nested signing, notarization, and verification. The payoff is
clearer user trust and more stable permission identity. Build manifests should
record app bundle paths, icon checksums, `Info.plist` values, signature
verification, and notarization evidence.

## Compatibility Impact

The npm package remains the primary automation install path. Adding a
`MacBridge.app` artifact should be additive. If future releases route npm users
through the app bundle for permission-sensitive launch, that behavior must be
documented and gated by explicit verification.

## Testing and Quality Gates

- `bun run check`
- `bun run soak:stress:live`
- `bun soak/src/cli.ts burn --live-textedit`
- Verify `Info.plist` values with `plutil`.
- Verify `.icns` exists and is included under `Contents/Resources`.
- Verify app bundle signing with `codesign --verify --deep --strict --verbose=2`.
- Verify app bundle signature metadata with `codesign -dv --verbose=4`.
- Notarize the app bundle and record accepted evidence.
- Run `MacBridge.app/Contents/MacOS/macbridge permissions check --require`.
- Manually reset TCC on a disposable test machine and verify the user-facing
  permission entries are understandable before public release.

## Rollout Plan

1. Add this RFC and document the product identity decision.
2. Add icon source assets and deterministic `.icns` generation.
3. Add app bundle staging under `dist/app`.
4. Add app signing, notarization, and verification commands.
5. Run live stress and burn soaks from the app-bundled executable.
6. Decide whether npm should continue shipping only standalone binaries or also
   include the app bundle.

## Open Questions

- Should `MacBridge.app` be a normal app bundle, a background-only `LSUIElement`
  app, or a launcher bundle that delegates to the CLI?
- Should the npm package include the app bundle, or should app distribution be a
  separate direct-download artifact?
- Should standalone CLI binaries also embed an `Info.plist` for a stable
  signing identifier?
- Do we need a small permission onboarding UI later, or is `permissions check`
  sufficient for the first public package?
