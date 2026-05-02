import { sign, signApps } from "../apple/codesign.ts";
import { notarize, notarizeApps } from "../apple/notary.ts";
import { verifyApple } from "../apple/verify.ts";
import { app } from "./app.ts";
import { dist } from "./dist.ts";
import { pkg } from "./pkg.ts";
import { verify } from "./verify.ts";

export async function release(args: string[] = []): Promise<void> {
  await dist(args);
  await sign(args);
  await app([...args, "--from-dist"]);
  await signApps(args);
  await notarize(args);
  await notarizeApps(args);
  await verifyApple(args);
  await pkg([...args, "--from-dist"]);
  await verify([...args, "--from-dist", "--require-signed"]);
}
