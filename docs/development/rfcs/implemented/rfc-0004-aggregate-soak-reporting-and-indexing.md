---
id: RFC-0004
name: Aggregate Soak Reporting and Indexing
status: Implemented
owners:
    - MacBridge maintainers
created: 2026-05-02
updated: 2026-05-02
supersedes: []
superseded_by: null
---

# Aggregate Soak Reporting and Indexing

## Summary

MacBridge should automatically regenerate aggregate soak reports after every
completed soak run. Per-run files remain the durable evidence ledger, while
`soak/reports/latest.md`, `soak/reports/latest.json`, and a libSQL index provide
current cross-run statistics without requiring a separate user command.

## Context

RFC-0002 introduced per-run soak folders with `summary.json`, `events.ndjson`,
`report.md`, and artifacts. RFC-0003 refined timing visualizations. Those files
are useful local receipts, but the current approach also embeds recent history
inside each per-run report. That is helpful for context, but it is not the right
long-term analytics surface because each historical report becomes stale as soon
as the next run completes.

The repo should always have a current aggregate view after any soak command
finishes. This aggregate report should be derived from the run ledger rather
than manually maintained.

## Goals

- Automatically refresh aggregate reports after every completed soak run.
- Write `soak/reports/latest.md` for humans.
- Write `soak/reports/latest.json` for tools and future agents.
- Add a libSQL index at `soak/reports/index.db`.
- Keep `summary.json` and `events.ndjson` as the source of truth.
- Make the libSQL database rebuildable from files.
- Avoid requiring a separate report command for normal use.

## Non-Goals

- Replacing file-based run ledgers with a database.
- Building a web dashboard.
- Adding model-based judges.
- Rewriting previous per-run reports.
- Tracking generated aggregate reports in Git.

## Proposal

Each soak run should finish in this order:

1. Write the run's `summary.json`.
2. Write the run's `report.md`.
3. Read all run summaries and step event ledgers.
4. Write `soak/reports/latest.json`.
5. Write `soak/reports/latest.md`.
6. Rebuild or refresh `soak/reports/index.db`.

The aggregate Markdown report should include:

- total runs
- overall pass/fail rate
- pass/fail and duration statistics by regime
- latest run by regime
- slowest runs
- slowest steps across all runs
- step-level averages and p95 values
- recent history using the same block-element chart vocabulary

The aggregate JSON should include the same data in a stable shape suitable for
future agents.

The libSQL index should contain at least:

```text
runs(
  id text primary key,
  regime text,
  status text,
  started_at text,
  finished_at text,
  duration_ms integer,
  pass_count integer,
  fail_count integer,
  live_textedit integer,
  iterations integer,
  run_dir text,
  artifact_dir text
)

steps(
  run_id text,
  step_id text,
  name text,
  status text,
  started_at text,
  finished_at text,
  duration_ms integer,
  detail_json text,
  error text,
  primary key(run_id, step_id)
)
```

The database is an index. If it is deleted, the next soak run can rebuild it
from `soak/runs`.

## Alternatives Considered

- Add a separate `soak:report` command.
  This is useful as a future repair command, but normal users should not need to
  remember an extra step after every run.

- Store all aggregate history in a master JSONL file.
  A master log is attractive, but it introduces append contention and recovery
  questions. The per-run ledger already gives us atomic evidence folders.

- Make libSQL the source of truth.
  Rejected for now. Plain files are easier to inspect, archive, and recover.
  libSQL should accelerate and normalize queries, not own the only copy.

## Security Impact

Aggregate reports may include local file paths and timing metadata. They should
remain local and ignored by Git. No new macOS permissions are introduced.

## Reliability Impact

This improves reliability analysis because every run leaves both local evidence
and an updated cross-run view. Rebuilding the index from files keeps recovery
straightforward if the database is missing or corrupt.

Risk: aggregate report generation could fail after a successful run. Mitigation:
the per-run summary and event ledger are written first, and aggregate generation
should be treated as a post-processing step that can be retried by a future
repair command.

## Compatibility Impact

Existing run folders remain readable. The new aggregate files live under
`soak/reports` and do not change CLI command names. The `soak:tui` command may
continue scanning summaries directly or may consume aggregate JSON later.

## Testing and Quality Gates

- `bun run check:ts`
- `bun run soak:smoke`
- verify `soak/reports/latest.md`
- verify `soak/reports/latest.json`
- verify `soak/reports/index.db` exists and contains run/step rows

## Rollout Plan

1. Add this RFC. Complete.
2. Add aggregate statistics and report generation. Complete.
3. Add libSQL dependency and indexing. Complete.
4. Trigger aggregate refresh after every run. Complete.
5. Run smoke and inspect generated reports/database. Complete.
6. Mark this RFC implemented and commit. Complete.

## Open Questions

- Should a future `soak:report` repair command be exposed for explicit rebuilds?
- Should aggregate reports keep timestamped snapshots in addition to `latest`?
- Which step statistics should become contractual for model-based evaluators?
