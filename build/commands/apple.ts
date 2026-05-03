import { sign, signApps } from "../apple/codesign.ts";
import { notarize, notarizeApps } from "../apple/notary.ts";
import { verifyApple } from "../apple/verify.ts";

function usage(): string {
  return [
    "usage:",
    "  bun build/cli.ts apple sign [--target darwin-arm64]",
    "  bun build/cli.ts apple sign-app [--target darwin-arm64]",
    "  bun build/cli.ts apple notarize [--target darwin-arm64]",
    "  bun build/cli.ts apple notarize-app [--target darwin-arm64]",
    "  bun build/cli.ts apple verify [--target darwin-arm64]",
  ].join("\n");
}

export async function apple(args: string[] = []): Promise<void> {
  const [command, ...rest] = args;
  if (command === "sign") {
    await sign(rest);
  } else if (command === "sign-app") {
    await signApps(rest);
  } else if (command === "notarize") {
    await notarize(rest);
  } else if (command === "notarize-app") {
    await notarizeApps(rest);
  } else if (command === "verify") {
    await verifyApple(rest);
  } else {
    throw new Error(usage());
  }
}
