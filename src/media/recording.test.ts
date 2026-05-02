import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import type { Recording } from "../protocol/types.ts";
import { probeMedia } from "./caps.ts";
import { encodeRecording } from "./recording.ts";

function hasBinary(name: string): boolean {
  return (
    Bun.spawnSync({
      cmd: ["which", name],
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    }).exitCode === 0
  );
}

function writeFrame(path: string, color: string): void {
  const child = Bun.spawnSync({
    cmd: [
      "ffmpeg",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=32x32:d=0.1`,
      "-frames:v",
      "1",
      path,
    ],
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
}

describe("encodeRecording", () => {
  test.skipIf(!hasBinary("ffmpeg"))("encodes frame evidence and probes the output", async () => {
    const outDir = "tmp/recording-test";
    mkdirSync(outDir, { recursive: true });
    const frameA = `${outDir}/frame-0001.png`;
    const frameB = `${outDir}/frame-0002.png`;
    writeFrame(frameA, "red");
    writeFrame(frameB, "blue");

    const recording: Recording = {
      id: "rec",
      target: { kind: "desktop" },
      startedAt: "2026-05-02T00:00:00.000Z",
      finishedAt: "2026-05-02T00:00:01.000Z",
      fps: 2,
      frames: [
        {
          index: 1,
          capturedAt: "2026-05-02T00:00:00.000Z",
          artifact: { path: frameA, kind: "video-frame", bytes: 1 },
        },
        {
          index: 2,
          capturedAt: "2026-05-02T00:00:00.500Z",
          artifact: { path: frameB, kind: "video-frame", bytes: 1 },
        },
      ],
      artifacts: [],
    };

    const encoded = await encodeRecording(recording, { outPath: `${outDir}/session.mp4` });
    expect(encoded.video?.kind).toBe("session-video");
    expect(encoded.video?.bytes).toBeGreaterThan(0);
    expect(encoded.probe).toMatchObject({
      backend: "mediabunny",
      format: "MP4",
    });
    expect(await probeMedia(`${outDir}/session.mp4`)).toMatchObject({
      backend: "mediabunny",
      format: "MP4",
    });
  });

  test("rejects empty frame sequences", async () => {
    await expect(
      encodeRecording(
        {
          id: "empty",
          target: { kind: "desktop" },
          startedAt: "2026-05-02T00:00:00.000Z",
          finishedAt: "2026-05-02T00:00:00.000Z",
          fps: 2,
          frames: [],
          artifacts: [],
        },
        { outPath: "tmp/recording-test/empty.mp4" },
      ),
    ).rejects.toThrow("recording has no frames to encode");
  });
});
