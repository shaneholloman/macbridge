import { join, resolve } from "node:path";
import { assertPackageMetadata } from "../npm/contract.ts";
import { createBuildLog } from "../runtime/log.ts";
import { createManifest, finishManifest, writeManifest } from "../runtime/manifest.ts";
import { paths } from "../runtime/paths.ts";
import { ensureDir, fileSHA256, removePath, run } from "../runtime/runner.ts";
import { pack } from "./pack.ts";

export async function verify(args: string[] = []): Promise<void> {
  const requireSigned = args.includes("--require-signed");
  const { tarball, files } = await pack(args);
  const log = createBuildLog("verify");
  const manifest = createManifest("verify");
  const consumer = join(paths.tmp, "package-consumer");
  const packageJSON = JSON.parse(await Bun.file("package.json").text());
  assertPackageMetadata(packageJSON);

  await removePath(consumer);
  await ensureDir(consumer);
  await Bun.write(
    join(consumer, "package.json"),
    `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`,
  );

  await run(log, ["bun", "add", resolve(tarball)], { cwd: consumer });
  await Bun.write(
    join(consumer, "import.mjs"),
    [
      'import { defaultBin, packagedBin } from "macbridge";',
      'if (typeof defaultBin !== "string" || defaultBin.length === 0) {',
      '  throw new Error("defaultBin was not resolved");',
      "}",
      "if (packagedBin() == null) {",
      '  throw new Error("packaged native binary was not resolved");',
      "}",
      'process.stdout.write(defaultBin + "\\n");',
      "",
    ].join("\n"),
  );
  await Bun.write(
    join(consumer, "consumer.ts"),
    [
      'import { createControlPlane, defaultBin, formatModels, isTypeScriptCommand, packagedBin, parseActCommand, parseModelsArgs, parseObserveCommand, parseObserveInput, parseVerifyCommand, runActCommand, runCLI, runJSON, runObserveCommand, runVerifyCommand, type ControlPlane, type Json } from "macbridge";',
      'import { ensureExecutable } from "macbridge";',
      'import { verifyExpectation } from "macbridge";',
      'const value: Json = runJSON<Json>(["displays", "list"]);',
      "const controlFactory: () => ControlPlane = createControlPlane;",
      "const actCommand: typeof runActCommand = runActCommand;",
      "const observeCommand: typeof runObserveCommand = runObserveCommand;",
      "const verifyCommand: typeof runVerifyCommand = runVerifyCommand;",
      "const cli: typeof runCLI = runCLI;",
      'const observeInput = parseObserveInput({ target: { kind: "desktop" }, targetScreenshot: false });',
      'const parsedAct = parseActCommand(["action.json"]);',
      'const parsedModels = parseModelsArgs(["--type", "vision", "--json"]);',
      'const parsedObserve = parseObserveCommand(["desktop"]);',
      'const parsedVerify = parseVerifyCommand(["expectation.json"]);',
      "const modelText = formatModels(parsedModels, []);",
      'if (!isTypeScriptCommand("observe")) throw new Error("observe command not routed");',
      'if (!isTypeScriptCommand("permissions")) throw new Error("permissions should enter the TypeScript command router");',
      'const verification = verifyExpectation({ type: "artifact", path: "consumer.ts" });',
      'if (typeof defaultBin !== "string") throw new Error("defaultBin");',
      'if (packagedBin() == null) throw new Error("packagedBin");',
      'if (verification.status !== "pass") throw new Error("verification");',
      "ensureExecutable(defaultBin);",
      'try { ensureExecutable("/definitely/missing/macbridge"); throw new Error("missing binary accepted"); }',
      'catch (error) { if (!(error instanceof Error) || !error.message.includes("missing /definitely/missing/macbridge")) throw error; }',
      "void controlFactory;",
      "void actCommand;",
      "void observeCommand;",
      "void verifyCommand;",
      "void cli;",
      "void observeInput;",
      "void parsedAct;",
      "void parsedModels;",
      "void parsedObserve;",
      "void parsedVerify;",
      "void modelText;",
      "void value;",
      "",
    ].join("\n"),
  );

  await run(log, ["node", "import.mjs"], { cwd: consumer });
  await run(
    log,
    [
      "bun",
      "x",
      "tsc",
      "--noEmit",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--strict",
      "--skipLibCheck",
      "consumer.ts",
    ],
    { cwd: consumer },
  );
  await run(log, [join(consumer, "node_modules", ".bin", "macbridge"), "--help"]);
  await run(log, [join(consumer, "node_modules", ".bin", "macbridge"), "agent", "--help"]);
  await run(log, [join(consumer, "node_modules", ".bin", "macbridge"), "permissions", "check"]);
  await run(log, [join(consumer, "node_modules", ".bin", "macbridge"), "displays", "list"]);

  const capturePath = join(consumer, "capture-main.png");
  const capture = await run(
    log,
    [
      join(consumer, "node_modules", ".bin", "macbridge"),
      "capture",
      "display",
      "main",
      "--png",
      "-o",
      capturePath,
    ],
    { allowFailure: true },
  );
  const captureVerified = capture.status === 0 && Bun.file(capturePath).size > 0;
  if (!captureVerified && !isLikelyPermissionFailure(capture.stderr || capture.stdout)) {
    throw new Error(`packaged capture smoke failed: ${capture.stderr || capture.stdout}`);
  }

  const reportPath = join(paths.dist.build, "verification.json");
  const packageContentsPath = join(paths.dist.build, "package-contents.json");
  const report = {
    tarball,
    tarballSHA256: await fileSHA256(tarball),
    packageMetadataVerified: true,
    packageContentsVerified: true,
    signedArtifactsRequired: requireSigned,
    packageFileCount: files.length,
    nodeImportVerified: true,
    typescriptConsumerVerified: true,
    cliHelpVerified: true,
    permissionsCheckVerified: true,
    displaysListVerified: true,
    captureSmoke: captureVerified ? "passed" : "skipped-permissions",
  };
  await Bun.write(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  manifest.artifacts.push({
    path: tarball,
    kind: "npm-tarball",
    sha256: await fileSHA256(tarball),
    size: Bun.file(tarball).size,
  });
  manifest.artifacts.push({
    path: packageContentsPath,
    kind: "package-contents",
    sha256: await fileSHA256(packageContentsPath),
    size: Bun.file(packageContentsPath).size,
  });
  manifest.artifacts.push({
    path: reportPath,
    kind: "package-verification",
    sha256: await fileSHA256(reportPath),
    size: Bun.file(reportPath).size,
  });
  manifest.package = {
    entrypoint: join(paths.dist.root, "index.js"),
    types: join(paths.dist.root, "index.d.ts"),
  };
  finishManifest(manifest);
  await writeManifest(manifest);
}

function isLikelyPermissionFailure(output: string): boolean {
  return /permission|screen recording|not authorized|denied/i.test(output);
}
