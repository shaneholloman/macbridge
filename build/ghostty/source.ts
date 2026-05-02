import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { BuildLogger } from "../runtime/log.js";
import { runCommand } from "../runtime/runner.js";

const GHOSTTY_DIR = join(import.meta.dirname, "../../tmp/ghostty");
const GHOSTTY_REMOTE = "https://github.com/ghostty-org/ghostty.git";
const GHOSTTY_BRANCH = "main";

interface SourceOptions {
  dryRun?: boolean;
  env?: Record<string, string | undefined>;
}

function runOptions(log: BuildLogger, options: SourceOptions) {
  return {
    ...(options.dryRun == null ? {} : { dryRun: options.dryRun }),
    ...(options.env == null ? {} : { env: options.env }),
    logger: log,
  };
}

async function cloneGhostty(log: BuildLogger, options: SourceOptions): Promise<void> {
  await runCommand(
    ["git", "clone", "--depth", "1", "--branch", GHOSTTY_BRANCH, GHOSTTY_REMOTE, GHOSTTY_DIR],
    runOptions(log, options),
  );
}

async function cleanPinnedCheckout(log: BuildLogger, options: SourceOptions): Promise<void> {
  await runCommand(["git", "-C", GHOSTTY_DIR, "reset", "--hard", "HEAD"], runOptions(log, options));
  await runCommand(["git", "-C", GHOSTTY_DIR, "clean", "-xfd"], runOptions(log, options));
}

async function updateToLatest(log: BuildLogger, options: SourceOptions): Promise<void> {
  await runCommand(
    ["git", "-C", GHOSTTY_DIR, "fetch", "--depth", "1", "origin", GHOSTTY_BRANCH],
    runOptions(log, options),
  );
  await runCommand(
    ["git", "-C", GHOSTTY_DIR, "reset", "--hard", "FETCH_HEAD"],
    runOptions(log, options),
  );
  await runCommand(["git", "-C", GHOSTTY_DIR, "clean", "-xfd"], runOptions(log, options));
}

export async function prepareGhosttySource(
  log: BuildLogger,
  updateToLatestSource: boolean,
  options: SourceOptions = {},
): Promise<void> {
  if (!existsSync(GHOSTTY_DIR)) {
    const stage = log.start("Cloning Ghostty source");
    await cloneGhostty(log, options);
    stage.ok("Ghostty source cloned");
    return;
  }

  const hasGitCheckout = existsSync(join(GHOSTTY_DIR, ".git"));
  if (!hasGitCheckout) {
    if (updateToLatestSource) {
      log.step("Replacing non-git Ghostty source with latest upstream checkout");
      if (!options.dryRun) rmSync(GHOSTTY_DIR, { recursive: true, force: true });
      const stage = log.start("Cloning Ghostty source");
      await cloneGhostty(log, options);
      stage.ok("Ghostty source cloned");
    } else {
      log.info("Using existing non-git Ghostty source (pinned local copy)");
    }
    return;
  }

  if (updateToLatestSource) {
    const stage = log.start("Updating Ghostty source to latest upstream");
    await updateToLatest(log, options);
    stage.ok("Ghostty source updated to latest");
    return;
  }

  const stage = log.start("Using pinned Ghostty checkout (no upstream update)");
  await cleanPinnedCheckout(log, options);
  stage.ok("Pinned Ghostty source ready");
}

export async function updateGhosttySource(
  log: BuildLogger,
  dryRun = false,
  env?: Record<string, string | undefined>,
): Promise<void> {
  await prepareGhosttySource(log, true, {
    dryRun,
    ...(env == null ? {} : { env }),
  });
}

export function getGhosttySourcePath(): string {
  return GHOSTTY_DIR;
}
