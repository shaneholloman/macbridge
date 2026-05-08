import { describe, expect, test } from "bun:test";
import { errorBrief, recordingEvidence } from "../../soak/src/evidence.ts";
import type { RunSummary } from "../../soak/src/types.ts";

function run(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: "run-1",
    regime: "stress",
    status: "pass",
    startedAt: "2026-05-02T00:00:00.000Z",
    finishedAt: "2026-05-02T00:00:01.000Z",
    durationMs: 1000,
    pass: 1,
    fail: 0,
    runDir: "soak/runs/run-1",
    artifactDir: "soak/runs/run-1/artifacts",
    liveTextEdit: false,
    liveHelium: true,
    recordVideo: true,
    recordTarget: "window",
    iterations: 1,
    steps: [],
    ...overrides,
  };
}

describe("recordingEvidence", () => {
  test("promotes encoded video details from the recording stop step", () => {
    const evidence = recordingEvidence(
      run({
        steps: [
          {
            id: "s001",
            name: "helium recording stop",
            status: "pass",
            startedAt: "2026-05-02T00:00:00.000Z",
            finishedAt: "2026-05-02T00:00:00.200Z",
            durationMs: 200,
            detail: {
              frames: 8,
              video: { path: "artifacts/helium-session.mp4", kind: "session-video", bytes: 104483 },
              probe: {
                backend: "mediabunny",
                format: "MP4",
                duration: 4.04,
                tracks: [{ type: "video", width: 1920, height: 996 }],
              },
              manifest: "artifacts/helium-recording.json",
            },
          },
        ],
      }),
    );

    expect(evidence).toMatchObject({
      status: "pass",
      target: "window",
      frames: 8,
      path: "artifacts/helium-session.mp4",
      bytes: 104483,
      backend: "mediabunny",
      format: "MP4",
      duration: 4.04,
      width: 1920,
      height: 996,
      manifest: "artifacts/helium-recording.json",
    });
  });

  test("keeps encoder failures concise", () => {
    expect(
      errorBrief(
        [
          "ffmpeg version 8.1 Copyright",
          "[libx264 @ 0x72304d180] height not divisible by 2 (1920x995)",
          "Conversion failed!",
        ].join("\n"),
      ),
    ).toBe("[libx264 @ 0x72304d180] height not divisible by 2 (1920x995)");
  });
});
