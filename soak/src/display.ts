import type { RunSummary, Step } from "./types.ts";

function ms(value: number): string {
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(2)}s`;
}

function bar(value: number, max: number, width = 28): string {
  const filled = max <= 0 ? 0 : Math.max(1, Math.round((value / max) * width));
  return `${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}`;
}

function scoreBar(value: number, width = 30): string {
  const filled = Math.round(value * width);
  return `${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}`;
}

function pad(value: string, width: number): string {
  if (value.length >= width) return value.slice(0, width);
  return `${value}${" ".repeat(width - value.length)}`;
}

function score(run: RunSummary): number {
  const total = run.pass + run.fail;
  if (total === 0) return 0;
  return run.pass / total;
}

export function renderScoreChart(summaries: RunSummary[]): string {
  const recent = summaries.slice(-10);
  if (recent.length === 0) return "No runs yet.";

  const rows = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0];
  const scores = recent.map(score);
  const chart = rows.map((row) => {
    const cells = scores.map((value, index) => {
      const lower = row - 0.05;
      const upper = row + 0.05;
      const hit = value >= lower && value < upper;
      if (!hit && !(row === 1.0 && value === 1)) return "   ";
      return recent[index]?.status === "pass" ? " ● " : " × ";
    });
    return `${row.toFixed(1).padStart(3, " ")} ┤${cells.join("")}`;
  });

  const axis = `    └${"───".repeat(recent.length)}`;
  const labels = `     ${recent.map((_, index) => String(index + 1).padStart(2, " ")).join(" ")}`;

  return [
    "Score trend:",
    ...chart,
    axis,
    labels,
    "",
    "Legend: ● pass  × fail",
    "",
    "Run scores:",
    ...recent.map((run, index) => {
      const value = score(run);
      return ` r${String(index + 1).padStart(2, "0")} score ${value.toFixed(4)} [${scoreBar(value)}] ${run.status}`;
    }),
  ].join("\n");
}

export function renderStepDurations(steps: Step[]): string {
  const max = Math.max(1, ...steps.map((step) => step.durationMs));
  const lines = [
    "Step Durations:",
    " idx status duration  task",
    " ─────────────────────────────────────────────────────────────────────",
  ];

  steps.forEach((step, index) => {
    const status = step.status === "pass" ? "ok " : "bad";
    lines.push(
      ` ${String(index + 1).padStart(2, "0")}  ${status} ${pad(ms(step.durationMs), 8)} ${bar(step.durationMs, max)} ${step.name}`,
    );
  });

  return lines.join("\n");
}

export function renderExecutionWaterfall(steps: Step[], startedAt: string): string {
  const runStart = new Date(startedAt).getTime();
  const timed = steps.map((step) => {
    const startMs = Math.max(0, new Date(step.startedAt).getTime() - runStart);
    const endMs = startMs + step.durationMs;
    return { step, startMs, endMs };
  });
  const maxEnd = Math.max(1, ...timed.map((item) => item.endMs));
  const width = 36;
  const nameWidth = Math.min(34, Math.max(4, ...steps.map((step) => step.name.length)));
  const lines = [
    "Execution Waterfall:",
    ` idx item${" ".repeat(Math.max(1, nameWidth - 3))} status start    duration end      timeline`,
    " ─────────────────────────────────────────────────────────────────────",
  ];

  timed.forEach((item, index) => {
    const status = item.step.status === "pass" ? "ok " : "bad";
    const lead = Math.round((item.startMs / maxEnd) * width);
    const active =
      item.step.durationMs <= 0
        ? 0
        : Math.max(1, Math.round((item.step.durationMs / maxEnd) * width));
    const remaining = Math.max(0, width - lead - active);
    const marker = item.step.durationMs <= 0 ? "▏" : "█".repeat(active);
    const timeline = `${"░".repeat(lead)}${marker}${"░".repeat(remaining)}`;
    const name = pad(item.step.name, nameWidth);
    lines.push(
      ` ${String(index + 1).padStart(2, "0")}  ${name} ${status} ${pad(ms(item.startMs), 8)} ${pad(ms(item.step.durationMs), 8)} ${pad(ms(item.endMs), 8)} ${timeline}`,
    );
  });

  lines.push("");
  lines.push(" Legend: ░ inactive timeline  █ active step  ▏ zero-duration marker");

  return lines.join("\n");
}

export function renderHistory(summaries: RunSummary[]): string {
  const recent = summaries.slice(-20);
  const total = recent.length;
  const passed = recent.filter((run) => run.status === "pass").length;
  const rate = total === 0 ? 0 : passed / total;
  const max = Math.max(1, ...recent.map((run) => run.durationMs));
  const lines = [
    `Recent runs: ${passed}/${total} passed (${(rate * 100).toFixed(1)}%)`,
    " run                 regime  status duration",
    " ────────────────────────────────────────────────────────────────",
  ];

  for (const run of recent) {
    const status = run.status === "pass" ? "ok " : "bad";
    lines.push(
      ` ${run.id.slice(0, 19)} ${pad(run.regime, 6)} ${status} ${pad(ms(run.durationMs), 8)} ${bar(run.durationMs, max, 20)}`,
    );
  }

  return lines.join("\n");
}

export function renderRun(summary: RunSummary, history: RunSummary[]): string {
  const recording = summary.recordVideo ? ` | Recording: ${summary.recordTarget}` : "";
  return [
    `Run ${summary.id} ${summary.status.toUpperCase()} in ${ms(summary.durationMs)}`,
    `Regime: ${summary.regime} | Steps: ${summary.pass} passed, ${summary.fail} failed${recording} | Artifacts: ${summary.artifactDir}`,
    "",
    renderScoreChart(history),
    "",
    renderStepDurations(summary.steps),
    "",
    renderExecutionWaterfall(summary.steps, summary.startedAt),
    "",
    renderHistory(history),
  ].join("\n");
}
