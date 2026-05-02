# Agent Guide

This repository is greenfield. Refactor freely when it improves the product shape, naming, boundaries, or agent usability. There are no downstream users to preserve compatibility for unless a current task explicitly says otherwise.

## Product Posture

- Treat MacBridge as a reusable native macOS adapter for TypeScript-first agent systems.
- Keep the Swift package focused on native macOS capabilities: capture, displays, windows, input, accessibility, cursor overlay, and service transport.
- Keep TypeScript as the ergonomic harness layer for examples, checks, and integration surfaces.
- Prefer small, composable library APIs over script-like one-off entry points.
- Treat `build/` as checked-in build-system source. Generated SwiftPM state
  belongs in `tmp/swiftpm/`, and generated release/package artifacts belong in
  `dist/`.

## Source Ownership Boundaries

- `src/` owns the TypeScript product engine, command surface, control plane,
  SDK behavior, and user-facing application logic.
- `soak/` owns TypeScript confidence and reporting workflows. If a soak/report
  command becomes user-facing, route it through the TypeScript CLI/control plane
  instead of reimplementing it elsewhere.
- `native/swift/` is only the native macOS adapter. It should expose OS
  capabilities such as windows, displays, capture, input, accessibility,
  permissions, cursor overlay, and service transport. Do not put product
  workflow, reporting, shell UX, SDK semantics, or application command logic in
  Swift.
- `build/` owns mechanical repository automation: packaging, signing,
  notarization, release artifacts, source checks, and generated manifests. Build
  logic must be scripted, repeatable, and non-manual.
- `tools/` must not exist. Do not create utility-script grab bags. Product
  behavior belongs in `src/`; repository workflow belongs in `build/`.

When adding behavior, first decide which layer owns it. Do not place logic
wherever it is quickest to execute. Do not duplicate command behavior across
TypeScript, Swift, shell scripts, and build scripts. The terminal app, npm CLI,
and repo CLI should route through one TypeScript command/control-plane surface;
Swift remains the OS adapter underneath.

If a command is visible to users, it belongs in the TypeScript CLI/control plane
first. Shell aliases may only forward to it. Swift may only implement the native
primitive that the TypeScript command calls.

## Naming

- Prefer short, tight file names. The directory path already carries domain context.
- Avoid redundant names like `Capture/ScreenCaptureKitCapture.swift`. Prefer `Capture/SCK.swift`.
- Keep basenames unique within a Swift target, even across directories, because Swift object files can collide.
- Prefer consistent nouns:
  - `window`: one app window
  - `display`: one physical/logical screen from CoreGraphics/NSScreen
  - `desktop`: the main foreground display surface
  - `app`: the frontmost app/window context
- Prefer noun-first CLI commands for new surfaces:
  - `macbridge windows list`
  - `macbridge displays list`
  - `macbridge capture window <wid>`
  - `macbridge capture display <display>`
  - `macbridge act window <wid> click ...`

## Swift Layout

- Swift source lives in `native/swift/Sources`.
- `MacBridgeCore` is the reusable library module.
- `macbridge` is only the executable wrapper.
- Domain folders should stay compact:
  - `Accessibility/Element.swift`, `Debug.swift`, `Plan.swift`
  - `Capture/Screenshot.swift`, `SCK.swift`
  - `CLI/Arguments.swift`, `Cmd.swift`, `Errors.swift`, `JSON.swift`, `Usage.swift`
  - `Cursor/State.swift`, `Overlay.swift`, `Commands.swift`
  - `Desktop/Coordinates.swift`, `Displays.swift`, `Windows.swift`
  - `Input/Keyboard.swift`, `Mouse.swift`, `Text.swift`, `Window.swift`, `Display.swift`
  - `Service/Service.swift`, `Protocol.swift`

## Coding Style

- Use existing local helpers before adding abstractions.
- Keep comments sparse and useful.
- Use structured APIs instead of ad hoc parsing when available.
- Put screenshots under repo-local `screenshots/` for easy inspection.
- Prefer TypeScript for repo automation and demos. Do not add shell scripts unless there is a strong reason.
- Use Bun for TypeScript runtime, package management, scripts, and lockfiles.
- Do not introduce npm/yarn/pnpm lockfiles or Node-centric scripts.
- Use Biome for TypeScript formatting and lint sanity checks.
- Use Pino for TypeScript logging, with `pino-pretty` for human-facing local tools.
- Avoid raw `console.log` / `console.error` in TypeScript automation unless there is a narrow protocol reason.
- Use Zod when a TypeScript boundary needs runtime validation.
- Use `rg` for searching.
- Use `apply_patch` for source edits.

## Verification

Before taking on packaging, distribution, permission, or build-system work, read:

```sh
docs/development/apple-privacy-and-launch-services.md
```

Run the repo-wide sanity check before committing:

```sh
bun run check
```

For narrower edits, run the closest relevant checks:

```sh
bun run build:native
bun run test:native
bun run check:ts
```
