import { pkg as buildPkg } from "../apple/pkg.ts";

export async function pkg(args: string[] = []): Promise<void> {
  await buildPkg(args);
}
