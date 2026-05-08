import { describe, expect, test } from "bun:test";
import { mediaCapabilities, mediaEncodingCapabilities } from "../../src/media/caps.ts";

function hasGlobal(name: string): boolean {
  return typeof (globalThis as Record<string, unknown>)[name] === "function";
}

describe("mediaCapabilities", () => {
  test("reports media probe and encoder availability", () => {
    const caps = mediaCapabilities({ ffmpeg: "__missing_ffmpeg__" });

    expect(caps.probe).toEqual({ backend: "mediabunny", available: true });
    expect(caps.ffmpeg).toEqual({ available: false, path: null });
    expect(caps.webCodecs.videoEncoder).toBe(hasGlobal("VideoEncoder"));
    expect(caps.webCodecs.videoDecoder).toBe(hasGlobal("VideoDecoder"));
    expect(caps.webCodecs.encodedVideoChunk).toBe(hasGlobal("EncodedVideoChunk"));
    expect(caps.webCodecs.videoFrame).toBe(hasGlobal("VideoFrame"));
    expect(caps.webCodecs.offscreenCanvas).toBe(hasGlobal("OffscreenCanvas"));
    expect(caps.webCodecs.createImageBitmap).toBe(hasGlobal("createImageBitmap"));
    expect(caps.webCodecs.encode).toBe(
      caps.webCodecs.videoEncoder && caps.webCodecs.encodedVideoChunk && caps.webCodecs.videoFrame,
    );
    expect(caps.encoder).toBe(caps.webCodecs.encode ? "mediabunny-webcodecs" : "none");
  });

  test("reports Mediabunny codec encoding support", async () => {
    const caps = await mediaEncodingCapabilities({
      ffmpeg: "__missing_ffmpeg__",
      video: ["avc"],
      audio: ["aac"],
    });

    expect(caps.mediabunny.video).toEqual({ avc: caps.mediabunny.encodeVideo });
    expect(caps.mediabunny.audio).toEqual({ aac: caps.mediabunny.encodeAudio });
    expect(caps.encoder).toBe(caps.mediabunny.encodeVideo ? "mediabunny-webcodecs" : "none");
  });
});
