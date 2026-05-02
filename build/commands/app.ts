import { stageApps } from "../apple/app.ts";
import { parseTargets } from "../native/swift.ts";
import { createBuildLog } from "../runtime/log.ts";
import { createManifest, finishManifest, writeManifest } from "../runtime/manifest.ts";
import { dist } from "./dist.ts";

export async function app(args: string[] = []): Promise<void> {
  const fromDist = args.includes("--from-dist");
  const buildArgs = args.filter((arg) => arg !== "--from-dist");
  const targets = parseTargets(buildArgs);

  if (!fromDist) {
    await dist(buildArgs);
    return;
  }

  const log = createBuildLog("app");
  const manifest = createManifest("app");
  manifest.artifacts.push(...(await stageApps(log, manifest, targets)));
  finishManifest(manifest);
  await writeManifest(manifest);
}
