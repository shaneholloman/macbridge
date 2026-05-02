import { stageApps } from "../apple/app.ts";
import { buildNative, parseTargets, stageNative } from "../native/swift.ts";
import { buildEntrypoint, writePackageManifest } from "../npm/package.ts";
import { writeWrapper } from "../npm/wrapper.ts";
import { createBuildLog } from "../runtime/log.ts";
import { createManifest, finishManifest, writeManifest } from "../runtime/manifest.ts";
import { paths } from "../runtime/paths.ts";
import { ensureDir, removePath } from "../runtime/runner.ts";

export async function dist(args: string[] = []): Promise<void> {
  const targets = parseTargets(args);
  const log = createBuildLog("dist");
  const manifest = createManifest("dist");

  await removePath(paths.dist.root);
  await ensureDir(paths.dist.bin);
  await ensureDir(paths.dist.build);
  await ensureDir(paths.dist.manifests);
  await ensureDir(paths.dist.logs);
  await ensureDir(paths.dist.timings);

  const entrypoint = await buildEntrypoint(log, manifest);
  manifest.artifacts.push(entrypoint);

  const wrapper = await writeWrapper(log);
  manifest.artifacts.push(wrapper);

  for (const target of targets) {
    const native = await buildNative(log, target);
    const staged = await stageNative(log, manifest, native);
    manifest.artifacts.push(staged);
  }

  manifest.artifacts.push(...(await stageApps(log, manifest, targets)));

  const packageManifest = await writePackageManifest(log, manifest);
  manifest.artifacts.push(packageManifest);

  finishManifest(manifest);
  await writeManifest(manifest);
}
