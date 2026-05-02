import { mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ControlPlane } from "../core/control.js";
import type { Artifact, Recording, RecordingFrame, Target } from "../protocol/types.js";
import { mediaProbeJSON, probeMedia } from "./caps.js";

export type RecordingControl = Pick<ControlPlane, "capture">;

export type Recorder = {
  start(): Promise<void> | void;
  frame(label?: string): Promise<RecordingFrame>;
  stop(): Promise<Recording> | Recording;
};

export type FrameRecorderOptions = {
  control: RecordingControl;
  target: Target;
  outDir: string;
  fps?: number;
  id?: string;
  videoPath?: string;
  ffmpeg?: string;
};

export type EncodeOptions = {
  outPath: string;
  ffmpeg?: string;
};

function stamp(): string {
  return new Date().toISOString().replaceAll(/[-:.]/g, "");
}

function artifact(path: string, kind: Artifact["kind"]): Artifact {
  try {
    return { path, kind, bytes: statSync(path).size };
  } catch {
    return { path, kind };
  }
}

function framePath(outDir: string, index: number, label?: string): string {
  const suffix = label == null ? "" : `-${label.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;
  return join(outDir, `frame-${String(index).padStart(4, "0")}${suffix}.png`);
}

function quoteConcatPath(path: string): string {
  return `'${resolve(path).replaceAll("'", "'\\''")}'`;
}

function run(cmd: string[]): string {
  const child = Bun.spawnSync({
    cmd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = child.stdout.toString().trim();
  const stderr = child.stderr.toString().trim();
  if (child.exitCode !== 0) throw new Error(stderr || stdout || `${cmd.join(" ")} failed`);
  return stdout;
}

export async function encodeRecording(
  recording: Recording,
  options: EncodeOptions,
): Promise<Recording> {
  if (recording.frames.length === 0) throw new Error("recording has no frames to encode");

  mkdirSync(dirname(options.outPath), { recursive: true });
  const listPath = join(dirname(options.outPath), "frames.ffconcat");
  const duration = 1 / recording.fps;
  const lines = ["ffconcat version 1.0"];
  for (const frame of recording.frames) {
    lines.push(`file ${quoteConcatPath(frame.artifact.path)}`);
    lines.push(`duration ${duration}`);
  }
  const last = recording.frames.at(-1);
  if (last != null) lines.push(`file ${quoteConcatPath(last.artifact.path)}`);
  await Bun.write(listPath, `${lines.join("\n")}\n`);

  run([
    options.ffmpeg ?? "ffmpeg",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-vf",
    "pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p",
    "-movflags",
    "+faststart",
    options.outPath,
  ]);

  const video = artifact(options.outPath, "session-video");
  const probe = mediaProbeJSON(await probeMedia(options.outPath));
  return {
    ...recording,
    video,
    probe,
    artifacts: [...recording.artifacts, video, artifact(listPath, "log")],
  };
}

export class FrameRecorder implements Recorder {
  readonly id: string;
  readonly target: Target;
  readonly outDir: string;
  readonly fps: number;
  private readonly control: RecordingControl;
  private readonly videoPath: string | undefined;
  private readonly ffmpeg: string | undefined;
  private readonly frames: RecordingFrame[] = [];
  private startedAt = new Date().toISOString();

  constructor(options: FrameRecorderOptions) {
    this.id = options.id ?? `${stamp()}-frames`;
    this.target = options.target;
    this.outDir = options.outDir;
    this.fps = options.fps ?? 2;
    this.control = options.control;
    this.videoPath = options.videoPath;
    this.ffmpeg = options.ffmpeg;
  }

  start(): void {
    mkdirSync(this.outDir, { recursive: true });
    this.startedAt = new Date().toISOString();
  }

  async frame(label?: string): Promise<RecordingFrame> {
    const index = this.frames.length + 1;
    const path = framePath(this.outDir, index, label);
    const captured = this.control.capture(this.target, path);
    const frame: RecordingFrame = {
      index,
      capturedAt: new Date().toISOString(),
      artifact: { ...captured, kind: "video-frame" },
    };
    this.frames.push(frame);
    return frame;
  }

  async stop(): Promise<Recording> {
    const manifestPath = join(this.outDir, "recording.json");
    const manifest: Recording = {
      id: this.id,
      target: this.target,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      fps: this.fps,
      frames: this.frames,
      artifacts: [
        ...this.frames.map((frame) => frame.artifact),
        artifact(manifestPath, "session-frames"),
      ],
    };
    await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    manifest.artifacts = [
      ...this.frames.map((frame) => frame.artifact),
      artifact(manifestPath, "session-frames"),
    ];
    if (this.videoPath == null) return manifest;
    const encoded = await encodeRecording(manifest, {
      outPath: this.videoPath,
      ...(this.ffmpeg == null ? {} : { ffmpeg: this.ffmpeg }),
    });
    await Bun.write(manifestPath, `${JSON.stringify(encoded, null, 2)}\n`);
    return encoded;
  }
}
