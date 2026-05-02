---
id: RFC-0011
name: Inviting CLI and Shell Experience
status: Draft
owners:
    - MacBridge maintainers
created: 2026-05-03
updated: 2026-05-03
supersedes: []
superseded_by: null
---

# Inviting CLI and Shell Experience

## Summary

MacBridge should make its terminal experience feel like a purposeful product
surface rather than a raw native binary. Bare `macbridge` and `mb` should open
a compact status dashboard, the packaged Mac app should launch into a visibly
branded MacBridge shell, and diagnostic/setup flows should guide users through
permissions, app identity, and common first commands.

## Context

The current MacBridge shell starts, prints a small banner, and then drops into
what looks like the user's normal terminal prompt. That makes the app feel like
it opened and immediately exited, even when the shell is technically ready.

The native CLI also emits an enormous help message for bare command usage. That
is useful as a full reference, but it is a poor first-run experience. A new
user launching `MacBridge.app`, typing `mb`, or running `macbridge` from a
terminal should see a calm, compact product surface with clear next actions.

This matters before public npm or `.pkg` distribution because the first
terminal moment is the first thing many developers will judge. MacBridge asks
for sensitive macOS privacy grants, so it needs to feel deliberate,
inspectable, and steady.

## Goals

- Make bare `macbridge` and bare `mb` show a compact dashboard instead of the
  full generated help text.
- Make `MacBridge.app` open into a branded shell session that visibly remains
  in MacBridge context.
- Add a first-class `mb doctor` command for install, signing, Launch Services,
  TCC, permissions, command shim, and service checks.
- Add a guided `mb setup` command for first-run onboarding.
- Keep full CLI reference help available, but make it explicit.
- Add noun-level shortcut commands that map to the deeper native command tree.
- Make permission and capture failures instructional instead of terse.

## Non-Goals

- Replacing the native CLI parser in this RFC.
- Building a full TUI dashboard.
- Adding natural-language agent prompting directly to the shell.
- Hiding advanced commands from automation or scripts.
- Changing the underlying native command semantics for windows, displays,
  capture, input, or services.

## Proposal

### Bare Command Behavior

Bare commands should be friendly status surfaces:

```sh
macbridge
mb
```

Both should show a compact dashboard:

```text
MacBridge

Status
  Accessibility       Accepted
  Screen Recording    Accepted
  Service             Running
  App                 /Applications/MacBridge.app

Try
  mb windows
  mb displays
  mb capture
  mb act
  mb doctor
```

The full reference remains available through explicit commands:

```sh
mb help
mb help all
mb --help-full
```

`mb --help` may stay compatible with conventional CLI expectations, but it
should be shorter than the current full reference if possible.

### Branded MacBridge Shell

`MacBridge.app` should launch into a shell that is visibly MacBridge, not a
normal user terminal. The prompt should make the active context obvious:

```text
MacBridge ~
mb>
```

The startup message should be short and useful:

```text
MacBridge Shell

Ready for native macOS automation.

Try:
  mb doctor
  mb windows
  mb displays
  mb capture
```

The shell should define `mb` and `macbridge` functions that route to the
bundled native binary. If called with no arguments, they should show the compact
dashboard instead of dumping full help.

The shell should not source the user's normal `~/.zshrc` by default because
that makes the session visually collapse back into an ordinary terminal. A
future preference or environment variable may allow advanced users to opt in.

### `mb doctor`

`mb doctor` should be the main troubleshooting command. It should check:

- `/Applications/MacBridge.app` exists.
- The app bundle ID is `nz.uic.macbridge`.
- Launch Services resolves `nz.uic.macbridge` to the installed app.
- No stale MacBridge Launch Services entries are visible.
- The app is signed, notarized, and Gatekeeper accepted.
- The package command shim points to the installed app.
- Accessibility permission status.
- Screen Recording permission status.
- The bundled runtime binary exists and runs.
- The service state, if service mode is enabled.

Output should be scannable:

```text
MacBridge Doctor

OK   App bundle          /Applications/MacBridge.app
OK   Bundle ID           nz.uic.macbridge
OK   Gatekeeper          Notarized Developer ID
OK   Accessibility       Accepted
WARN Screen Recording    Missing
OK   CLI shim            /usr/local/bin/macbridge

Next:
  Open MacBridge > About MacBridge > Permissions
```

### `mb setup`

`mb setup` should guide first-run onboarding:

1. Show current install and permission status.
2. Open the MacBridge About/Permissions surface or System Settings as needed.
3. Re-check permissions after changes.
4. Explain the Screen Recording manual-drag fallback if macOS does not add the
   app automatically.
5. Finish with a simple "ready" state and first commands.

### Noun-Level Shortcuts

Common commands should be easy to discover:

```sh
mb windows
mb displays
mb permissions
mb capture
mb act
```

These can internally map to the formal command tree:

```sh
mb windows      -> mb windows list
mb displays     -> mb displays list
mb permissions  -> mb permissions check --prompt
```

The CLI should still support explicit command forms for scripts.

### Instructional Errors

Permission and environment errors should include the next action:

```text
Screen Recording is missing.

Open:
  MacBridge > About MacBridge > Permissions

If macOS does not add it automatically, drag:
  /Applications/MacBridge.app

into:
  Privacy & Security > Screen & System Audio Recording
```

## Alternatives Considered

- Keep the current full help as the default.
  This is useful for exhaustive reference, but it overwhelms first-run users and
  makes the app feel unfinished.

- Launch directly into the user's normal shell config.
  This respects user customization, but it hides the MacBridge product context
  and makes the app appear to close immediately.

- Build a full-screen TUI first.
  A TUI could be excellent later, but the immediate problem can be solved with
  better command defaults, prompt design, diagnostics, and onboarding.

- Make `MacBridge.app` only open the About/Permissions window.
  The About window is useful, but MacBridge also needs a developer-facing shell
  surface because the product is command-driven.

## Security Impact

The RFC does not add privileges. It makes permission state more visible and
reduces the chance users grant privacy access to the wrong app identity.

`mb doctor` must avoid leaking sensitive local paths beyond what is necessary
for diagnostics. Any command that inspects TCC or Launch Services should report
high-signal state without dumping excessive system data by default.

## Reliability Impact

The shell should make it obvious whether MacBridge is active, which binary is
being used, and which permission grants are missing. `mb doctor` should become
the first diagnostic tool for packaging, TCC, Launch Services, and command-shim
regressions.

The shell prompt and helper functions should degrade gracefully if the bundled
runtime binary is missing, showing a clear repair message instead of exiting
silently.

## Compatibility Impact

Existing explicit native commands should continue to work. Scripts that call
`macbridge windows list`, `macbridge displays list`, or other explicit commands
should not change behavior.

Bare `macbridge` may change from full help to dashboard output. That is an
intentional product change before public release.

## Testing and Quality Gates

- `bun run check`
- `bun run build:native`
- `bun run check:ts`
- Build `MacBridge.app` and launch it from `/Applications`.
- Verify the startup shell shows MacBridge branding and an `mb>` prompt.
- Verify bare `mb` and bare `macbridge` show compact dashboard output.
- Verify `mb help all` or equivalent still exposes full reference help.
- Verify `mb doctor` catches stale Launch Services and TCC states on a
  disposable test machine.
- Verify explicit commands still work:
  - `mb windows list`
  - `mb displays list`
  - `mb permissions check`

## Rollout Plan

1. Change shell startup to use a MacBridge-owned prompt and compact first-run
   message.
2. Add compact dashboard behavior for bare `macbridge` and `mb`.
3. Add `mb help`, `mb help all`, and shortcut command routing.
4. Implement `mb doctor` with install, signing, Launch Services, TCC, and shim
   checks.
5. Implement `mb setup` around the existing About/Permissions surface.
6. Update README and package docs with the new first-run commands.

## Open Questions

- Should `mb --help` show compact help or preserve the full generated native
  reference?
- Should the MacBridge shell ever source the user's normal `~/.zshrc` by
  default, or only behind an opt-in environment variable?
- Should `mb doctor` live entirely in Swift, TypeScript, or a hybrid layer?
- Should `mb setup` open the About window, System Settings directly, or both?
