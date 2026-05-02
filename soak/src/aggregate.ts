import { createClient } from "@libsql/client";
import { renderHistory } from "./display.js";
import { type RecordingEvidence, recordingEvidence } from "./evidence.js";
import { ensureDir, writeJSON } from "./fs.js";
import { readRunSteps } from "./history.js";
import { soakRoot } from "./paths.js";
import type { Regime, RunSummary, Status, Step } from "./types.js";

type DurationStats = {
  count: number;
  pass: number;
  fail: number;
  passRate: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

type RegimeStats = DurationStats & {
  regime: Regime;
};

type StepStats = DurationStats & {
  name: string;
};

type SlowRun = {
  id: string;
  regime: Regime;
  status: Status;
  startedAt: string;
  durationMs: number;
  reportPath: string;
};

type SlowStep = {
  runId: string;
  name: string;
  status: Status;
  startedAt: string;
  durationMs: number;
};

export type AggregateReport = {
  generatedAt: string;
  totalRuns: number;
  pass: number;
  fail: number;
  passRate: number;
  duration: DurationStats;
  byRegime: RegimeStats[];
  latestByRegime: Partial<Record<Regime, SlowRun>>;
  slowestRuns: SlowRun[];
  slowestSteps: SlowStep[];
  stepStats: StepStats[];
  recordings: RecordingEvidence[];
};

function reportsDir(): string {
  return `${soakRoot()}/reports`;
}

function latestJSON(): string {
  return `${reportsDir()}/latest.json`;
}

function latestMarkdown(): string {
  return `${reportsDir()}/latest.md`;
}

function indexPath(): string {
  return `${reportsDir()}/index.db`;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function ms(value: number): string {
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(2)}s`;
}

function p(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((percentile / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function durationStats(items: { status: Status; durationMs: number }[]): DurationStats {
  const durations = items.map((item) => item.durationMs);
  const pass = items.filter((item) => item.status === "pass").length;
  const fail = items.length - pass;
  const total = durations.reduce((sum, value) => sum + value, 0);
  return {
    count: items.length,
    pass,
    fail,
    passRate: items.length === 0 ? 0 : pass / items.length,
    avgMs: items.length === 0 ? 0 : Math.round(total / items.length),
    p50Ms: p(durations, 50),
    p95Ms: p(durations, 95),
    maxMs: Math.max(0, ...durations),
  };
}

function slowRun(run: RunSummary): SlowRun {
  return {
    id: run.id,
    regime: run.regime,
    status: run.status,
    startedAt: run.startedAt,
    durationMs: run.durationMs,
    reportPath: `${run.runDir}/report.md`,
  };
}

function bytes(value: number): string {
  return value < 1024 ? `${value}B` : `${(value / 1024).toFixed(1)}KiB`;
}

function recordingProbe(item: RecordingEvidence): string {
  const size =
    item.width == null || item.height == null ? undefined : `${item.width}x${item.height}`;
  return [
    item.backend,
    item.format,
    item.duration == null ? undefined : `${item.duration.toFixed(2)}s`,
    size,
  ]
    .filter(Boolean)
    .join(" ");
}

function recordingArtifact(item: RecordingEvidence): string {
  if (item.path == null) return item.error ?? "";
  return item.bytes == null ? item.path : `${item.path} (${bytes(item.bytes)})`;
}

export async function buildAggregate(history: RunSummary[]): Promise<AggregateReport> {
  const stepsByRun = new Map<string, Step[]>();
  for (const run of history) {
    stepsByRun.set(run.id, await readRunSteps(run));
  }

  const byRegime: RegimeStats[] = [];
  for (const regime of ["smoke", "stress", "burn"] as const) {
    const runs = history.filter((run) => run.regime === regime);
    byRegime.push({ regime, ...durationStats(runs) });
  }

  const latestByRegime: Partial<Record<Regime, SlowRun>> = {};
  for (const run of history) {
    const previous = latestByRegime[run.regime];
    if (previous == null || previous.startedAt < run.startedAt) {
      latestByRegime[run.regime] = slowRun(run);
    }
  }

  const allSteps = history.flatMap((run) =>
    (stepsByRun.get(run.id) ?? run.steps).map((step) => ({
      run,
      step,
    })),
  );

  const stepNames = new Map<string, Step[]>();
  for (const { step } of allSteps) {
    stepNames.set(step.name, [...(stepNames.get(step.name) ?? []), step]);
  }

  const stepStats = [...stepNames.entries()]
    .map(([name, steps]) => ({ name, ...durationStats(steps) }))
    .sort((a, b) => b.p95Ms - a.p95Ms || b.avgMs - a.avgMs)
    .slice(0, 20);
  const recordings = history
    .map((run) => recordingEvidence(run, stepsByRun.get(run.id) ?? run.steps))
    .filter((item) => item.status !== "off");

  return {
    generatedAt: new Date().toISOString(),
    totalRuns: history.length,
    pass: history.filter((run) => run.status === "pass").length,
    fail: history.filter((run) => run.status === "fail").length,
    passRate:
      history.length === 0
        ? 0
        : history.filter((run) => run.status === "pass").length / history.length,
    duration: durationStats(history),
    byRegime,
    latestByRegime,
    slowestRuns: [...history]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 10)
      .map(slowRun),
    slowestSteps: allSteps
      .sort((a, b) => b.step.durationMs - a.step.durationMs)
      .slice(0, 20)
      .map(({ run, step }) => ({
        runId: run.id,
        name: step.name,
        status: step.status,
        startedAt: step.startedAt,
        durationMs: step.durationMs,
      })),
    stepStats,
    recordings,
  };
}

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
  );
  const render = (row: string[]) =>
    row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join("  ");
  return [
    render(headers),
    render(widths.map((width) => "-".repeat(width))),
    ...rows.map(render),
  ].join("\n");
}

export function aggregateMarkdown(report: AggregateReport, history: RunSummary[]): string {
  const encoded = report.recordings.filter((item) => item.status === "pass");
  const failed = report.recordings.filter((item) => item.status === "fail");
  const missing = report.recordings.filter((item) => item.status === "missing");
  const latestRecordings = report.recordings.slice(-10);

  return [
    "# MacBridge Soak Aggregate",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Runs: ${report.totalRuns}`,
    `- Pass rate: ${report.pass}/${report.totalRuns} (${pct(report.passRate)})`,
    `- Duration avg/p50/p95/max: ${ms(report.duration.avgMs)} / ${ms(report.duration.p50Ms)} / ${ms(report.duration.p95Ms)} / ${ms(report.duration.maxMs)}`,
    "",
    "## By Regime",
    "",
    "```text",
    table(
      ["regime", "runs", "pass", "fail", "rate", "avg", "p50", "p95", "max"],
      report.byRegime.map((item) => [
        item.regime,
        String(item.count),
        String(item.pass),
        String(item.fail),
        pct(item.passRate),
        ms(item.avgMs),
        ms(item.p50Ms),
        ms(item.p95Ms),
        ms(item.maxMs),
      ]),
    ),
    "```",
    "",
    "## Latest By Regime",
    "",
    "```text",
    table(
      ["regime", "status", "duration", "run"],
      Object.entries(report.latestByRegime).map(([regime, run]) => [
        regime,
        run.status,
        ms(run.durationMs),
        run.id,
      ]),
    ),
    "```",
    "",
    "## Recording Evidence",
    "",
    `- Requested: ${report.recordings.length}`,
    `- Encoded: ${encoded.length}`,
    `- Failed: ${failed.length}`,
    `- Missing stop step: ${missing.length}`,
    "",
    "```text",
    table(
      ["status", "target", "frames", "artifact", "probe", "run"],
      latestRecordings.map((item) => [
        item.status,
        item.target,
        item.frames == null ? "" : String(item.frames),
        recordingArtifact(item),
        recordingProbe(item),
        item.runId,
      ]),
    ),
    "```",
    "",
    "## Slowest Runs",
    "",
    "```text",
    table(
      ["duration", "regime", "status", "run"],
      report.slowestRuns.map((run) => [ms(run.durationMs), run.regime, run.status, run.id]),
    ),
    "```",
    "",
    "## Slowest Steps",
    "",
    "```text",
    table(
      ["duration", "status", "step", "run"],
      report.slowestSteps.map((step) => [ms(step.durationMs), step.status, step.name, step.runId]),
    ),
    "```",
    "",
    "## Step Stats",
    "",
    "```text",
    table(
      ["step", "count", "fail", "avg", "p50", "p95", "max"],
      report.stepStats.map((step) => [
        step.name,
        String(step.count),
        String(step.fail),
        ms(step.avgMs),
        ms(step.p50Ms),
        ms(step.p95Ms),
        ms(step.maxMs),
      ]),
    ),
    "```",
    "",
    "## Recent Runs",
    "",
    "```text",
    renderHistory(history),
    "```",
    "",
  ].join("\n");
}

export async function indexAggregate(history: RunSummary[]): Promise<void> {
  await ensureDir(reportsDir());
  const client = createClient({ url: `file:${indexPath()}` });
  try {
    await client.executeMultiple(`
      drop table if exists steps;
      drop table if exists recordings;
      drop table if exists runs;
      create table runs (
        id text primary key,
        regime text not null,
        status text not null,
        started_at text not null,
        finished_at text not null,
        duration_ms integer not null,
        pass_count integer not null,
        fail_count integer not null,
        live_textedit integer not null,
        live_helium integer not null,
        record_video integer not null,
        record_target text not null,
        iterations integer not null,
        run_dir text not null,
        artifact_dir text not null
      );
      create table steps (
        run_id text not null,
        step_id text not null,
        name text not null,
        status text not null,
        started_at text not null,
        finished_at text not null,
        duration_ms integer not null,
        detail_json text,
        error text,
        primary key (run_id, step_id)
      );
      create table recordings (
        run_id text primary key,
        target text not null,
        status text not null,
        frames integer,
        video_path text,
        bytes integer,
        backend text,
        format text,
        duration_s real,
        width integer,
        height integer,
        manifest text,
        error text
      );
    `);

    const statements = [];
    for (const run of history) {
      const steps = await readRunSteps(run);
      statements.push({
        sql: `insert into runs (
          id, regime, status, started_at, finished_at, duration_ms, pass_count,
          fail_count, live_textedit, live_helium, record_video, record_target, iterations, run_dir,
          artifact_dir
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          run.id,
          run.regime,
          run.status,
          run.startedAt,
          run.finishedAt,
          run.durationMs,
          run.pass,
          run.fail,
          run.liveTextEdit ? 1 : 0,
          run.liveHelium ? 1 : 0,
          run.recordVideo ? 1 : 0,
          run.recordTarget ?? "display",
          run.iterations,
          run.runDir,
          run.artifactDir,
        ],
      });

      const recording = recordingEvidence(run, steps);
      statements.push({
        sql: `insert into recordings (
          run_id, target, status, frames, video_path, bytes, backend, format, duration_s, width,
          height, manifest, error
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          recording.runId,
          recording.target,
          recording.status,
          recording.frames ?? null,
          recording.path ?? null,
          recording.bytes ?? null,
          recording.backend ?? null,
          recording.format ?? null,
          recording.duration ?? null,
          recording.width ?? null,
          recording.height ?? null,
          recording.manifest ?? null,
          recording.error ?? null,
        ],
      });

      for (const step of steps) {
        statements.push({
          sql: `insert into steps (
            run_id, step_id, name, status, started_at, finished_at, duration_ms,
            detail_json, error
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            run.id,
            step.id,
            step.name,
            step.status,
            step.startedAt,
            step.finishedAt,
            step.durationMs,
            step.detail == null ? null : JSON.stringify(step.detail),
            step.error ?? null,
          ],
        });
      }
    }

    if (statements.length > 0) {
      await client.batch(statements, "write");
    }
  } finally {
    client.close();
  }
}

export async function writeAggregateReports(history: RunSummary[]): Promise<AggregateReport> {
  await ensureDir(reportsDir());
  const report = await buildAggregate(history);
  await writeJSON(latestJSON(), report);
  await Bun.write(latestMarkdown(), aggregateMarkdown(report, history));
  await indexAggregate(history);
  return report;
}
