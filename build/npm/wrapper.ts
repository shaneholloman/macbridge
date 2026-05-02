import { join } from "node:path";
import type { Logger } from "pino";
import { paths } from "../runtime/paths.ts";
import { fileSHA256, run } from "../runtime/runner.ts";

export async function writeWrapper(log: Logger) {
  const path = join(paths.dist.bin, "macbridge");
  await Bun.write(
    path,
    [
      "#!/usr/bin/env node",
      'import { spawnSync } from "node:child_process";',
      'import { dirname, join } from "node:path";',
      'import { fileURLToPath } from "node:url";',
      "",
      "const targets = {",
      '  "darwin-arm64": { app: "../darwin-arm64/MacBridge.app/Contents/MacOS/macbridge-runtime", bin: "macbridge-darwin-arm64" },',
      '  "darwin-x64": { app: "../darwin-x64/MacBridge.app/Contents/MacOS/macbridge-runtime", bin: "macbridge-darwin-x64" },',
      "};",
      "",
      'const key = process.platform + "-" + process.arch;',
      "const target = targets[key];",
      "if (target == null) {",
      '  process.stderr.write("macbridge does not support " + key + "\\n");',
      "  process.exit(1);",
      "}",
      "",
      "const args = process.argv.slice(2);",
      "const dir = dirname(fileURLToPath(import.meta.url));",
      "const appBinary = join(dir, target.app);",
      "const standaloneBinary = join(dir, target.bin);",
      "process.env.BIN ??= appBinary;",
      "if (process.versions.bun != null) {",
      '  const { runCLI } = await import("../index.js");',
      "  process.exit(await runCLI(args));",
      "}",
      "const self = fileURLToPath(import.meta.url);",
      'const routed = spawnSync("bun", [self, ...args], { stdio: "inherit", env: { ...process.env, BIN: process.env.BIN ?? appBinary } });',
      "if (routed.error == null) process.exit(routed.status ?? 1);",
      'if (routed.error.code !== "ENOENT") throw routed.error;',
      'const result = spawnSync(appBinary, args, { stdio: "inherit" });',
      "if (result.error != null) {",
      '  if (result.error.code !== "ENOENT") throw result.error;',
      '  const fallback = spawnSync(standaloneBinary, args, { stdio: "inherit" });',
      "  if (fallback.error != null) throw fallback.error;",
      "  process.exit(fallback.status ?? 1);",
      "}",
      "process.exit(result.status ?? 1);",
      "",
    ].join("\n"),
  );
  await run(log, ["chmod", "755", path]);
  return {
    path,
    kind: "npm-bin-wrapper",
    sha256: await fileSHA256(path),
    size: Bun.file(path).size,
  };
}
