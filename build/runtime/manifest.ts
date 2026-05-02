import { join } from "node:path";
import { paths } from "./paths.ts";
import { fileSHA256 } from "./runner.ts";

export type BuildArtifact = {
  path: string;
  kind: string;
  target?: string;
  sha256: string;
  size: number;
};

export type NativeManifestEntry = {
  target: string;
  source: string;
  staged: string;
  signed: boolean;
  notarized: boolean;
};

export type BuildManifest = {
  id: string;
  command: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  artifacts: BuildArtifact[];
  native: NativeManifestEntry[];
  package?: {
    entrypoint: string;
    types: string;
  };
};

function stamp(): string {
  return new Date().toISOString().replaceAll(":", "").replaceAll(".", "");
}

export function createManifest(command: string): BuildManifest {
  return {
    id: `${command}-${stamp()}`,
    command,
    startedAt: new Date().toISOString(),
    artifacts: [],
    native: [],
  };
}

export function finishManifest(manifest: BuildManifest): void {
  const finished = new Date();
  manifest.finishedAt = finished.toISOString();
  manifest.durationMs = finished.getTime() - new Date(manifest.startedAt).getTime();
}

export async function writeManifest(manifest: BuildManifest): Promise<void> {
  const manifestPath = join(paths.dist.manifests, `${manifest.id}.json`);
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const latest = {
    ...manifest,
    manifestPath,
    manifestSHA256: await fileSHA256(manifestPath),
  };
  await Bun.write(paths.dist.latest, `${JSON.stringify(latest, null, 2)}\n`);
}
