# CLI Reference

The public CLI is named `macbridge`. It routes TypeScript-owned commands such
as `agent`, `observe`, `act`, and `verify`, and forwards native macOS commands
to the Swift runtime.

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
