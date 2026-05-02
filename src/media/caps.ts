import {
  ALL_FORMATS,
  type AudioCodec,
  canEncodeAudio,
  canEncodeVideo,
  FilePathSource,
  Input,
  type VideoCodec,
} from "mediabunny";
import type { Json } from "../native/macbridge.js";

export type MediaEncoder = "mediabunny-webcodecs" | "native-videotoolbox" | "ffmpeg" | "none";

export type MediaCodecSupport = {
  video: Partial<Record<VideoCodec, boolean>>;
  audio: Partial<Record<AudioCodec, boolean>>;
  encodeVideo: boolean;
  encodeAudio: boolean;
};

export type MediaCapabilities = {
  probe: {
    backend: "mediabunny";
    available: true;
  };
  webCodecs: {
    videoEncoder: boolean;
    videoDecoder: boolean;
    encodedVideoChunk: boolean;
    videoFrame: boolean;
    offscreenCanvas: boolean;
    createImageBitmap: boolean;
    encode: boolean;
  };
  ffmpeg: {
    available: boolean;
    path: string | null;
  };
  encoder: MediaEncoder;
};

export type MediaEncodingCapabilities = MediaCapabilities & {
  mediabunny: MediaCodecSupport;
};

export type MediaProbeTrack = {
  id: number;
  number: number;
  type: string;
  codec: string | null;
  codecParameters: string | null;
  duration: number | null;
  bitrate: number | null;
  averageBitrate: number | null;
  width?: number;
  height?: number;
  rotation?: number;
  sampleRate?: number;
  channels?: number;
};

export type MediaProbe = {
  path: string;
  backend: "mediabunny";
  format: string;
  mimeType: string;
  duration: number | null;
  metadataDuration: number | null;
  tracks: MediaProbeTrack[];
};

function globalType(name: string): string {
  return typeof (globalThis as Record<string, unknown>)[name];
}

function which(name: string): string | null {
  const child = Bun.spawnSync({
    cmd: ["which", name],
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (child.exitCode !== 0) return null;
  return child.stdout.toString().trim() || null;
}

function runnable(path: string): boolean {
  return (
    Bun.spawnSync({
      cmd: [path, "-version"],
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    }).exitCode === 0
  );
}

async function trackProbe(
  track: Awaited<ReturnType<Input["getTracks"]>>[number],
): Promise<MediaProbeTrack> {
  const base: MediaProbeTrack = {
    id: track.id,
    number: track.number,
    type: track.type,
    codec: await track.getCodec(),
    codecParameters: await track.getCodecParameterString(),
    duration: await track.getDurationFromMetadata({ skipLiveWait: true }),
    bitrate: await track.getBitrate(),
    averageBitrate: await track.getAverageBitrate(),
  };

  if (track.isVideoTrack()) {
    return {
      ...base,
      width: await track.getDisplayWidth(),
      height: await track.getDisplayHeight(),
      rotation: await track.getRotation(),
    };
  }

  if (track.isAudioTrack()) {
    return {
      ...base,
      sampleRate: await track.getSampleRate(),
      channels: await track.getNumberOfChannels(),
    };
  }

  return base;
}

export async function probeMedia(path: string): Promise<MediaProbe> {
  const input = new Input({
    source: new FilePathSource(path),
    formats: ALL_FORMATS,
  });

  try {
    const format = await input.getFormat();
    const tracks = await input.getTracks();
    const metadataDuration = await input.getDurationFromMetadata(tracks, { skipLiveWait: true });
    const duration =
      metadataDuration ?? (await input.computeDuration(tracks, { skipLiveWait: true }));
    return {
      path,
      backend: "mediabunny",
      format: format.name,
      mimeType: await input.getMimeType(),
      duration,
      metadataDuration,
      tracks: await Promise.all(tracks.map((track) => trackProbe(track))),
    };
  } finally {
    input.dispose();
  }
}

export function mediaProbeJSON(probe: MediaProbe): Json {
  return probe as unknown as Json;
}

export function mediaCapabilities(options: { ffmpeg?: string } = {}): MediaCapabilities {
  const webCodecs = {
    videoEncoder: globalType("VideoEncoder") === "function",
    videoDecoder: globalType("VideoDecoder") === "function",
    encodedVideoChunk: globalType("EncodedVideoChunk") === "function",
    videoFrame: globalType("VideoFrame") === "function",
    offscreenCanvas: globalType("OffscreenCanvas") === "function",
    createImageBitmap: globalType("createImageBitmap") === "function",
    encode: false,
  };
  webCodecs.encode = webCodecs.videoEncoder && webCodecs.encodedVideoChunk && webCodecs.videoFrame;

  const configured = options.ffmpeg ?? "ffmpeg";
  const ffmpegPath = configured.includes("/")
    ? runnable(configured)
      ? configured
      : null
    : which(configured);
  const encoder: MediaEncoder = webCodecs.encode
    ? "mediabunny-webcodecs"
    : ffmpegPath == null
      ? "none"
      : "ffmpeg";

  return {
    probe: { backend: "mediabunny", available: true },
    webCodecs,
    ffmpeg: {
      available: ffmpegPath != null,
      path: ffmpegPath,
    },
    encoder,
  };
}

export async function mediaEncodingCapabilities(
  options: { ffmpeg?: string; video?: VideoCodec[]; audio?: AudioCodec[] } = {},
): Promise<MediaEncodingCapabilities> {
  const caps = mediaCapabilities(options);
  const video = options.video ?? ["avc", "hevc", "vp9", "av1"];
  const audio = options.audio ?? ["aac", "opus", "mp3", "flac"];
  const videoEntries = await Promise.all(
    video.map(async (codec) => [codec, await canEncodeVideo(codec)] as const),
  );
  const audioEntries = await Promise.all(
    audio.map(async (codec) => [codec, await canEncodeAudio(codec)] as const),
  );
  const videoSupport = Object.fromEntries(videoEntries) as Partial<Record<VideoCodec, boolean>>;
  const audioSupport = Object.fromEntries(audioEntries) as Partial<Record<AudioCodec, boolean>>;

  return {
    ...caps,
    mediabunny: {
      video: videoSupport,
      audio: audioSupport,
      encodeVideo: Object.values(videoSupport).some(Boolean),
      encodeAudio: Object.values(audioSupport).some(Boolean),
    },
  };
}
