# Usage Guide

MacBridge combines a native macOS runtime with a TypeScript package and CLI
surface for agent-oriented automation.

## Run

```bash
npx macbridge --help
npx macbridge permissions check
npx macbridge displays list
```

The package is macOS-only and currently supports `arm64` and `x64`.

## Install

```bash
bun add macbridge
```

## Basic CLI

```bash
npx macbridge windows list
npx macbridge capture display main --png -o screenshot.png
```

Source-owned TypeScript commands:

```bash
bunx macbridge observe window <wid> --display-screenshot main --ax --out tmp/observations/window
bunx macbridge act action.json
bunx macbridge verify expectation.json
bunx macbridge agent models --type text --provider openai --json
```

## Capture Semantics

Capture scope is a product contract. Avoid the generic word `screenshot` when
the scope matters.

- `targetScreenshot`: a cropped capture of the resolved target, usually one app
  window. This is the clean artifact for reading the target and mapping
  window-local coordinates.
- `displayScreenshot`: a full monitor capture for sanity-checking what is
  actually visible on the user's screen. It can include the menu bar, Dock,
  translucent window chrome, and unrelated apps.
- `desktopScreenshot`: a whole-desktop capture when a workflow intentionally
  needs global context.

Complex-app workflows should usually capture both a `targetScreenshot` and a
`displayScreenshot`.

## Observation Artifacts

Observation directories may include:

- `observation.json`
- target, display, or desktop screenshots
- accessibility dumps
- `summary.redacted.json`

The redacted summary is the model/log handoff artifact. It preserves structure,
bounds, permissions, target metadata, artifact paths, and capture scope while
redacting window titles and Accessibility text that may contain private user
content.

## TypeScript API

Public package imports should come from `macbridge`:

```ts
import { createControlPlane, runJSON, type Json } from "macbridge";

const displays = runJSON<Json>(["displays", "list"]);
const mac = createControlPlane();
const permissions = mac.permissions({ require: false });
```

The public surface is still evolving toward a more domain-shaped SDK. Today it
already exposes the native-backed `MacBridge` client, the `ControlPlane`
protocol, typed actions, observations, verification, planning, recording, and
media helpers.

## Permissions

MacBridge operations may require macOS permissions:

- Accessibility for input and Accessibility tree inspection
- Screen Recording for display/window capture

Use:

```bash
macbridge permissions check
```

The npm package includes `MacBridge.app` bundles for each supported macOS
architecture. The CLI wrapper prefers the executable inside that bundle so
Accessibility and Screen Recording prompts can use MacBridge's bundle identity
and icon where macOS allows it.

Opening `MacBridge.app` directly shows a small native permission window. Use
Terminal for CLI workflows only when you intentionally want a shell.

Permission failures should be treated as first-class workflow state, not as
generic command failures.
