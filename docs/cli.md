# CLI Reference

The public CLI is named `macbridge`. It routes TypeScript-owned commands such
as `apps`, `agent`, `observe`, `act`, and `verify`, and forwards native macOS
commands to the Swift runtime.

For a new machine, npm is the bootstrap path:

```bash
npx macbridge
```

On macOS, that command runs the packaged signed `.pkg` installer and then opens
`/Applications/MacBridge.app`. Accessibility and Screen Recording should be
granted to that installed app, not to an npm cache path.

After the app is installed, use the normal command surface:

```bash
macbridge displays list
macbridge permissions check --prompt
```

For TypeScript harness commands during development, use Bun:

```bash
bunx macbridge observe desktop --display-screenshot main
```

## App Adapters

App-specific behavior lives behind explicit adapters:

```bash
macbridge apps list
macbridge apps observe helium --launch --out tmp/observations/helium
macbridge apps observe outlook --launch --prompt --out tmp/observations/outlook
```

Adapters own app identity, launch/readiness, window selection, cleanup, and
workflow-specific observation behavior. The built-ins are `helium`, `textedit`,
`ghostty`, `terminal`, and `outlook`.

## Preferences

MacBridge stores user preferences in `~/MacBridge/preferences.toml`.

```bash
macbridge prefs init --preferred-screen left
macbridge prefs show
macbridge prefs set preferred-screen left
```

Screen aliases describe the user's physical workspace, such as `left`,
`middle`, and `right`. They let MacBridge choose where to place owned automation
windows without rediscovering the user's screen layout every run.

## Terminal Workspace

Terminal automation has an owned lane:

```bash
macbridge terminal start --screen left --session macbridge
macbridge terminal send "echo hello" --session macbridge
macbridge terminal capture --session macbridge -o tmp/lane.png
macbridge terminal stop --session macbridge
```

The default `ghostty` terminal adapter opens a read-only visible client attached
to a tmux session. The `terminal` adapter targets macOS Terminal.app. MacBridge
sends commands to tmux programmatically, so the human can continue working on
another screen without fighting for keyboard focus.

This is a terminal/PTY solution. Ordinary GUI apps still use native macOS
operations such as Accessibility, activation, window placement, capture, and
app-specific APIs where available. Synthetic typing remains the human-fidelity
fallback when a GUI workflow truly requires keyboard simulation.

## Modes

### Background

Operate a specific window id (`wid`) without bringing the target app to the
front.

Use this when you already know which window you want from `windows list`.

### Foreground App

Operate the current frontmost app window. Target screenshots are cropped to the
window and use window-local coordinates.

### Foreground Desktop

Operate the main display as a whole. Captures are full display captures and use
display-local coordinates.

### Foreground Display

Operate a chosen display when a workflow needs explicit multi-display control.

## Discovery

List apps:

```bash
macbridge list-apps
```

List windows:

```bash
macbridge windows list
macbridge list-windows --app Helium
macbridge list-windows --bundle-id net.imput.helium
macbridge list-windows --pid 24007
```

Window records include `pid`, `wid`, bounds, owner, title, and `bundleID` when
resolvable.

## Noun-First Commands

Prefer noun-first command grammar for new surfaces:

```bash
macbridge windows list
macbridge displays list
macbridge capture display main --png -o screenshot.png
macbridge permissions check
```

Compatibility aliases may exist while the command surface settles.

## Coordinates

Coordinates should explicitly declare their mode when ambiguity matters:

- `pixel`: target-local pixels
- `normalized`: values from `0` to `1`
- `global`: desktop/global coordinates

Window-local coordinates are usually the right default for target screenshots
and direct app interaction.

## Cursor Overlay

MacBridge includes a persistent cursor overlay helper for rendering a virtual
cursor as a separate transparent window:

```bash
macbridge cursor start display main
```

This is useful for visual evidence and session recording.
