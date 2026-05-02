import {
  renderExecutionWaterfall,
  renderHistory,
  renderScoreChart,
  renderStepDurations,
} from "./display.js";
import { recordingEvidence } from "./evidence.js";
import type { RunSummary } from "./types.js";

function bytes(value: number): string {
  return value < 1024 ? `${value}B` : `${(value / 1024).toFixed(1)}KiB`;
}

function recordingLines(summary: RunSummary): string[] {
  const recording = recordingEvidence(summary);
  if (recording.status === "off") return ["- Status: off"];

  const probe =
    recording.width == null || recording.height == null
      ? undefined
      : `${recording.width}x${recording.height}`;

  return [
    `- Status: ${recording.status}`,
    `- Target: ${recording.target}`,
    recording.frames == null ? undefined : `- Frames: ${recording.frames}`,
    recording.path == null
      ? undefined
      : `- Video: ${recording.path}${recording.bytes == null ? "" : ` (${bytes(recording.bytes)})`}`,
    recording.backend == null &&
    recording.format == null &&
    recording.duration == null &&
    probe == null
      ? undefined
      : `- Probe: ${[recording.backend, recording.format, recording.duration == null ? undefined : `${recording.duration.toFixed(2)}s`, probe].filter(Boolean).join(" ")}`,
    recording.manifest == null ? undefined : `- Manifest: ${recording.manifest}`,
    recording.error == null ? undefined : `- Error: ${recording.error}`,
  ].filter((line) => line != null);
}

export function markdownReport(summary: RunSummary, history: RunSummary[]): string {
  const recent = history.slice(-20);
  const passed = recent.filter((run) => run.status === "pass").length;
  const rate = recent.length === 0 ? 0 : (passed / recent.length) * 100;

  return [
    `# Soak Run ${summary.id}`,
    "",
    `- Status: ${summary.status}`,
    `- Regime: ${summary.regime}`,
    `- Duration: ${summary.durationMs}ms`,
    `- Steps: ${summary.pass} passed, ${summary.fail} failed`,
    `- Recording: ${summary.recordVideo ? summary.recordTarget : "off"}`,
    `- Artifacts: ${summary.artifactDir}`,
    `- Recent pass rate: ${passed}/${recent.length} (${rate.toFixed(1)}%)`,
    "",
    "## Score Trend",
    "",
    "```text",
    renderScoreChart(history),
    "```",
    "",
    "## Recording Evidence",
    "",
    ...recordingLines(summary),
    "",
    "## Step Durations",
    "",
    "```text",
    renderStepDurations(summary.steps),
    "```",
    "",
    "## Execution Waterfall",
    "",
    "```text",
    renderExecutionWaterfall(summary.steps, summary.startedAt),
    "```",
    "",
    "## History",
    "",
    "```text",
    renderHistory(history),
    "```",
    "",
  ].join("\n");
}
