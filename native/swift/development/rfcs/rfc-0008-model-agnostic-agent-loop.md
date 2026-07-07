---
id: RFC-0008
name: Model Agnostic Agent Loop
status: In Progress
owners:
    - MacBridge maintainers
created: 2026-05-02
updated: 2026-05-02
supersedes: []
superseded_by: null
---

# Model Agnostic Agent Loop

## Summary

MacBridge should define a model-agnostic agent loop contract that separates the
deterministic native macOS runtime from any AI planner. MacBridge remains the
tooling layer for screenshots, structured app/window/display state,
Accessibility inspection, permissions, and input execution; agent runtimes
consume that evidence, decide the next action, and call MacBridge commands.

## Context

MacBridge can already run without AI for scripted smoke, stress, and burn
regimes. Those tests prove known workflows by executing deterministic commands
and checking structured outcomes such as window titles, screenshots, and
Accessibility roles.

The product direction is broader: MacBridge should also serve TypeScript-first
agent systems where a model sees screenshots and JSON state, reasons about the
current UI, and chooses commands. That architecture should not bind MacBridge to
one model provider or one inference runtime. The same native adapter should be
usable by OpenAI models, local models, other hosted models, deterministic
scripts, and hybrid systems.

This RFC exists to make the boundary explicit:

- MacBridge is not the AI.
- MacBridge is the native macOS capability and evidence layer.
- The agent loop owns perception, planning, retry policy, and task intent.

## Goals

- Define a clear contract between MacBridge and model-driven runtimes.
- Keep MacBridge usable without AI for deterministic tests and automation.
- Make screenshots and structured state first-class evidence returned to an
  agent loop.
- Support multiple model providers and local models without changing native
  Swift internals.
- Provide TypeScript reference harnesses for observe-plan-act workflows.
- Record enough evidence to explain why an action was taken and whether it
  succeeded.
- Preserve permission checks and macOS safety gates before any live control
  workflow runs.

## Non-Goals

- Selecting a single blessed AI provider.
- Building a general-purpose autonomous desktop agent in the first pass.
- Hiding macOS permission prompts or bypassing TCC.
- Replacing deterministic soak tests with AI-only tests.
- Guaranteeing that a model always chooses the correct UI action.
- Shipping a hosted service or remote control plane.

## Proposal

Add a model-agnostic agent loop as a TypeScript harness layer over the existing
native CLI and service APIs.

The loop should use a small set of stable concepts:

- `observe`: collect screenshot artifacts, active window/app state, display
  geometry, permission state, and optional Accessibility snapshots.
- `decide`: pass the observation to a planner. The planner may be an AI model,
  a deterministic policy, or a test fixture.
- `act`: execute one MacBridge command or a bounded command sequence.
- `verify`: collect follow-up state and decide whether the action achieved its
  intended effect.
- `record`: persist observations, planner decisions, commands, screenshots,
  stdout/stderr, timing, and validation results.

The initial implementation should prefer TypeScript interfaces over a heavy
framework:

```ts
type Observation = {
  screenshot?: {
    path: string;
    width: number;
    height: number;
  };
  windows: unknown[];
  displays: unknown[];
  permissions: unknown;
  accessibility?: unknown;
};

type PlannedAction = {
  command: string[];
  reason?: string;
  expected?: string;
};

type Planner = (observation: Observation) => Promise<PlannedAction>;
```

MacBridge commands should remain model-neutral. They should expose observable
state and deterministic controls, not provider-specific prompts or schemas.
Provider adapters can translate observations into the model format they need.

`vercel-labs/ai-cli` should be treated as a strong reference implementation for
the provider bridge. Its useful properties for MacBridge are:

- it is TypeScript/Bun-oriented
- it uses the Vercel AI SDK and AI Gateway for multi-provider model access
- it supports provider-qualified model IDs such as `openai/...`,
  `anthropic/...`, and `google/...`
- it has simple stdin/stdout-oriented text generation semantics
- it supports explicit model selection through `-m`/`--model`
- it can list available models through `ai models`

The first MacBridge implementation should not depend on shelling out to
`ai-cli` as the only planner path. Instead, MacBridge should model the planner
interface directly and consider a Vercel AI SDK / AI Gateway adapter as one
provider implementation. A shell-out adapter to `ai text --json` can still be
valuable for early experiments because it keeps the bridge thin and easy to
inspect.

The first reference workflows should be small and auditable:

1. Observe a Helium window after launch and maximize.
2. Ask a planner to identify the search box from screenshot/state.
3. Execute the planner's chosen input command.
4. Verify navigation through title, screenshot, and optional AX evidence.

The soak suite should keep deterministic Helium coverage, then optionally gain
an AI-assisted regime once the observation/decision contract is stable.

## Alternatives Considered

- Bake one model API directly into MacBridge.
  This would move too much orchestration into the native adapter and make
  provider experimentation harder.

- Keep all AI integration outside this repository.
  This preserves a small core but leaves the most important product contract
  implicit and untested.

- Make soak tests AI-driven immediately.
  This would test the product vision, but it would make reliability regressions
  harder to diagnose because model behavior is nondeterministic.

- Only support screenshot-based planning.
  Screenshots are essential, but Accessibility and window/display JSON provide
  important grounding, validation, and debuggability.

- Shell out exclusively to `ai-cli` for all planner calls.
  This is attractive for early testing, but it would make process execution,
  output parsing, timeout behavior, and JSON contracts part of MacBridge's core
  planning path. A direct TypeScript adapter can share the same provider
  benefits while keeping the agent loop easier to validate.

## Security Impact

The agent loop must preserve MacBridge's explicit permission model. Live control
flows should run `permissions check --require` before capture or input, and
permission failures should stop the workflow.

Planner output is untrusted, even when generated by a model. The harness should
validate planned commands against an allowlist, support dry-run mode, bound the
number of actions per task, and record every command before execution.

Sensitive screenshot data may include private user content. Logs and artifacts
must be repo-local by default for development, ignored by git, and documented as
potentially sensitive.

## Reliability Impact

Separating observation, planning, action, and verification makes failures easier
to diagnose. A failed run should show whether the issue was capture, model
choice, command execution, permission state, or verification.

Deterministic soak regimes remain the reliability floor. AI-assisted regimes
should be additive and should report model/provider/version metadata so flaky
behavior can be compared across planners.

## Compatibility Impact

The native CLI should remain backward compatible where possible. The new agent
loop is additive TypeScript surface area and should consume existing commands:
`windows`, `displays`, `capture`, `background`, `foreground-*`,
`permissions`, and `service`.

Provider adapters should depend on a stable observation/action interface rather
than native Swift types. This keeps future model swaps from forcing native
changes.

## Testing and Quality Gates

- `bun run check`
- Deterministic smoke/stress/burn regimes remain required.
- `bun run soak:stress:helium`
- `bun run soak:burn:helium`
- Add unit tests for observation schema construction.
- Add unit tests for planner command validation and allowlist rejection.
- Add a deterministic fixture planner before adding live model calls.
- For AI-assisted regimes, record model/provider/version metadata and preserve
  screenshots plus JSON observations for review.

## Rollout Plan

1. Land this RFC as a Draft to document the architecture boundary. Done.
2. Add TypeScript observation and action types under the package source. Done.
3. Add a deterministic fixture planner and a tiny observe-plan-act harness.
   Done for the reusable TypeScript API and `agent plan/run` CLI path.
4. Wire Helium as the first reference workflow without live AI calls. In
   progress through the deterministic soak suite; next step is to move that
   workflow onto the public session API.
5. Add a Vercel AI SDK / AI Gateway planner adapter behind an explicit opt-in
   flag.
6. Add an `ai-cli` shell-out adapter only as an experiment or compatibility
   path.
7. Add an optional AI-assisted soak regime after deterministic harness tests are
   stable.

## Implementation Notes

The first implementation slice adds the core API names:

- `Session`
- `Planner`
- `PlannedAction`
- `Expectation`
- `Verification`
- `ActionPolicy`
- `ControlPlane`

Planner output is validated with Zod before execution. `command` actions remain
blocked by default and require explicit prefix allowlists. `Session.runOnce`
records observation, plan, action result, verification result, and artifacts in
a repo-local session directory.

The TypeScript API and repo CLI are protocols over the same control plane. The
default control plane is the `MacBridge` client, while `Session` can accept an
injected `ControlPlane` for tests or future transports. CLI commands should call
that shared session/control surface instead of duplicating execution behavior.

Planner adapters are independent of the control plane. The first adapter seam
includes `PlannerAdapter`, `adapterPlanner`, `parsePlannerOutput`, and a generic
`shellPlanner`. This gives `ai-cli`, local models, and future Vercel AI SDK or
AI Gateway adapters the same contract: receive `PlannerInput`, return a
validated `PlannedAction`.

## Open Questions

- What should the first public TypeScript API be named: `observe`, `agent`,
  `session`, or something narrower?
- Should observations include raw screenshots only, or also generated image
  dimensions and checksums?
- What command allowlist is safe enough for a first AI-assisted live regime?
- Should model calls live in this package, examples, or separate adapters?
- Should the first live provider bridge use Vercel AI SDK directly, shell out
  to `ai-cli`, or support both behind a common planner interface?
- How should we redact or expire screenshot artifacts that may contain private
  user data?
- Should the service protocol grow a first-class batch command for
  observe-plan-act loops?
