---
id: RFC-0002
name: Soak Regime and Run Ledger
status: Implemented
owners:
    - MacBridge maintainers
created: 2026-05-02
updated: 2026-05-03
supersedes: []
superseded_by: null
---

# Soak Regime and Run Ledger

## Summary

MacBridge should have a first-class TypeScript soak module that records every
smoke, stress, and burn run into a durable local run directory. Each run should
include machine-readable JSON summaries, append-only JSONL events, human-readable
Markdown reports, terminal charts, and screenshot/text artifacts.

## Goals

- Promote soak testing out of one-off scripts and into `soak/src`.
- Support `smoke`, `stress`, `burn`, and `tui` commands through Bun.
- Persist run history under a durable local ledger shared by the app shell, npm
  CLI, and Bun development commands.
- Record per-step timings as a waterfall.
- Show success/fail rates over time.
- Keep live macOS automation opt-in.
- Use JSONL as the default append-only event ledger.
- Prevent concurrent local soak runs from contending for the same native
  automation surfaces.
- Keep the shape compatible with a future libSQL index and model-based judges.

## Non-Goals

- Adding a long-running dashboard server.
- Replacing Swift unit tests.
- Requiring live GUI automation in ordinary CI.
- Introducing AI judges in this first pass.

## Structure

```text
soak/
  src/
    cli.ts
    context.ts
    display.ts
    fs.ts
    history.ts
    probes.ts
    regime.ts
    report.ts
    types.ts

~/macbridge/soak/
  runs/
    <timestamp>-<regime>/
      summary.json
      events.ndjson
      report.md
      artifacts/
```

`soak/src` is checked-in product source. `~/macbridge/soak` is generated user
state. `MACBRIDGE_SOAK_ROOT` may override the ledger root for tests and isolated
advanced workflows, but ordinary development and installed usage should share
the home-directory ledger so history is not split by launch surface.

`events.ndjson` is the canonical append-only event log for step-level results.
`summary.json` is the compact machine-readable run result. `report.md` is the
human-readable report for review and sharing.

## Regimes

- `smoke`: fast discovery and capture checks.
- `stress`: broad single-run exercise across discovery, capture, service,
  cursor, window capture, and optional live TextEdit AX input.
- `burn`: repeated stress-style iterations for timing drift, flake detection,
  and service/cursor cleanup confidence.
- `tui`: terminal history view over previous run summaries.

## Reporting

The soak module should render:

- score trend over recent runs
- run score bars
- step waterfall timings
- recent pass/fail history

The waterfall is intentionally part of the product posture. It tells us where
the native adapter spends time and gives future model-based evaluators a stable
place to attach assessment latency.

## Future Work

- Add a libSQL index over `events.ndjson` and `summary.json`.
- Add explicit evaluator slots for model-based judges.
- Add failure artifact grouping under `failures/`.
- Add configurable burn duration and pacing.
