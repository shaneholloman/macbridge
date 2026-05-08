import { sign } from "../apple/codesign.ts";
import { notarize } from "../apple/notary.ts";
import { runGhosttyPackaging } from "../ghostty/cli.ts";
import { dist } from "./dist.ts";
import { pkg } from "./pkg.ts";
import { verify } from "./verify.ts";

export async function release(args: string[] = []): Promise<void> {
  await dist(args);
  await sign(args);
  await notarize(args);
  await runGhosttyPackaging([...toShellArgs(args), "--skip-agent-rebuild"]);
  await pkg([...args, "--from-dist"]);
  await verify([...args, "--from-dist", "--require-signed"]);
}

function toShellArgs(args: string[]): string[] {
  const targetIndex = args.indexOf("--target");
  if (targetIndex === -1) return [];
  const target = args[targetIndex + 1];
  if (target == null || target.length === 0) return [];
  return [`--target=${target}`];
}
