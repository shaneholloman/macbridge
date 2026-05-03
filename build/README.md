# MacBridge Build

The build module owns distribution orchestration for MacBridge. Package scripts
should stay thin and call `build/cli.ts`; build behavior belongs here as typed
product code.

Current commands:

```bash
bun build/cli.ts app
bun build/cli.ts dist
bun build/cli.ts native
bun build/cli.ts pack
bun build/cli.ts pkg --from-dist
bun build/cli.ts verify
bun build/cli.ts release
bun build/cli.ts apple sign
bun build/cli.ts apple sign-app
bun build/cli.ts apple notarize
bun build/cli.ts apple notarize-app
bun build/cli.ts apple verify
```

`dist` builds the TypeScript entrypoint, emits declarations, generates the npm
CLI launcher, builds and stages native binaries, generates `MacBridge.icns`,
assembles the Apple Silicon `MacBridge.app` bundle, and writes a build manifest.
The supported target is `darwin-arm64`.

`app` rebuilds the app bundles. Without `--from-dist`, it delegates to `dist`.
With `--from-dist`, it reuses the staged native binaries; this is used by
release signing so the app bundle receives the signed native executable.

`pack` runs `dist`, creates the npm tarball, records package contents, and
updates the manifest.

`pkg --from-dist` builds a signed and notarized Apple Silicon macOS installer
package. The installer places `MacBridge.app` in `/Applications` and a
small `macbridge` shim in `/usr/local/bin`.

`verify` runs `pack`, installs the tarball into a temporary consumer project,
imports the TypeScript entrypoint with Node, type-checks a TypeScript consumer,
validates package metadata and tarball contents, exercises the packaged CLI,
and runs a capture smoke when Screen Recording permission is available.

`release` runs distribution staging, Developer ID signing, app bundle staging,
app signing, standalone/app/pkg notarization, Apple verification, installer
packaging, and signed package verification without rebuilding over the signed
binaries.

Icon generation uses `rsvg-convert` and `iconutil`; install librsvg locally if
`rsvg-convert` is missing.

Apple distribution commands use environment configuration and never read
credentials from committed files:

- `MACBRIDGE_SIGN_IDENTITY`
- `MACBRIDGE_INSTALLER_IDENTITY`
- `MACBRIDGE_NOTARY_PROFILE`
- `MACBRIDGE_NOTARY_KEYCHAIN`

Release-producing build commands are expected to notarize their outputs. The
build rejects skip-notarization flags for app shell and installer package
artifacts.
