---
id: RFC-0010
name: Multimodal Evidence and Session Video
status: In Progress
owners:
    - MacBridge maintainers
created: 2026-05-02
updated: 2026-05-02
supersedes: []
superseded_by: null
---

# Multimodal Evidence and Session Video

## Summary

MacBridge should treat screenshots, frame sequences, and session movies as
first-class evidence for agent runs. The same observe-plan-act record should be
usable by screenshot-oriented models, video-capable models, deterministic soak
checks, and human debugging.

## Context

Screenshots are excellent point-in-time evidence, but they miss timing,
transitions, retries, focus changes, hover effects, and cursor/context movement.
Video-capable models such as Gemini can ingest richer temporal context and may
be better at explaining why an interaction succeeded or failed.

MacBridge already records screenshots and JSON state. The next layer should add
durable multimodal evidence without breaking the control-plane boundary:
MacBridge records evidence, planners consume it, and the shared control plane
executes validated actions.

## Goals

- Make session recordings part of `RunRecord` evidence.
- Support frame-sequence recording before native encoded video lands.
- Preserve clear artifact kinds for screenshots, frames, frame manifests, and
  eventual `.mov` or `.mp4` session videos.
- Keep recording optional and local by default.
- Keep model-specific video ingestion outside the native control plane.
- Make future Gemini, AI Gateway, local model, and `ai-cli` adapters consume the
  same evidence contract.

## Non-Goals

- Shipping native ScreenCaptureKit video encoding in the first slice.
- Uploading recordings to a hosted model automatically.
- Recording without explicit caller opt-in.
- Bypassing Screen Recording or Accessibility permissions.

## Proposal

Add a small TypeScript recording contract:

- `Recorder`
- `FrameRecorder`
- `Recording`
- `RecordingFrame`
- recording artifacts on `RunRecord`

The first implementation records deterministic frame sequences around a session
action and can encode those frames with local `ffmpeg`. Mediabunny is the
preferred TypeScript media probe backend and records container, track, duration,
codec, and display metadata back into the recording manifest.

FFmpeg is a tactical encoder backend, not the desired product boundary.
Mediabunny can encode when a WebCodecs-capable runtime provides primitives such
as `VideoEncoder`, `EncodedVideoChunk`, and `VideoFrame`. Bun and Node are both
server-side JavaScript runtimes and should not be assumed to provide those
browser media globals. MacBridge should expose media capabilities explicitly and
choose an encoding backend from:

- `mediabunny-webcodecs`: Mediabunny encoding in a WebCodecs-capable runtime
- `native-videotoolbox`: future macOS AVFoundation/VideoToolbox recording
- `ffmpeg`: local fallback while native encoding is not implemented
- `none`: frame evidence only

The Mediabunny donor examples should be treated as reference pipelines:

- `examples/metadata-extraction`: maps directly to MacBridge's `probeMedia`
  metadata contract.
- `examples/live-recording`: proves a browser/WebCodecs recording path using
  `CanvasSource`, `StreamTarget`, and fragmented MP4 chunks.
- `examples/file-compression`: proves the `Conversion` API for post-run
  compression when the runtime can decode and encode the requested codecs.
- `examples/hls-transcoding`: proves multi-rendition HLS output for future
  long-session review or streaming, but should stay out of the first recorder
  slice.

Recording artifacts should distinguish:

- `video-frame`: one sampled PNG frame
- `session-frames`: a manifest describing frame evidence
- `session-video`: an encoded `.mov` or `.mp4`

Recording target semantics must stay explicit:

- `display`: full monitor evidence; best for proving visibility, overlap, and
  desktop noise.
- `desktop`: foreground desktop surface evidence; useful when the exact window
  is not known or a command action has no app target.
- `window`: cropped app-window evidence; cleaner for model review but cannot
  prove what else was visible around the app.

Model adapters can then choose the best available evidence. Screenshot-only
models can inspect target/display screenshots. Video-capable models can ingest
`session-video` or a bounded frame sequence.

## Alternatives Considered

- Only keep screenshots.
  This keeps the system simple but loses temporal context.

- Add video as a separate CLI-only command.
  This would make video useful for humans but less useful to the agent loop.

- Start with native movie encoding immediately.
  This is the desired end state, but the public evidence contract should land
  first so CLI/API/planner semantics do not drift.

## Security Impact

Session video can contain substantially more private information than a single
screenshot. Recording must be opt-in, stored locally by default, ignored by git,
and treated as sensitive evidence. Future model upload paths must be explicit.

## Reliability Impact

Frame sequences give deterministic, inspectable evidence before native video is
available. Native video encoding will add timing, codec, disk, and permission
failure modes that should be isolated behind the recorder interface.

## Compatibility Impact

This is additive TypeScript API surface. Existing screenshots and observations
remain unchanged.

## Testing and Quality Gates

- `bun run check`
- `bun run check:pack`
- Unit tests for recording artifacts on `RunRecord`
- Helium stress soak after native video recording is wired into live workflows

## Rollout Plan

1. Add recording artifact types and frame-sequence recorder. Done.
2. Attach optional recording evidence to `Session.runOnce`. Done.
3. Add FFmpeg encoding for frame recordings. Done.
4. Add Mediabunny metadata probing for encoded session video. Done.
5. Add media capability reporting for probe and encoder backends. Done.
6. Add CLI flags for recording frame sequences and encoded video. Done.
7. Add native ScreenCaptureKit/AVFoundation session movie recorder if FFmpeg
   proves insufficient for long-running sessions.
8. Add Mediabunny/WebCodecs encoding when the active runtime supports it.
9. Add model adapter support for choosing screenshot, frames, or video.
10. Add optional Helium recording soak.

## Open Questions

- Should native videos be `.mov` first, then optionally transcode to `.mp4`?
- Should the default recorder capture target window, display, or both?
- What frame-rate and max-duration caps are safe for default agent runs?
- Should cursor overlay be burned into recordings by default?
- Should the first non-FFmpeg backend be direct native movie recording or a
  Mediabunny custom encoder backed by native VideoToolbox packets?
