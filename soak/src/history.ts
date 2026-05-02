import { soakRoot } from "./paths.js";
import type { RunSummary, Step } from "./types.js";

export async function readHistory(): Promise<RunSummary[]> {
  const runsDir = `${soakRoot()}/runs`;
  const proc = Bun.spawnSync({
    cmd: ["find", runsDir, "-mindepth", "2", "-maxdepth", "2", "-name", "summary.json"],
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) return [];

  const paths = proc.stdout
    .toString()
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const summaries: RunSummary[] = [];
  for (const path of paths) {
    try {
      summaries.push((await Bun.file(path).json()) as RunSummary);
    } catch {
      // Ignore partially written or hand-edited run summaries.
    }
  }

  return summaries.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export async function readRunSteps(run: RunSummary): Promise<Step[]> {
  const eventFile = Bun.file(`${run.runDir}/events.ndjson`);
  if (!(await eventFile.exists())) return run.steps;

  const steps: Step[] = [];
  for (const line of (await eventFile.text()).split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      steps.push(JSON.parse(trimmed) as Step);
    } catch {
      // Ignore malformed event lines; the summary remains the fallback.
    }
  }

  return steps.length === 0 ? run.steps : steps;
}
