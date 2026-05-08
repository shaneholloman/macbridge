---
id: RFC-0009
name: Public TypeScript API and CLI Semantics
status: Implemented
owners:
    - MacBridge maintainers
created: 2026-05-02
updated: 2026-05-02
supersedes: []
superseded_by: null
---

# Public TypeScript API and CLI Semantics

## Summary

MacBridge should define its public TypeScript API before expanding the CLI
surface further. The CLI should become a thin projection of stable TypeScript
concepts rather than the place where behavior is invented. This keeps the npm
package ergonomic for agent runtimes while preserving a predictable command
grammar for humans, scripts, and soak regimes.

## Context

MacBridge is a TypeScript-first macOS adapter with a native Swift runtime. The
Swift CLI already exposes useful primitives for displays, windows, capture,
input, permissions, service transport, and soak validation. Recent work added
package delivery, signing, permission checks, Helium live soaks, and window
geometry controls.

The next risk is semantic drift. If each new workflow adds one-off commands
without a public API model, MacBridge may become difficult to wrap, test,
document, and evolve. The package should instead expose a small set of
composable TypeScript APIs, with CLI commands mapping cleanly onto those APIs.

This RFC complements RFC-0008. RFC-0008 defines the model-agnostic agent loop.
RFC-0009 defines the public API and CLI semantics that should support that loop.

## Goals

- Define stable public TypeScript nouns and interfaces.
- Keep native CLI commands aligned with the public API.
- Make package exports useful without requiring shell parsing.
- Preserve deterministic, scriptable CLI behavior for tests and humans.
- Establish JSON input/output conventions before the command surface grows.
- Borrow proven command semantics from the `ai-cli` donor where appropriate:
  model IDs, explicit flags, JSON metadata, and predictable exit behavior.
- Make observations, actions, results, artifacts, and sessions first-class.

## Non-Goals

- Implementing every API in the first pass.
- Replacing the native Swift CLI with TypeScript.
- Designing the full AI provider adapter surface; that belongs primarily to
  RFC-0008.
- Freezing command names forever before the first public release.
- Building a general-purpose TUI or GUI.

## Proposal

Define the TypeScript API first, then map CLI commands to it.

The public API and the CLI must share one control plane protocol. `ControlPlane`
is the semantic boundary for native macOS operations and composed agent
workflows: permissions, displays, windows, frames, capture, accessibility dumps,
observations, and typed actions. `MacBridge` is the concrete native-backed
implementation. CLI tools, sessions, recorders, and soak workflows should accept
or create a `ControlPlane` rather than inventing parallel execution paths.

Core public types should include:

```ts
type Target =
  | { kind: "window"; wid: number }
  | { kind: "app"; name?: string; bundleID?: string; pid?: number }
  | { kind: "display"; display: "main" | number | string }
  | { kind: "desktop" };

type Observation = {
  id: string;
  target: Target;
  capturedAt: string;
  permissions: PermissionReport;
  displays: DisplayInfo[];
  windows: WindowInfo[];
  targetScreenshot?: Artifact;
  displayScreenshot?: Artifact;
  accessibility?: unknown;
  summary?: ObservationSummary;
};

type Action =
  | { type: "activate"; target: Target }
  | { type: "click"; target: Target; point: Point }
  | { type: "type"; target: Target; text: string; at?: Point; replace?: boolean }
  | { type: "press"; target: Target; key: string; modifiers?: string[] }
  | { type: "axAction"; target: Target; point: Point; action: string }
  | { type: "setFrame"; target: Target; frame: Rect }
  | { type: "maximize"; target: Target; display?: string | number; margin?: number }
  | { type: "command"; argv: string[] };

type ActionResult = {
  id: string;
  action: Action;
  status: "pass" | "fail";
  startedAt: string;
  finishedAt: string;
  stdout?: string;
  stderr?: string;
  artifacts: Artifact[];
  error?: string;
};

type Session = {
  id: string;
  observe(input: ObserveInput): Promise<Observation>;
  act(action: Action): Promise<ActionResult>;
  verify(expectation: Expectation, observation?: Observation): Promise<ActionResult>;
};
```

The first implementation should be intentionally small:

- Export a `MacBridge` client from `src/index.ts`.
- Keep `src/macbridge.ts` as the low-level command runner.
- Add structured wrappers for:
  - permissions check
  - displays list/info
  - windows list/frame/maximize/activate
  - capture window/display/desktop
  - background click/type/press/ax-action
- Add observation helpers that combine these primitives into a single object.
- Add action helpers that execute typed actions through existing native
  commands.

Complex-app discovery should be part of the API design loop. A read-only
Outlook observation probe showed that Accessibility can expose useful semantic
targets such as toolbars, folder rows, the message list, message cells, and the
reading pane. It also showed that raw AX descriptions may include private mail
subjects and message previews. The API should therefore support both raw
artifacts for local debugging and smaller redacted summaries for model prompts,
logs, and reports.

The default summary artifact should be `summary.redacted.json`. It should
preserve structural facts such as roles, actions, bounds, target window,
permission state, display geometry, artifact paths, and capture scope. It should
redact user-content strings such as window titles, AX titles, AX descriptions,
AX values, labels, and text. Raw artifacts can still exist locally in the same
observation directory, but the redacted summary is the intended model/log input.

Initial CLI grammar should mirror API nouns:

```sh
bun run observe app Helium --out tmp/observations/helium
bun run observe window <wid> --target-screenshot --display-screenshot main --ax --out tmp/observations/window
bun run act action.json
macbridge verify observation.json expectation.json
macbridge agent models --type text --provider openai --json
macbridge agent plan observation.json --model openai/gpt-5.5 --out action.json
macbridge agent run helium-search --model openai/gpt-5.5
```

The CLI should follow these semantic rules:

- Commands that emit machine-readable state must support `--json` or be JSON by
  default.
- Commands that write artifacts should print or return artifact paths.
- Observation commands should prefer artifact directories containing
  `observation.json`, target screenshots, optional full-display sanity
  screenshots, AX dumps, and optional redacted summaries rather than a single
  overloaded JSON file.
- Complex-app workflows should normalize the target window before observation,
  usually by maximizing it to an explicit display. This reduces visual noise
  from background apps while avoiding macOS full-screen Spaces unless a workflow
  explicitly needs that mode.
- Target/window screenshots and display screenshots answer different questions:
  the target screenshot is the clean app crop for reading the app, while the
  display screenshot proves what is actually visible on the user's monitor.
- Commands should fail nonzero on malformed input, missing permission, failed
  native command, or failed verification.
- Live-control commands should support explicit target selectors rather than
  relying on frontmost state.
- Coordinates should always declare or inherit `pixel`, `normalized`, or
  `global`.
- Agent/model commands should use `provider/model` identifiers and explicit
  `--model` selection.

The native Swift CLI remains the execution engine. The public TypeScript API is
the stable package interface that knows how to call it, validate results, and
compose higher-level workflows.

The TypeScript CLI is therefore a protocol adapter over the same control plane,
not a second control surface. New command semantics should either call existing
`ControlPlane` methods or extend the protocol first.

The implemented source layout keeps this boundary explicit:

- `src/core/control.ts` owns the `ControlPlane` protocol.
- `src/core/client.ts` owns the native-backed `MacBridge` implementation.
- `src/cli/command.ts` owns reusable command grammar and command adapter
  semantics for act, observe, and verify.
- `src/agent/command.ts` owns reusable agent command grammar and deterministic
  model, plan, and run semantics.
- `src/protocol` owns public schema and shared data types.
- `src/agent`, `src/media`, `src/native`, and `src/observe` own their domain
  implementations and tests.
- `src/apps` owns app-specific adapters such as Helium, TextEdit, Ghostty,
  Terminal, and Outlook. Adapters own app identity, launch/readiness, window
  selection, cleanup, and app-specific observation behavior.
- `src/cli/main.ts` owns the TypeScript product CLI entrypoint. `tools/` is not
  a valid product boundary.

## Alternatives Considered

- Grow the Swift CLI first and wrap it later.
  This is fast locally but risks baking accidental command grammar into the
  product.

- Expose only low-level `run(args)` helpers in TypeScript.
  This is flexible but does not give package consumers a stable semantic API.

- Build only an agent-oriented API.
  This would underserve deterministic automation, integration tests, and users
  who want direct native primitives.

- Copy `ai-cli` command semantics wholesale.
  The donor is useful for provider/model routing, but MacBridge has different
  nouns: observation, action, target, artifact, permission, and verification.

## Security Impact

The public API must preserve permission gates. High-level observe and act flows
should expose permission state and fail clearly when Accessibility or Screen
Recording is required but absent.

Typed actions should be easier to allowlist than raw argv. Any agent-facing API
must validate commands before execution, record the action, and support bounded
execution.

Artifacts may contain screenshots of private user data. The API should make
artifact paths explicit and document that observations are sensitive.

Accessibility artifacts may also contain private text, even when no screenshot
is viewed. Outlook discovery showed message subjects and previews in AX cell
descriptions. Agent-facing summaries should redact or truncate user-content
fields by default unless a workflow explicitly requests raw local artifacts.
The default redaction policy should report how many text fields were redacted
and whether large arrays or deep objects were truncated.

## Reliability Impact

A typed API gives tests stable objects to validate instead of parsing command
output. It also makes failures easier to categorize: target resolution,
permission state, capture, action execution, or verification.

The CLI remains important for manual debugging and soak runs, but it should use
the same concepts as the API so fixes in one layer reinforce the other.

## Compatibility Impact

MacBridge is still greenfield, so this RFC may rename or reshape pre-release
TypeScript exports. Native CLI compatibility should remain reasonable, but
public npm semantics should take priority before first release.

Once implemented, future command additions should map to existing API nouns or
extend the API first.

## Testing and Quality Gates

- `bun run check`
- TypeScript unit tests for target parsing and typed action validation.
- TypeScript unit tests for observation schema construction.
- TypeScript unit tests for redacted observation summary construction.
- Native tests for any new CLI argument parsing.
- `bun run soak:stress:helium`
- `bun run soak:burn:helium`
- Package contract verification for exported `src/index.ts` types.
- RFC sync/check before moving this RFC out of Draft.

## Rollout Plan

1. Land this RFC as a Draft.
2. Define public TypeScript types under `src/`.
3. Add `src/index.ts` exports for the low-level runner and typed client.
4. Implement the smallest useful `MacBridge.observe()` and `MacBridge.act()`
   vertical slice.
5. Add a read-only Outlook observation harness to pressure-test complex app AX
   semantics.
6. Add redacted observation summaries for complex apps. The first implementation
   writes `summary.redacted.json` from `MacBridge.observe()`.
7. Add a TypeScript CLI wrapper for `observe` as `bun run observe`, keeping the
   native package binary focused on native primitives until the final public CLI
   projection is ready. Add the paired `bun run act` wrapper for typed action
   JSON.
8. Refactor Helium deterministic workflow to use the typed API where practical.
9. Add agent/model CLI semantics after the base API is stable.

## Implementation Status

The first public API slice is now in place:

- `src/index.ts` exports the `MacBridge` client, low-level runner helpers, public
  types, and Zod schemas for public action boundaries.
- `MacBridge.observe()` writes `observation.json`, `summary.redacted.json`,
  target screenshots, optional display screenshots, and optional AX dumps.
- `MacBridge.act()` supports typed `activate`, `click`, `type`, `press`,
  `axAction`, `setFrame`, `maximize`, and raw `command` actions.
- `bun run observe` and `bun run act` provide TypeScript CLI wrappers over the
  stable API nouns.
- `bun run agent models` establishes the first model-command semantics:
  configured models are listed as explicit `provider/model` IDs with
  `--type`, `--provider`, and `--json` filters borrowed from the `ai-cli` donor
  shape.
- The native CLI has an explicit `windows activate` / `activate` primitive for
  workflows that intentionally need foreground accessibility behavior.
- The Helium live workflow now uses the typed API for window discovery,
  maximize, activation, capture, navigation, search, and result activation. It
  tries AXPress and mouse click first, then falls back to a deterministic
  keyboard path when the browser content AX tree is not exposed to the current
  automation session.

Agent `plan` and `run` execution remain intentionally reserved for RFC-0008's
model loop rather than smuggled into this deterministic API slice.

## Open Questions

- Should `MacBridge` be a class, factory function, or set of pure helpers?
- Should CLI `observe` be implemented in TypeScript, Swift, or both?
- Should observations be written as plain JSON or as a directory containing
  JSON plus artifacts?
- Should the package expose Zod schemas for every public type?
- Should redacted summaries preserve any short labels for navigation, or should
  all user-content labels remain fully opaque by default?
- How much of the native command grammar should remain public once typed
  actions exist?
- Should the first CLI wrapper live under `macbridge observe` or a separate
  TypeScript entrypoint?
