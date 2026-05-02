import type { Json } from "../../src/native/macbridge.ts";
import type { RunSummary, Status } from "./types.ts";

export type RecordingStatus = Status | "missing" | "off";

export type RecordingEvidence = {
  runId: string;
  target: RunSummary["recordTarget"];
  status: RecordingStatus;
  frames?: number | undefined;
  path?: string | undefined;
  bytes?: number | undefined;
  backend?: string | undefined;
  format?: string | undefined;
  duration?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
  manifest?: string | undefined;
  error?: string | undefined;
};

function object(value: Json | undefined): Record<string, Json> | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function array(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

function number(value: Json | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function string(value: Json | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function errorBrief(error: string | undefined): string | undefined {
  if (error == null) return undefined;
  const lines = error
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const brief =
    lines.find((line) => /not divisible|nothing was written|conversion failed|error/i.test(line)) ??
    lines.at(-1);
  return brief?.match(/failed:\s*(.+)$/)?.[1] ?? brief;
}

export function recordingEvidence(run: RunSummary, steps = run.steps): RecordingEvidence {
  const target = run.recordTarget ?? "display";
  if (!run.recordVideo) {
    return { runId: run.id, target, status: "off" };
  }

  const step = steps.find((item) => item.name === "helium recording stop");
  if (step == null) {
    return { runId: run.id, target, status: "missing" };
  }

  const detail = object(step.detail);
  const video = object(detail?.video);
  const probe = object(detail?.probe);
  const track = array(probe?.tracks)
    .map(object)
    .find((item) => item?.type === "video");

  return {
    runId: run.id,
    target,
    status: step.status,
    frames: number(detail?.frames),
    path: string(video?.path),
    bytes: number(video?.bytes),
    backend: string(probe?.backend),
    format: string(probe?.format),
    duration: number(probe?.duration),
    width: number(track?.width),
    height: number(track?.height),
    manifest: string(detail?.manifest),
    error: errorBrief(step.error),
  };
}
