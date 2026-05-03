import { app } from "./commands/app.ts";
import { apple } from "./commands/apple.ts";
import { dist } from "./commands/dist.ts";
import { native } from "./commands/native.ts";
import { pack } from "./commands/pack.ts";
import { pkg } from "./commands/pkg.ts";
import { release } from "./commands/release.ts";
import { tccReset } from "./commands/tcc-reset.ts";
import { verify } from "./commands/verify.ts";
import { runGhosttyPackaging } from "./ghostty/cli.ts";

function usage(): string {
  return [
    "usage:",
    "  bun build/cli.ts app [--target darwin-arm64] [--from-dist]",
    "  bun build/cli.ts dist [--target darwin-arm64]",
    "  bun build/cli.ts native [--target darwin-arm64]",
    "  bun build/cli.ts pack [--target darwin-arm64] [--from-dist] [--require-signed]",
    "  bun build/cli.ts pkg [--target darwin-arm64] --from-dist",
    "  bun build/cli.ts verify [--target darwin-arm64] [--from-dist] [--require-signed]",
    "  bun build/cli.ts release [--target darwin-arm64]",
    "  bun build/cli.ts shell [--target=darwin-arm64] [--latest-ghostty] [--skip-build]",
    "  bun build/cli.ts tcc-reset [--dry-run] [--legacy-only] [--keep-installed-apps] [--tcc-only]",
    "  bun build/cli.ts apple sign|sign-app|notarize|notarize-app|verify [--target darwin-arm64]",
  ].join("\n");
}

const [command, ...args] = process.argv.slice(2);

try {
  if (command === "app") {
    await app(args);
  } else if (command === "dist") {
    await dist(args);
  } else if (command === "native") {
    await native(args);
  } else if (command === "pack") {
    await pack(args);
  } else if (command === "pkg") {
    await pkg(args);
  } else if (command === "verify") {
    await verify(args);
  } else if (command === "release") {
    await release(args);
  } else if (command === "shell") {
    await runGhosttyPackaging(args);
  } else if (command === "tcc-reset") {
    await tccReset(args);
  } else if (command === "apple") {
    await apple(args);
  } else {
    process.stderr.write(`${usage()}\n`);
    process.exit(1);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
