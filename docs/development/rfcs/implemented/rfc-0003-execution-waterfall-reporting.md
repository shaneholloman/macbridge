---
id: RFC-0003
name: Execution Waterfall Reporting
status: Implemented
owners:
    - MacBridge maintainers
created: 2026-05-02
updated: 2026-05-02
supersedes: []
superseded_by: null
---

# Execution Waterfall Reporting

## Summary

MacBridge soak reports should distinguish step duration charts from true
execution waterfall charts. The existing per-step duration bar chart is useful
and should remain, but it must be renamed because it does not show when each
step began relative to the run. A new execution waterfall should show each
step's start offset, duration, end offset, and a shared timeline that uses the
same `█` and `░` visual vocabulary as the step duration chart.

## Context

RFC-0002 introduced a TypeScript soak module with run folders, JSON summaries,
JSONL event ledgers, reports, and terminal timing charts. The initial report
called the per-step duration bars a "Waterfall." That label is inaccurate. A
duration chart answers "how long did this step take?" A waterfall answers
"where did this step happen in the run timeline?"

This distinction matters early because MacBridge will eventually measure
multiple classes of work:

- native macOS automation
- harness orchestration
- waits for app or permission state
- future model-based evaluators
- cleanup and recovery behavior

The reporting vocabulary should be correct before consumers start relying on
the reports.

## Goals

- Rename the current "Waterfall" chart to "Step Durations."
- Add a separate "Execution Waterfall" chart.
- Show explicit timing columns: start offset, duration, and end offset.
- Show inactive timeline cells before a step starts.
- Show active execution blocks after the lead-in on a shared run timeline.
- Keep reports terminal-friendly and Markdown-friendly.
- Preserve existing `summary.json` and `events.ndjson` compatibility.

## Non-Goals

- Adding graphical image rendering.
- Adding interactive terminal controls.
- Modeling concurrent step execution in this pass.
- Changing the soak event storage format.
- Adding model-based evaluators.

## Proposal

The report order should become:

1. `Score Trend`
2. `Step Durations`
3. `Execution Waterfall`
4. `Recent Runs`

### Step Durations

The existing duration-only chart should be renamed:

```text
Step Durations:
 idx status duration  task
 ─────────────────────────────────────────────────────────────────────
 01  ok  12ms     ██░░░░░░░░░░░░ service stop
 02  ok  8ms      █░░░░░░░░░░░░░ cursor stop
```

This chart is scaled by the slowest step duration. It intentionally ignores
start offset and idle time.

### Execution Waterfall

The new waterfall should use a shared run timeline and combine timing columns
with the same bar style as `Step Durations`:

```text
Execution Waterfall:
 idx status start    duration end      timeline
 ─────────────────────────────────────────────────────────────────────
 01  ok     0ms      12ms     12ms     █
 02  ok     12ms     8ms      20ms     ░█░░░░
 03  ok     21ms     25ms     46ms     ░░██░░
 04  ok     47ms     113ms    160ms    ░░░██████
```

Legend:

- `░` means inactive timeline space, including elapsed time before the step
  began.
- `█` means active execution time for the step.
- `▏` may be used for zero-duration marker steps.

The timeline should derive offsets from each step's `startedAt` relative to the
run's `startedAt`. The chart should compute end offset as
`startOffsetMs + durationMs`. The renderer may infer offsets from existing
fields instead of changing the persisted schema in this pass.

## Alternatives Considered

- Rename the existing chart only.
  This would fix terminology but would not provide the timeline visibility that
  soak reporting needs.

- Replace the existing chart with a waterfall.
  This would lose the useful duration-only view. Both views answer different
  questions and should coexist.

- Store explicit `offsetMs` in every step immediately.
  This is likely useful later, but the current step timestamps are enough to
  implement the first waterfall without changing the ledger schema.

## Security Impact

No new permission-sensitive behavior is introduced. Reports may include local
artifact paths and timing metadata, so they should remain local by default.

## Reliability Impact

This improves reliability analysis by separating slow operations from idle or
waiting time. It also makes future regressions easier to localize because the
run report will show both individual durations and whole-run placement.

Risk: very short steps may disappear visually if scaled too aggressively.
Mitigation: render at least one active block for non-zero durations and use a
marker for zero-duration steps.

## Compatibility Impact

Existing run summaries and event ledgers remain readable. Existing reports are
not rewritten. New reports will use the corrected section names and additional
waterfall section.

The exported function name changes from `renderWaterfall` to
`renderStepDurations`, with a new `renderExecutionWaterfall` function.

## Testing and Quality Gates

- `bun run check:ts`
- `bun run soak:smoke`
- `bun run soak:tui`
- inspect a generated `report.md` for both `Step Durations` and
  `Execution Waterfall`

## Rollout Plan

1. Add this RFC. Complete.
2. Rename the current duration chart in code and reports. Complete.
3. Add the execution waterfall renderer. Complete.
4. Run a new soak smoke report and verify both timing views. Complete.
5. Commit the RFC and implementation together. Complete.

## Open Questions

- Should future ledgers persist explicit `offsetMs` and `endOffsetMs` per step?
- Should the waterfall eventually support nested suites or concurrent tasks?
- Should a future libSQL index materialize timing offsets for faster querying?
