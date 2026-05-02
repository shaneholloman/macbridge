---
name: macbridge
description: Use this skill to build, test, inspect, and operate MacBridge, a TypeScript-friendly native macOS automation adapter for screenshots, display/window discovery, input, accessibility actions, cursor overlays, and soak verification.
---

# MacBridge

MacBridge is a greenfield native macOS adapter for TypeScript-first agent
systems. Treat the Swift package as the native capability layer and TypeScript
as the ergonomic harness, automation, reporting, and integration layer.

Use the native CLI at:

```bash
tmp/swiftpm/release/macbridge
```

## Repo Shape

- `src/index.ts`: public TypeScript package entrypoint.
- `src/macbridge.ts`: TypeScript wrapper implementation for agent harnesses.
- `build/`: TypeScript build, package, and release orchestration source.
- `tools/`: Bun-based repo automation.
- `soak/`: Bun-based smoke, burn, stress, TUI, and aggregate reporting.
- `native/swift/`: Swift Package Manager project.
- `native/swift/Sources/MacBridgeCore/`: reusable Swift library module.
- `native/swift/Sources/macbridge/`: small executable wrapper.
- `native/swift/Tests/MacBridgeCoreTests/`: Swift unit tests.
- `tmp/swiftpm/`: ignored SwiftPM scratch output for repository-managed commands.
- `dist/`: ignored distribution output for staged package artifacts.

## Build And Checks

Use Bun for TypeScript commands and Swift Package Manager through package
scripts.

```bash
bun run build:native
bun run test:native
bun run check:ts
bun run check
```

Before committing, run:

```bash
bun run check
```

`bun run check` runs Biome, TypeScript, RFC sync validation, native release
build, and native tests.

Keep `native/swift/` source-only. Use package scripts and the build module so
SwiftPM generated state lands under `tmp/swiftpm/`, not `native/swift/.build`.

## RFC Workflow

RFCs live in `docs/development/rfcs`.

- Active RFCs stay in `docs/development/rfcs/`.
- Implemented RFCs live in `docs/development/rfcs/implemented/`.
- Only mark an RFC `Implemented` after the implementation has been tested end
  to end.
- Use `bun run rfc:sync` after changing RFC status or names.
- Use `bun run rfc:check` to validate file placement, index output, and README
  RFC links.

## Capture And Action Model

Screenshots define the coordinate frame for later actions.

- `window`: one app window by window id.
- `display`: one physical/logical screen from CoreGraphics/NSScreen.
- `desktop`: the main foreground display surface.
- `app`: the frontmost app/window context.

Default screenshots should be written under repo-local `screenshots/` unless a
specific task requests another output path.

Use `pixel` coordinates by default. Use `normalized` for `0.0...1.0` fractions
of the current frame. Avoid `global` unless absolute macOS display coordinates
are intentional.

## Discovery

List apps:

```bash
tmp/swiftpm/release/macbridge list-apps
```

List windows:

```bash
tmp/swiftpm/release/macbridge windows list
tmp/swiftpm/release/macbridge list-windows --app Helium
tmp/swiftpm/release/macbridge list-windows --bundle-id net.imput.helium
tmp/swiftpm/release/macbridge list-windows --pid 24007
```

Frontmost app and desktop:

```bash
tmp/swiftpm/release/macbridge foreground-app info
tmp/swiftpm/release/macbridge foreground-desktop info
tmp/swiftpm/release/macbridge permissions check
```

Displays:

```bash
tmp/swiftpm/release/macbridge displays list
tmp/swiftpm/release/macbridge displays info main
tmp/swiftpm/release/macbridge displays info 1
```

## Current CLI Surfaces

Preferred noun-first commands:

```bash
tmp/swiftpm/release/macbridge windows list [--app NAME] [--bundle-id ID] [--pid PID]
tmp/swiftpm/release/macbridge displays list
tmp/swiftpm/release/macbridge displays info [<display>]
tmp/swiftpm/release/macbridge capture window <wid|app> [--png] [-o path]
tmp/swiftpm/release/macbridge capture app [--png] [-o path]
tmp/swiftpm/release/macbridge capture desktop [--png] [-o path]
tmp/swiftpm/release/macbridge capture display <display> [--png] [-o path]
tmp/swiftpm/release/macbridge act window <wid|app> click <x> <y>
tmp/swiftpm/release/macbridge act app click <x> <y>
tmp/swiftpm/release/macbridge act desktop click <x> <y>
tmp/swiftpm/release/macbridge act display <display> click <x> <y>
tmp/swiftpm/release/macbridge permissions check [--prompt] [--require]
```

Compatibility mode commands still exist:

```bash
tmp/swiftpm/release/macbridge background screenshot <wid> [-o path] [--png] [--quality 0.8]
tmp/swiftpm/release/macbridge foreground-app screenshot [-o path] [--png] [--quality 0.8]
tmp/swiftpm/release/macbridge foreground-desktop screenshot [-o path] [--png] [--quality 0.8]
tmp/swiftpm/release/macbridge foreground-display <display> screenshot [-o path] [--png] [--quality 0.8]
```

## Cursor Overlay

The virtual cursor renders as a separate transparent window.

```bash
tmp/swiftpm/release/macbridge cursor start background <wid> <x> <y> [--coord pixel|normalized|global] [--duration 0.0] [--wait]
tmp/swiftpm/release/macbridge cursor start display <display> <x> <y> [--coord pixel|normalized|global] [--duration 0.0] [--wait]
tmp/swiftpm/release/macbridge cursor start foreground-app <x> <y> [--coord pixel|normalized|global] [--duration 0.0] [--wait]
tmp/swiftpm/release/macbridge cursor start foreground-desktop <x> <y> [--coord pixel|normalized|global] [--duration 0.0] [--wait]
tmp/swiftpm/release/macbridge cursor move <x> <y> [--coord pixel|normalized|global] [--duration 0.18] [--wait]
tmp/swiftpm/release/macbridge cursor retarget background <wid> [--coord pixel|normalized|global] [--duration 0.0] [--wait]
tmp/swiftpm/release/macbridge cursor retarget display <display> [--coord pixel|normalized|global] [--duration 0.0] [--wait]
tmp/swiftpm/release/macbridge cursor retarget foreground-app [--coord pixel|normalized|global] [--duration 0.0] [--wait]
tmp/swiftpm/release/macbridge cursor retarget foreground-desktop [--coord pixel|normalized|global] [--duration 0.0] [--wait]
tmp/swiftpm/release/macbridge cursor click [--wait]
tmp/swiftpm/release/macbridge cursor hide
tmp/swiftpm/release/macbridge cursor show
tmp/swiftpm/release/macbridge cursor status
tmp/swiftpm/release/macbridge cursor stop
```

## Agent Loop

Use this pattern for GUI work:

1. Discover the target with app, window, display, or foreground info.
2. Capture a screenshot in the same mode you will act in.
3. Inspect the saved image at its real size.
4. Act using coordinates from that image.
5. Capture again and verify the result.

Always verify after actions. A successful return value may only mean an event
was posted, not that the target app accepted it.

## Soak Regime

Use the soak harness to exercise the app and generate reports.

```bash
bun run soak:smoke
bun run soak:burn
bun run soak:stress
bun run soak:tui
```

Per-run artifacts live under `soak/runs/`. Aggregate reports live under
`soak/reports/` and include `latest.md`, `latest.json`, and `index.db`.

## Constraints

- Accessibility-aware controls often work best.
- Canvas-heavy, Qt, wxWidgets, OpenGL, and custom-rendered apps may ignore
  background events.
- `click` prefers Accessibility routes and falls back to PID-targeted CG mouse
  events.
- `scroll` prefers Accessibility page-scroll routes and falls back to CG wheel
  events.
- `type --at X Y` is usually the most reliable text path.
- `type --replace` is important for address bars and search bars.
- `press` and `hotkey` may still be ignored by some backgrounded apps.

## Permissions

Grant both permissions to the launching terminal/app or compiled binary:

- Accessibility
- Screen Recording

Restart the launching process after granting permissions.
