---
id: RFC-0006
name: Apple Distribution Signing and Notarization
status: Implemented
owners:
    - MacBridge maintainers
created: 2026-05-02
updated: 2026-05-02
supersedes: []
superseded_by: null
---

# Apple Distribution Signing and Notarization

## Summary

MacBridge release binaries for macOS will be built, signed with Developer ID,
notarized through Apple's notary service, verified locally, and then handed to
the npm packaging flow. Signing and notarization should be treated as a first
class build subsystem, not as ad hoc release commands.

## Implementation Status

Apple distribution is implemented as a first-class build subsystem:

- `bun build/cli.ts native` stages the `darwin-arm64` Swift release binary into
  `dist/bin`.
- `bun build/cli.ts apple sign` signs staged binaries with Developer ID and
  hardened runtime.
- `bun build/cli.ts apple notarize` submits standalone binary archives with
  `xcrun notarytool`, stores accepted notary evidence under
  `dist/build/security`, and keeps upload archives under ignored `tmp/notary`.
- `bun build/cli.ts apple verify` checks signatures, signature metadata,
  accepted notary evidence, `--help`, and `permissions check` for each target.
- `bun build/cli.ts release` runs the full native, signing, notarization,
  Apple verification, and signed npm package verification flow.
- Build manifests, command logs, timings, checksums, package reports, and
  notary evidence are written under `dist/build`.
- `macbridge permissions check [--prompt] [--require]` reports Accessibility
  and Screen Recording TCC state from the native binary.

## Context

MacBridge ships native macOS automation code that uses Accessibility,
CoreGraphics, AppKit, and ScreenCaptureKit. Users should not have to fight
Gatekeeper or make trust decisions around an unsigned binary downloaded through
npm.

Apple's distribution guidance for software outside the Mac App Store centers on
Developer ID signing and notarization. For MacBridge, this is product quality:
the binary is a native automation adapter that will be launched by agent
harnesses and may be installed into many developer environments.

This RFC is separate from RFC-0005 because Apple signing has different concerns:
certificates, keychains, hardened runtime, entitlements, notary credentials,
architecture targets, and security evidence. The npm package should consume the
results, not own the signing process.

## Goals

- Build release binaries for `darwin-arm64`.
- Sign release binaries with a Developer ID Application identity.
- Enable hardened runtime where appropriate.
- Submit signed release artifacts to Apple's notary service with
  `xcrun notarytool`.
- Verify signatures and notarization status before npm packaging.
- Provide a native permission sanity check for Accessibility and Screen
  Recording so signed binaries can report whether macOS privacy grants are in
  place.
- Store build logs, manifests, checksums, and notarization records under
  `dist/build`.
- Keep signing credentials outside the repository.
- Make unsigned local development builds easy while making unsigned release
  artifacts impossible to publish accidentally.

## Non-Goals

- Enrolling in the Apple Developer Program as part of this repository change.
- Storing signing identities, passwords, API keys, or keychain files in Git.
- Shipping a `.app`, `.dmg`, or `.pkg` in the initial npm release.
- Defining npm package metadata; that belongs to RFC-0005.
- Supporting non-macOS release targets.

## Proposal

Add Apple distribution support under the build module:

```text
build/
  apple/
    codesign.ts
    notary.ts
    verify.ts
  native/
    swift.ts
    targets.ts
  runtime/
    evidence.ts
    manifest.ts
    paths.ts
    runner.ts
```

Release artifacts should be staged into:

```text
dist/
  bin/
    macbridge-darwin-arm64
  build/
    latest.json
    manifests/
    logs/
    security/
    timings/
```

The build command should support a clear local/release split:

```bash
bun build/cli.ts native --target darwin-arm64
bun build/cli.ts apple sign --target darwin-arm64
bun build/cli.ts apple notarize --target darwin-arm64
bun build/cli.ts apple verify --target darwin-arm64
```

The exact command names may change during implementation, but the ownership
should not: Apple distribution belongs to the build module.

Expected release flow:

1. Build a Swift release binary for the Apple Silicon target.
2. Copy the binary into `dist/bin/macbridge-<target>`.
3. Sign the binary with `codesign`.
4. Verify the signature with `codesign --verify`.
5. Create a notarization upload container for the signed binary.
6. Submit with `xcrun notarytool`.
7. Record the submission ID and final status.
8. Verify the final artifact with local assessment commands.
9. Emit checksums and a build manifest.
10. Run `macbridge permissions check` with the signed binary.
11. Hand the verified binary paths to RFC-0005 packaging.

Configuration should come from environment variables or local ignored files:

- `MACBRIDGE_SIGN_IDENTITY`
- `MACBRIDGE_NOTARY_PROFILE`
- `MACBRIDGE_NOTARY_KEYCHAIN`

Release-producing build commands should notarize their outputs and refuse
skip-notarization shortcuts.

The local machine may already have the Aria Developer ID setup in Keychain. The
MacBridge build defaults can use the non-secret identity/profile names from
that setup:

- `Developer ID Application: Shane Holloman (N68C9LUA5B)`
- `aria-notarytool`

Do not commit app-specific passwords, exported private keys, keychains, or local
credential files.

MacBridge initially ships standalone Mach-O binaries rather than `.app`, `.pkg`,
or `.dmg` artifacts. Standalone binaries can be notarized but cannot be stapled;
macOS checks Apple's notary service online on first launch and then caches the
result. Accessibility and Screen Recording are macOS TCC privacy grants, not
entitlements, so the signed binary must expose `permissions check` for runtime
sanity.

The build module may borrow Aria's ideas for notary preflight, retrying,
polling, manifest capture, and keychain-profile diagnostics, but should use
MacBridge-specific names and a smaller surface.

## Alternatives Considered

- Ship unsigned binaries through npm.
  This would be easier, but it creates avoidable trust and Gatekeeper problems
  for a native automation tool.

- Rely on postinstall source builds instead of distributed binaries.
  This avoids signing distribution artifacts but makes user installation depend
  on Swift tooling and local build success.

- Put signing commands directly in `package.json`.
  This is rejected because signing needs structured configuration, manifests,
  evidence, and careful failure handling.

- Defer notarization until after the first npm release.
  This may be acceptable for private testing but should not be the default for a
  public package.

## Security Impact

Signing and notarization reduce user trust friction and provide evidence that
release binaries came from the MacBridge maintainer identity and passed Apple's
notary checks. This does not make the software harmless; MacBridge still
performs permission-sensitive automation and must document Accessibility and
Screen Recording requirements clearly.

Secrets must never be committed. The build module should fail with actionable
messages when signing identities or notary credentials are unavailable.

## Reliability Impact

Release reliability improves when every binary has a manifest entry, checksum,
signature verification result, and notarization record. Failures should preserve
logs and partial manifests so the release can be diagnosed without guesswork.

The build should distinguish between:

- local unsigned development builds
- signed but not notarized internal builds
- signed and notarized release builds

Only the final category should be accepted by npm package verification for
public release.

## Compatibility Impact

The first release targets are:

- `darwin-arm64`

Unsupported platforms should fail clearly before attempting native execution.

If universal binaries are considered later, that decision should be captured in
a follow-up RFC because it changes artifact size, build mechanics, and signing
expectations.

## Testing and Quality Gates

- `bun run check`
- `bun run soak:smoke`
- build the supported Apple Silicon target
- `codesign --verify --strict --verbose=2 <binary>`
- inspect signature metadata with `codesign -dv --verbose=4 <binary>`
- submit notarization upload with `xcrun notarytool`
- verify final notary status is accepted
- verify accepted notary evidence for each standalone binary
- run `dist/bin/macbridge-<target> --help`
- run `dist/bin/macbridge-<target> permissions check`
- run `dist/bin/macbridge-<target> displays list`

## Rollout Plan

1. Add build target definitions for macOS release binaries.
2. Add local native staging into `dist/bin`.
3. Add codesign support and verification.
4. Add notary preflight, submit, polling, and evidence capture.
5. Add final artifact checksums and build manifests.
6. Connect verified binaries into the npm packaging RFC.
7. Run the full signed/notarized flow before marking this RFC implemented.

## Open Questions

- Should notarization use a saved keychain profile, App Store Connect API key,
  or both?
  Decision: default to the saved keychain profile `aria-notarytool`, with
  `MACBRIDGE_NOTARY_PROFILE` and `MACBRIDGE_NOTARY_KEYCHAIN` overrides.
- Should the npm package include Intel or universal binaries?
  Decision: no. MacBridge supports Apple Silicon Macs only so package size,
  build time, signing, and testing stay focused on the intended audience.
- What entitlements, if any, are needed for the CLI under hardened runtime?
  Decision: no committed entitlements are needed for the current standalone CLI.
  Accessibility and Screen Recording are TCC grants, handled by
  `permissions check`.
- Should direct-download `.pkg` or `.dmg` artifacts be added after npm
  publication is stable?
  Decision: defer app/pkg/dmg distribution to a follow-up RFC.
