---
id: RFC-0001
name: Swift Package Structure and Semantics
status: Implemented
owners:
    - MacBridge maintainers
created: 2026-05-02
updated: 2026-05-02
supersedes: []
superseded_by: null
---

# Swift Package Structure and Semantics

## Summary

MacBridge will be formalized as a TypeScript-friendly macOS native adapter with
a reusable Swift library target, a small CLI executable, domain-oriented Swift
source groups, consistent command nouns, and quality gates that prove the core
logic remains stable while the native automation surface evolves.

## Context

MacBridge began as a compact Swift CLI and testing ground for macOS computer-use
automation. That shape was useful for discovery, but it is not the right long
term boundary for a reusable product. The broader application ecosystem around
MacBridge is TypeScript-heavy: agent harnesses, orchestration code, examples,
and future SDK surfaces are expected to be TypeScript-first. The Swift code
exists because native macOS automation requires direct access to AppKit,
Accessibility, CoreGraphics, and ScreenCaptureKit.

The repository has already started moving toward this boundary:

- TypeScript wrapper, automation, and soak reporting now live outside the Swift
  package.
- The native Swift package now lives under `native/swift`.
- The Swift package has been split into `MacBridgeCore` and `macbridge`.

The remaining work is to make the Swift package read and evolve like a mature
native adapter rather than a collection of experiment files. The next refactors
should be guided by one document so file moves, symbol renames, CLI nouns, and
tests converge instead of creating another layer of accidental vocabulary.

## Goals

- Establish `MacBridgeCore` as the reusable Swift library module.
- Keep `macbridge` as a thin executable wrapper over `MacBridgeCore`.
- Organize Swift source files by domain rather than by historical script shape.
- Tighten broad file and symbol names into concise, pattern-based names.
- Standardize user-facing command nouns around `window`, `app`, `display`, and
  `desktop`.
- Preserve the TypeScript-first integration path through `src/macbridge.ts`.
- Add quality gates for pure logic that does not require live UI automation.
- Keep live macOS automation behavior intact during each refactor phase.

## Non-Goals

- Replacing Swift with TypeScript for native macOS automation.
- Freezing every internal Swift type as public API in the first pass.
- Rewriting command parsing around a third-party framework before the nouns are
  stable.
- Removing compatibility aliases before a migration path exists.
- Building a GUI application or packaged app bundle as part of this RFC.
- Solving cross-platform automation beyond macOS.

## Proposal

### 1. Package Target Model

The Swift package must expose two targets:

```text
native/swift/
  Package.swift
  Sources/
    MacBridgeCore/
    macbridge/
      main.swift
  Tests/
    MacBridgeCoreTests/
```

`MacBridgeCore` is the reusable Swift library module. It owns the implementation
for discovery, capture, coordinate mapping, input dispatch, Accessibility
planning, cursor overlay state, and service mode.

`macbridge` is the executable target and CLI product. It imports
`MacBridgeCore` and delegates process execution through a small CLI entrypoint.

This is already partially implemented. The remaining requirement is to keep the
CLI target thin. New native behavior must land in `MacBridgeCore` unless it is
strictly process-entrypoint behavior.

### 2. Initial Public Swift API

The public Swift API should stay intentionally narrow until internal semantics
settle:

```swift
public func run(_ arguments: [String]) throws
public func runCLI(_ arguments: [String]) -> Int32
```

Additional public APIs should be introduced only when the TypeScript wrapper or
another native consumer needs a stable in-process contract. Internal functions
may remain package-internal or internal while the core is being shaped.

### 3. Domain Grouping

The `MacBridgeCore` source tree should move from flat files to domain folders:

```text
MacBridgeCore/
  Accessibility/
    Element.swift
    Plan.swift
    Debug.swift
  Capture/
    Screenshot.swift
    SCK.swift
  CLI/
    Arguments.swift
    Cmd.swift
    Errors.swift
    JSON.swift
    Usage.swift
  Cursor/
    State.swift
    Overlay.swift
    Commands.swift
  Desktop/
    Coordinates.swift
    Displays.swift
    Windows.swift
  Input/
    Keyboard.swift
    Mouse.swift
    Text.swift
    Window.swift
    Display.swift
  Service/
    Service.swift
    Protocol.swift
  Runner.swift
```

This grouping is semantic, not cosmetic. Each folder owns one set of nouns:

- `Accessibility`: AX element inspection, click planning, debug dumps, and AX
  action helpers.
- `Capture`: screenshot capture through CoreGraphics and ScreenCaptureKit.
- `CLI`: argument parsing, command dispatch, help text, and stdout/stderr JSON
  output.
- `Cursor`: visual cursor state, overlay daemon, and cursor commands.
- `Desktop`: display/window discovery and coordinate transforms.
- `Input`: keyboard/mouse/text event construction and dispatch.
- `Service`: long-running daemon transport, request/response protocol, and
  lifecycle.

### 4. File Naming Cleanup

Current broad files should be split or renamed according to ownership:

| Current file           | Target direction                                              |
| ---------------------- | ------------------------------------------------------------- |
| `ActionCommands.swift` | `CLI/Cmd.swift`                                               |
| `ArgumentCursor.swift` | `CLI/Arguments.swift`                                         |
| `JSON.swift`           | `CLI/JSON.swift`                                              |
| `Usage.swift`          | `CLI/Usage.swift`                                             |
| `Actions.swift`        | split into `Input/Window.swift` and `Input/Display.swift`     |
| `Input.swift`          | split into `Keyboard.swift`, `Mouse.swift`, `Text.swift`      |
| `Screenshot.swift`     | `Capture/Screenshot.swift` plus `Capture/SCK.swift`           |
| `Coordinates.swift`    | `Desktop/Coordinates.swift`                                   |
| `Displays.swift`       | `Desktop/Displays.swift`                                      |
| `Windows.swift`        | `Desktop/Windows.swift`                                       |
| `Cursor.swift`         | split into `Cursor/State.swift` and `Cursor/Overlay.swift`    |
| `Service.swift`        | split transport/protocol/lifecycle where useful               |

Renames should preserve behavior and avoid unrelated abstraction work in the
same patch. Within domain directories, file names should stay short because the
path already carries semantic context. Swift target basenames must remain unique
across the full target to avoid object-file collisions.

### 5. Command Noun Consistency

The current CLI contains mixed semantic layers:

- `background`
- `foreground-app`
- `foreground-desktop`
- `foreground-display`
- `global`
- `screen`
- `display`

The canonical nouns should become:

- `window`: a specific app window, usually by `wid`
- `app`: the current/frontmost app window
- `display`: a specific display from `list-displays`
- `desktop`: the whole desktop/main display context, where retained

Longer-term command grammar should move toward noun-first groups:

```bash
macbridge windows list
macbridge displays list
macbridge capture window <wid>
macbridge capture display <display>
macbridge act window <wid> click ...
macbridge cursor start display <display> ...
```

The existing command surface should remain as compatibility aliases until the
new grammar is complete, documented, and verified.

### 6. TypeScript Boundary

The TypeScript layer remains the preferred harness boundary:

```text
src/
build/
soak/
```

The TypeScript wrapper should call the CLI initially. The soak harness owns
executable confidence checks. Future RFCs may define an IPC service or native
binding contract if direct process spawning becomes too expensive or too
limiting for agent harnesses.

### 7. Tests

The Swift package should keep `MacBridgeCoreTests` as the home for pure logic
tests. The first required coverage areas are:

- coordinate transforms
- argument parsing
- display target resolution
- keycode mapping
- JSON payload shape helpers

Live UI automation tests should remain opt-in until the repository has a stable
permissions and fixture story.

### 8. Build Settings

The package may remain at `.macOS(.v13)` while ScreenCaptureKit fallback stays
runtime-gated with `@available(macOS 14.0, *)`. If macOS 13 support stops being
valuable, the package platform should move to `.macOS(.v14)` and the decision
should be recorded in this RFC or a follow-up.

## Alternatives Considered

- Keep only an executable target.
  This was rejected because TypeScript harnesses and future native consumers
  need a reusable Swift module boundary rather than a CLI-shaped codebase.

- Make the TypeScript layer the only library and treat Swift as an opaque
  binary.
  This was rejected because native Swift code still needs internal structure,
  tests, and reusable APIs to stay maintainable.

- Rename everything in one large patch.
  This was rejected because behavior-preserving moves should land separately
  from deeper command grammar and symbol semantics changes.

- Adopt a third-party Swift argument parser immediately.
  This may be valuable later, but it should not happen before command nouns and
  compatibility alias policy are settled.

## Security Impact

MacBridge automates macOS UI through Accessibility, CoreGraphics,
ScreenCaptureKit, and AppKit. Those surfaces are permission-sensitive. This RFC
does not expand permissions, but it does require clearer module boundaries so
permission-sensitive behavior has obvious ownership.

Security-sensitive considerations:

- Keep Screen Recording and Accessibility requirements documented.
- Keep screen captures local by default under `screens/` and ignored by Git.
- Avoid adding public Swift APIs that expose raw event posting without clear
  call-site intent.
- Preserve explicit CLI commands for actions that click, type, or press keys.

## Reliability Impact

The split library target improves reliability by enabling targeted tests without
launching the CLI process. Domain grouping should reduce accidental coupling
between capture, input, Accessibility planning, cursor rendering, and service
transport.

Risks:

- File moves may accidentally alter symbol visibility or target membership.
- Command aliasing may drift if compatibility and canonical grammar live in
  separate paths.
- Live automation behavior may appear successful at the event-posting layer but
  fail in the target app.

Mitigations:

- Keep each phase behavior-preserving where possible.
- Run native build and tests after every phase.
- Keep live smoke checks for `list-displays`, `foreground-display info`, and
  at least one screenshot path.
- Add tests for argument and coordinate semantics before large command grammar
  changes.

## Compatibility Impact

The target split changes Swift package structure but should not change the
external CLI path after `bun run build:native`:

```text
native/swift/.build/release/macbridge
```

The initial restructuring preserves current CLI behavior. Future noun-first CLI
commands must be additive first and only remove old commands after a documented
deprecation period.

TypeScript consumers should continue to use `src/macbridge.ts`. The wrapper can
hide CLI path changes from harness code.

## Testing and Quality Gates

Required gates for each implementation phase:

- `bun run check`
- `bun run soak:smoke`

Targeted smoke checks:

- `native/swift/.build/release/macbridge --help`
- `native/swift/.build/release/macbridge list-displays`
- `native/swift/.build/release/macbridge displays list`

Opt-in live macOS automation check:

- `bun run soak:stress:live`

Additional future tests:

- CLI argument parsing for canonical and compatibility commands
- display target resolution by index, display ID, `main`, and name
- JSON output shape helpers
- command alias parity tests where practical

## Rollout Plan

1. Phase 1: Package target split.
   Create `MacBridgeCore`, keep `macbridge` as a thin executable target, and
   add initial unit tests. This phase is already in progress.

2. Phase 2: Domain folder grouping.
   Move files into `Accessibility`, `Capture`, `CLI`, `Cursor`, `Desktop`,
   `Input`, and `Service` folders without changing behavior.

3. Phase 3: File and symbol naming cleanup.
   Rename broad files and symbols into concise pattern-based names. Keep each
   patch scoped to one domain.

4. Phase 4: Command noun normalization.
   Add noun-first commands while keeping current commands as compatibility
   aliases.

5. Phase 5: Test expansion.
   Add tests for argument parsing, display resolution, JSON payloads, and alias
   parity.

6. Phase 6: Compatibility review.
   Decide whether `.macOS(.v13)` remains valuable or whether the package should
   require `.macOS(.v14)`.

## Open Questions

- Should the canonical CLI grammar use `capture` and `act`, or should action
  verbs live directly under nouns such as `window click` and `display click`?
- How long should the existing `background` and `foreground-*` commands remain
  as compatibility aliases?
- Should the future TypeScript wrapper call the CLI only, the service mode, or
  both depending on workload?
- Should `MacBridgeCore` expose stable Swift data types for windows, displays,
  and screenshots, or should those remain CLI/JSON boundary concepts for now?
- Should macOS 13 remain supported after ScreenCaptureKit becomes central to
  capture reliability?
