import { createLogger } from "../../src/core/log.ts";
import {
  defaultBin,
  ensureExecutable,
  type Json,
  run,
  runJSON,
} from "../../src/native/macbridge.ts";
import { writeAggregateReports } from "./aggregate.ts";
import { appendLine, ensureDir, stamp, writeJSON } from "./fs.ts";
import { markdownReport } from "./report.ts";
import type { Regime, RunSummary, Status, Step } from "./types.ts";

type Options = {
  regime: Regime;
  liveTextEdit: boolean;
  liveHelium: boolean;
  recordVideo: boolean;
  recordTarget: "display" | "desktop" | "window";
  recordDisplay: string | number;
  recordFps: number;
  iterations: number;
};

export class Soak {
  readonly id: string;
  readonly runDir: string;
  readonly artifactDir: string;
  readonly eventPath: string;
  readonly logger = createLogger("soak");

  private readonly startedAt = new Date();
  private readonly steps: Step[] = [];
  private iteration = 0;
  private lockHeld = false;

  constructor(readonly options: Options) {
    this.id = `${stamp()}-${options.regime}`;
    this.runDir = `soak/runs/${this.id}`;
    this.artifactDir = `${this.runDir}/artifacts`;
    this.eventPath = `${this.runDir}/events.ndjson`;
  }

  async init(): Promise<void> {
    ensureExecutable(defaultBin);
    await this.acquireLock();
    await ensureDir(this.artifactDir);
  }

  path(name: string): string {
    if (this.options.iterations > 1 && this.iteration > 0) {
      return `${this.artifactDir}/i${String(this.iteration).padStart(2, "0")}-${name}`;
    }
    return `${this.artifactDir}/${name}`;
  }

  setIteration(iteration: number): void {
    this.iteration = iteration;
  }

  run(args: string[]) {
    this.logger.info({ args }, "macbridge");
    return run(args);
  }

  json<T extends Json>(args: string[]): T {
    this.logger.info({ args }, "macbridge json");
    return runJSON<T>(args);
  }

  system(cmd: string[]): void {
    this.logger.info({ cmd }, "system");
    const result = Bun.spawnSync({
      cmd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode !== 0) {
      throw new Error(`${cmd.join(" ")} failed: ${result.stderr.toString().trimEnd()}`);
    }
  }

  async step(name: string, fn: () => Promise<Json | undefined> | Json | undefined): Promise<void> {
    const started = new Date();
    const startedTime = performance.now();
    const step: Step = {
      id: `s${String(this.steps.length + 1).padStart(3, "0")}`,
      name,
      status: "pass",
      startedAt: started.toISOString(),
      finishedAt: started.toISOString(),
      durationMs: 0,
    };

    try {
      const detail = await fn();
      if (detail !== undefined) step.detail = detail;
    } catch (error) {
      step.status = "fail";
      step.error = error instanceof Error ? error.message : String(error);
    } finally {
      const finished = new Date();
      step.finishedAt = finished.toISOString();
      step.durationMs = Math.round(performance.now() - startedTime);
      this.steps.push(step);
      await appendLine(this.eventPath, JSON.stringify(step));
      this.logger[step.status === "pass" ? "info" : "error"](
        { durationMs: step.durationMs, detail: step.detail, error: step.error },
        step.name,
      );
    }

    if (step.status === "fail") {
      throw new Error(`${name} failed: ${step.error ?? "unknown error"}`);
    }
  }

  async finish(history: RunSummary[]): Promise<RunSummary> {
    const finishedAt = new Date();
    const fail = this.steps.filter((step) => step.status === "fail").length;
    const status: Status = fail === 0 ? "pass" : "fail";
    const summary: RunSummary = {
      id: this.id,
      regime: this.options.regime,
      status,
      startedAt: this.startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: Math.round(finishedAt.getTime() - this.startedAt.getTime()),
      pass: this.steps.length - fail,
      fail,
      runDir: this.runDir,
      artifactDir: this.artifactDir,
      liveTextEdit: this.options.liveTextEdit,
      liveHelium: this.options.liveHelium,
      recordVideo: this.options.recordVideo,
      recordTarget: this.options.recordTarget,
      iterations: this.options.iterations,
      steps: this.steps,
    };

    const nextHistory = [...history, summary];
    await writeJSON(`${this.runDir}/summary.json`, summary);
    await Bun.write(`${this.runDir}/report.md`, markdownReport(summary, nextHistory));
    await writeAggregateReports(nextHistory);
    this.releaseLock();
    return summary;
  }

  private async acquireLock(): Promise<void> {
    await ensureDir("soak/runs");
    const lockDir = "soak/runs/.lock";
    const lock = Bun.spawnSync({
      cmd: ["mkdir", lockDir],
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });

    if (lock.exitCode === 0) {
      this.lockHeld = true;
      await Bun.write(`${lockDir}/pid`, `${process.pid}\n`);
      await Bun.write(`${lockDir}/run`, `${this.id}\n`);
      return;
    }

    const pidFile = Bun.file(`${lockDir}/pid`);
    const pid = (await pidFile.exists()) ? Number((await pidFile.text()).trim()) : NaN;
    const active =
      Number.isInteger(pid) &&
      Bun.spawnSync({ cmd: ["kill", "-0", String(pid)], stdin: "ignore" }).exitCode === 0;

    if (active) {
      throw new Error(`another soak run is active in ${lockDir} with pid ${pid}`);
    }

    Bun.spawnSync({ cmd: ["rm", "-rf", lockDir], stdin: "ignore" });
    return this.acquireLock();
  }

  private releaseLock(): void {
    if (!this.lockHeld) return;
    Bun.spawnSync({ cmd: ["rm", "-rf", "soak/runs/.lock"], stdin: "ignore" });
    this.lockHeld = false;
  }
}
