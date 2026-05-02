import type { Json } from "../../src/native/macbridge.js";
import { readHistory, readRunSteps } from "./history.js";
import type { RunSummary, Step } from "./types.js";

export type Capability = {
  id: string;
  label: string;
  summaryFields: string[];
  stepNames: string[];
  stepPatterns?: RegExp[] | undefined;
  artifactKinds: string[];
  reportSurfaces: string[];
  extractor?: string | undefined;
};

export type ReportParityIssue = {
  kind: "registry" | "summary-field" | "step" | "artifact-kind";
  value: string;
  runId?: string | undefined;
  message: string;
};

const coreSummaryFields = [
  "artifactDir",
  "durationMs",
  "fail",
  "finishedAt",
  "id",
  "iterations",
  "liveHelium",
  "liveTextEdit",
  "pass",
  "regime",
  "runDir",
  "startedAt",
  "status",
  "steps",
];

export const capabilities = [
  {
    id: "soak.core",
    label: "Core soak execution",
    summaryFields: coreSummaryFields,
    stepNames: [
      "apps discovered",
      "capture active window",
      "capture desktop",
      "capture display main",
      "cursor display move",
      "cursor display start",
      "cursor display stop",
      "cursor stop",
      "display aliases agree",
      "foreground display screenshot",
      "main display resolved",
      "permissions required",
      "service ping",
      "service send displays list",
      "service start",
      "service status",
      "service stop",
      "windows listed",
    ],
    stepPatterns: [/^iteration \d+ begin$/],
    artifactKinds: [],
    reportSurfaces: [
      "soak run header",
      "soak aggregate by regime",
      "soak aggregate latest by regime",
      "soak aggregate slowest runs",
      "soak aggregate slowest steps",
      "soak aggregate step stats",
      "soak aggregate recent runs",
      "aggregate database runs",
      "aggregate database steps",
    ],
  },
  {
    id: "soak.textedit",
    label: "Live TextEdit workflow",
    summaryFields: [],
    stepNames: [
      "textedit ax type",
      "textedit ax verify",
      "textedit capture after",
      "textedit capture before",
      "textedit cleanup after",
      "textedit cleanup before",
      "textedit open fixture",
    ],
    artifactKinds: [],
    reportSurfaces: ["soak aggregate step stats", "aggregate database steps"],
  },
  {
    id: "soak.helium",
    label: "Live Helium browser workflow",
    summaryFields: [],
    stepNames: [
      "helium activate",
      "helium capture start",
      "helium cleanup after",
      "helium cleanup before",
      "helium click first result",
      "helium cold start",
      "helium google search",
      "helium maximize",
      "helium navigate google",
    ],
    artifactKinds: [],
    reportSurfaces: ["soak aggregate step stats", "aggregate database steps"],
  },
  {
    id: "helium.sessionVideo",
    label: "Helium session video evidence",
    summaryFields: ["recordTarget", "recordVideo"],
    stepNames: ["helium recording start", "helium recording stop"],
    artifactKinds: ["session-video"],
    reportSurfaces: [
      "soak run recording evidence",
      "soak aggregate recording evidence",
      "aggregate database recordings",
    ],
    extractor: "recordingEvidence",
  },
] satisfies Capability[];

function ownedSummaryFields(): Set<string> {
  return new Set(capabilities.flatMap((capability) => capability.summaryFields));
}

function ownedArtifactKinds(): Set<string> {
  return new Set(capabilities.flatMap((capability) => capability.artifactKinds));
}

function ownsStep(name: string): boolean {
  return capabilities.some(
    (capability) =>
      capability.stepNames.includes(name) ||
      capability.stepPatterns?.some((pattern) => pattern.test(name)) === true,
  );
}

function collectArtifactKinds(value: Json | undefined, kinds: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectArtifactKinds(item, kinds);
    return;
  }
  if (value == null || typeof value !== "object") return;
  if (typeof value.kind === "string") kinds.add(value.kind);
  for (const item of Object.values(value)) collectArtifactKinds(item, kinds);
}

export async function reportParityIssues(
  history: RunSummary[],
  options: { steps?: Map<string, Step[]> } = {},
): Promise<ReportParityIssue[]> {
  const issues: ReportParityIssue[] = [];

  for (const capability of capabilities) {
    if (capability.reportSurfaces.length === 0) {
      issues.push({
        kind: "registry",
        value: capability.id,
        message: `${capability.id} has no declared report surface`,
      });
    }
  }

  const fields = ownedSummaryFields();
  const artifactKinds = ownedArtifactKinds();

  for (const run of history) {
    for (const field of Object.keys(run)) {
      if (!fields.has(field)) {
        issues.push({
          kind: "summary-field",
          value: field,
          runId: run.id,
          message: `${run.id} has unreported summary field ${field}`,
        });
      }
    }

    const steps = options.steps?.get(run.id) ?? (await readRunSteps(run));
    for (const step of steps) {
      if (!ownsStep(step.name)) {
        issues.push({
          kind: "step",
          value: step.name,
          runId: run.id,
          message: `${run.id} has unreported step ${step.name}`,
        });
      }

      const kinds = new Set<string>();
      collectArtifactKinds(step.detail, kinds);
      for (const kind of kinds) {
        if (!artifactKinds.has(kind)) {
          issues.push({
            kind: "artifact-kind",
            value: kind,
            runId: run.id,
            message: `${run.id} has unreported artifact kind ${kind}`,
          });
        }
      }
    }
  }

  return issues;
}

export function formatReportParityIssues(issues: ReportParityIssue[]): string {
  return [
    "Report parity check failed.",
    "Every new soak field, step, or artifact kind must be registered in soak/src/capabilities.ts and mapped to a report surface.",
    "",
    ...issues.map((issue) =>
      [issue.kind, issue.runId, issue.value, issue.message].filter(Boolean).join(" | "),
    ),
  ].join("\n");
}

if (import.meta.main) {
  const history = await readHistory();
  const issues = await reportParityIssues(history);
  if (issues.length > 0) {
    process.stderr.write(`${formatReportParityIssues(issues)}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `Report parity check passed (${history.length} runs, ${capabilities.length} capabilities).\n`,
  );
}
