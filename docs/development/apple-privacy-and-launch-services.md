# Apple Privacy and Launch Services Notes

This note documents the MacBridge permission failure from 2026-05-03 so future
packaging work does not repeat it.

## Symptom

`/Applications/MacBridge.app` was signed, notarized, stapled, and accepted by
Gatekeeper, but macOS Privacy & Security would not reliably add it to
Accessibility. Dragging the app into the Accessibility list appeared to do
nothing. Other apps, including Aria apps, could be added normally.

Accessibility eventually worked after Launch Services was repaired. Screen
Recording still did not auto-add from the permission button in this pass; it
could be granted only after manually dragging `MacBridge.app` into Screen
Recording. Treat that as a separate first-run workflow issue.

When the permissions are healthy, the About window should look like this:

![MacBridge permissions accepted](images/macbridge-permissions-accepted.png)

## What Was Tried and Failed

Signing and notarization changes did not solve it. The app already had the
right Developer ID Application signature, hardened runtime, stapled
notarization ticket, and Gatekeeper acceptance.

Changing Apple credentials did not solve it. The failure was not caused by the
Apple account, notary profile, app-specific password, Team ID, or certificate.

Changing bundle naming between `macbridge`, `macbridge-runtime`, and
`MacBridge.app` did not solve it. Some names were confusing, but the immediate
failure was not a binary-name collision.

Raw deletion from the system TCC database was not reliable from a normal build
process. macOS can report the system database as read-only even when attempting
to write through `sudo sqlite3`.

Running broad TCC cleanup on every build made the situation worse. It removed
the very permission state being tested and made it hard to distinguish a real
macOS failure from our own cleanup.

Creating temporary `.app` shims during every installer preinstall was a bad
tradeoff. The shim trick can help `tccutil reset` resolve a deleted legacy
bundle ID, but doing it repeatedly for current and legacy IDs created fragile
Launch Services state.

Post-build "clean room" teardown was actively harmful. It removed
`/Applications/MacBridge.app`, deleted MacBridge TCC rows, killed `tccd`, and
unregistered app paths after successful builds. That is the opposite of what a
human permission test needs.

## Actual Cause

Launch Services had multiple app records claiming the MacBridge identity. The
real installed app was present, but the Launch Services database also contained
stale entries for repo build outputs and deleted temporary TCC reset shims.

The critical duplicates looked like:

```text
/Applications/MacBridge.app
/Users/.../macbridge/dist/darwin-arm64/MacBridge.app
/Users/.../macbridge/dist/pkg/darwin-arm64/payload/Applications/MacBridge.app
/Users/.../macbridge/tmp/ghostty/zig-out/MacBridge.app
/Applications/MacBridge TCC Reset nz-uic-macbridge.app
/Applications/MacBridge TCC Reset com-shaneholloman-macbridge-arm64.app
```

Several of those records claimed `nz.uic.macbridge`. When System Settings tried
to add `MacBridge.app` to Accessibility, it resolved the bundle identifier
through Launch Services. If Launch Services returned a deleted shim or stale
build copy instead of `/Applications/MacBridge.app`, TCC could not create a
valid code-signing requirement for the dropped app and the UI silently refused
to add it.

Aria worked because its bundle ID resolved to the real app. MacBridge failed
because its bundle ID resolved ambiguously.

## The Solve

The source fix was to stop poisoning Launch Services and TCC during ordinary
builds and installs:

- `build/cli.ts` no longer wraps build commands in before/after
  `cleanMacBridgeRegistrations()`.
- The Ghostty shell build no longer runs registration cleanup after a
  successful build.
- The package preinstall no longer creates temporary TCC reset apps on every
  install.
- The package postinstall explicitly registers the final installed app:

```sh
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -f /Applications/MacBridge.app
```

The machine-state recovery was:

1. Unregister stale MacBridge app paths while they still existed where
   possible.
2. Recreate any missing legacy shim only long enough for Launch Services to
   resolve it.
3. Run `tccutil reset` for the stale legacy bundle ID.
4. Unregister the shim while it still existed.
5. Delete the shim.
6. Register only `/Applications/MacBridge.app`.
7. Kill `tccd` and quit System Settings so the Privacy UI reopened with fresh
   state.

The final Launch Services sanity check showed only:

```text
path:       /Applications/MacBridge.app
identifier: nz.uic.macbridge
```

Both user and system TCC queries returned no MacBridge rows before the fresh
permission test.

## Useful Diagnostics

Inspect Launch Services records that mention MacBridge:

```sh
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -dump | rg -i 'macbridge|nz\.uic\.macbridge'
```

Check Spotlight bundle resolution:

```sh
mdfind 'kMDItemCFBundleIdentifier == "nz.uic.macbridge"'
```

Check user TCC rows:

```sh
sqlite3 "$HOME/Library/Application Support/com.apple.TCC/TCC.db" \
  "select service,client,client_type,auth_value,auth_reason,auth_version
   from access
   where lower(client) like '%macbridge%'
   order by service,client;"
```

Check system TCC rows:

```sh
sqlite3 "/Library/Application Support/com.apple.TCC/TCC.db" \
  "select service,client,client_type,auth_value,auth_reason,auth_version
   from access
   where lower(client) like '%macbridge%'
   order by service,client;"
```

Verify installed app identity:

```sh
plutil -p /Applications/MacBridge.app/Contents/Info.plist |
  rg 'CFBundle(Identifier|ShortVersionString|Version|Executable)|CFBundleName'

codesign --verify --deep --strict --verbose=2 /Applications/MacBridge.app
spctl --assess -vvv --type execute /Applications/MacBridge.app
```

## Safe Recovery Procedure

Use this only when Launch Services is known to contain stale MacBridge entries.

First unregister known stale paths:

```sh
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

"$LSREGISTER" -u /Users/shaneholloman/git/sources/shaneholloman/macbridge/dist/darwin-arm64/MacBridge.app
"$LSREGISTER" -u /Users/shaneholloman/git/sources/shaneholloman/macbridge/dist/pkg/darwin-arm64/payload/Applications/MacBridge.app
"$LSREGISTER" -u /Users/shaneholloman/git/sources/shaneholloman/macbridge/tmp/ghostty/zig-out/MacBridge.app
"$LSREGISTER" -f /Applications/MacBridge.app
killall tccd
killall "System Settings"
```

If a legacy TCC row remains for a deleted bundle ID, recreate a temporary app
with that exact `CFBundleIdentifier`, register it, run `tccutil reset`,
unregister it while it still exists, then delete it. Do not leave the shim in
`/Applications`, and do not run this as part of every package install.

## Guardrails

Do not use temporary TCC reset apps for the current bundle ID
`nz.uic.macbridge`.

Do not run broad TCC deletion or Launch Services cleanup after successful
builds.

Do not remove `/Applications/MacBridge.app` during ordinary package builds.
Human permission tests require the installed app to stay installed at a stable
path.

Do not register build-output app bundles with the same bundle ID as the
installed app unless a test explicitly needs that. Multiple `nz.uic.macbridge`
records can make System Settings resolve the wrong target.

If a temporary shim is unavoidable for a deleted legacy bundle ID, the order
must be:

```text
create app -> lsregister -f -> tccutil reset -> lsregister -u -> delete app
```

Never delete the shim before unregistering it.

## Screen Recording Follow-Up

Accessibility now adds through the expected MacBridge permission flow. Screen
Recording did not auto-add in the same way. The current known-good workaround is
manual drag into Privacy & Security > Screen & System Audio Recording.

The next implementation pass should verify that the installed
`/Applications/MacBridge.app` process explicitly calls the macOS screen-capture
permission request path from the final app bundle, not from Terminal, a repo
build copy, or an npm shim. The expected validation is:

1. Clean user and system MacBridge TCC rows.
2. Confirm Launch Services resolves only `/Applications/MacBridge.app` for
   `nz.uic.macbridge`.
3. Launch `/Applications/MacBridge.app`.
4. Press Permissions.
5. Confirm Accessibility is added automatically.
6. Confirm Screen Recording either appears automatically or the UI clearly
   directs the user to drag/open the installed app manually.
