import { buildNative, parseTargets, stageNative } from "../native/swift.ts";
import { createBuildLog } from "../runtime/log.ts";
import { createManifest, finishManifest, writeManifest } from "../runtime/manifest.ts";
import { paths } from "../runtime/paths.ts";
import { ensureDir } from "../runtime/runner.ts";

export async function native(args: string[] = []): Promise<void> {
  const targets = parseTargets(args);
  const log = createBuildLog("native");
  const manifest = createManifest("native");

  await ensureDir(paths.dist.bin);
  await ensureDir(paths.dist.build);
  await ensureDir(paths.dist.manifests);
  await ensureDir(paths.dist.logs);
  await ensureDir(paths.dist.timings);

  for (const target of targets) {
    const built = await buildNative(log, target);
    const staged = await stageNative(log, manifest, built);
    manifest.artifacts.push(staged);
  }

  finishManifest(manifest);
  await writeManifest(manifest);
}
