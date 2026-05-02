import type { Json } from "../../src/native/macbridge.ts";

export type Regime = "smoke" | "stress" | "burn";

export type Status = "pass" | "fail";

export type Step = {
  id: string;
  name: string;
  status: Status;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  detail?: Json | undefined;
  error?: string | undefined;
};

export type RunSummary = {
  id: string;
  regime: Regime;
  status: Status;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  pass: number;
  fail: number;
  runDir: string;
  artifactDir: string;
  liveTextEdit: boolean;
  liveHelium: boolean;
  recordVideo: boolean;
  recordTarget: "display" | "desktop" | "window";
  iterations: number;
  steps: Step[];
};
