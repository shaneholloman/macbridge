import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join } from "node:path";
import type { BuildLogger } from "../runtime/log.js";

export interface BrandingConfig {
  appName: string;
  bundleId: string;
  lowerName: string;
}

const PATCHABLE_EXTS = new Set([
  ".swift",
  ".xib",
  ".zig",
  ".nix",
  ".plist",
  ".pbxproj",
  ".strings",
  ".md",
  ".txt",
  ".json",
  ".xml",
  ".yml",
  ".yaml",
  ".toml",
  ".cfg",
  ".conf",
  ".sh",
  ".zsh",
  ".bash",
  ".modulemap",
  ".h",
  ".c",
  ".m",
  ".cpp",
  ".hpp",
]);

const SKIP_DIRS = new Set([".git", "zig-cache", "zig-out", "node_modules"]);

function collectPatchableFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      results.push(...collectPatchableFiles(full));
    } else if (PATCHABLE_EXTS.has(extname(entry.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

function collectAllEntriesDepthFirst(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (SKIP_DIRS.has(entry.name)) continue;
    if (entry.isDirectory()) {
      results.push(...collectAllEntriesDepthFirst(full));
    }
    results.push(full);
  }
  return results;
}

export async function applyBranding(
  log: BuildLogger,
  ghosttyDir: string,
  config: BrandingConfig,
): Promise<void> {
  const stage = log.start("Applying MacBridge branding");

  const files = collectPatchableFiles(ghosttyDir);
  let patchedCount = 0;
  for (const fullPath of files) {
    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }
    const original = content;

    content = content.replace(/com\.mitchellh\.ghostty/g, config.bundleId);
    content = content.replace(/com\/mitchellh\/ghostty/g, config.bundleId.replace(/\./g, "/"));
    content = content.replace(/\u{1F47B}/gu, "");
    content = content.replace(/GHOSTTY/g, config.appName.toUpperCase());
    content = content.replace(/Ghostty/g, config.appName);
    content = content.replace(/ghostty/g, config.lowerName);

    if (content !== original) {
      writeFileSync(fullPath, content);
      patchedCount++;
    }
  }

  log.info(`Content: scanned ${files.length} files, patched ${patchedCount}`);

  const entries = collectAllEntriesDepthFirst(ghosttyDir);
  let renamedCount = 0;
  for (const fullPath of entries) {
    const parent = dirname(fullPath);
    const name = fullPath.slice(parent.length + 1);
    if (!name.includes("GHOSTTY") && !name.includes("Ghostty") && !name.includes("ghostty"))
      continue;

    const newName = name
      .replace(/GHOSTTY/g, config.appName.toUpperCase())
      .replace(/Ghostty/g, config.appName)
      .replace(/ghostty/g, config.lowerName);
    const newPath = join(parent, newName);

    if (existsSync(fullPath) && fullPath !== newPath) {
      try {
        renameSync(fullPath, newPath);
        renamedCount++;
      } catch {
        log.warn(`Failed to rename: ${name}`);
      }
    }
  }

  log.info(`Renamed ${renamedCount} files/directories`);
  stage.ok("Branding complete");
}

export function rewriteDocsUrl(log: BuildLogger, ghosttyDir: string, docsUrl: string): void {
  const stage = log.start("Rewriting docs URL");

  const files = collectPatchableFiles(ghosttyDir);
  let patchedCount = 0;
  let replacementCount = 0;
  const patterns: RegExp[] = [
    /\bhttps?:\/\/(?:www\.)?macbridge\.org\/docs\b/g,
    /\bmacbridge\.org\/docs\b/g,
    /\bhttps?:\/\/(?:www\.)?macbridgeshell\.org\/docs\b/g,
    /\bmacbridgeshell\.org\/docs\b/g,
    /\bhttps?:\/\/(?:www\.)?aria\.org\/docs\b/g,
    /\baria\.org\/docs\b/g,
  ];

  for (const fullPath of files) {
    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }
    const original = content;

    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        replacementCount += matches.length;
        content = content.replace(pattern, docsUrl);
      }
    }

    if (content !== original) {
      writeFileSync(fullPath, content);
      patchedCount++;
    }
  }

  log.info(`Docs URL rewrite: patched ${patchedCount} files, ${replacementCount} replacements`);
  stage.ok("Docs URL rewritten");
}

export function stampVersion(log: BuildLogger, ghosttyDir: string, version: string): void {
  const stage = log.start(`Stamping version ${version}`);
  const buildNumber = bundleBuildNumber(version);

  const zonPath = join(ghosttyDir, "build.zig.zon");
  if (existsSync(zonPath)) {
    const content = readFileSync(zonPath, "utf-8");
    const patched = content.replace(/\.version = "[^"]+"/, `.version = "${version}"`);
    if (patched !== content) {
      writeFileSync(zonPath, patched);
      log.info(`build.zig.zon: .version = "${version}"`);
    } else {
      log.warn("build.zig.zon: .version pattern not found");
    }
  } else {
    log.warn("build.zig.zon not found");
  }

  const pbxPath = join(
    ghosttyDir,
    `macos/${configNameFromGhostty(ghosttyDir)}.xcodeproj/project.pbxproj`,
  );
  if (existsSync(pbxPath)) {
    let content = readFileSync(pbxPath, "utf-8");
    const original = content;
    content = content.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
    content = content.replace(
      /CURRENT_PROJECT_VERSION = [^;]+;/g,
      `CURRENT_PROJECT_VERSION = ${buildNumber};`,
    );
    if (content !== original) {
      writeFileSync(pbxPath, content);
      log.info(
        `project.pbxproj: MARKETING_VERSION=${version}, CURRENT_PROJECT_VERSION=${buildNumber}`,
      );
    } else {
      log.warn("project.pbxproj: version patterns not found");
    }
  } else {
    log.warn("project.pbxproj not found at expected path after branding");
  }

  stage.ok("Version stamped");
}

export async function replaceIcons(log: BuildLogger, ghosttyDir: string): Promise<void> {
  const stage = log.start("Replacing icons");

  const iconPng = join("dist/app/icons/MacBridgeMark.png");
  if (!existsSync(iconPng)) {
    log.warn(
      "dist/app/icons/MacBridgeMark.png not found; run app staging before shell icon replacement",
    );
    stage.ok("Icon replacement skipped");
    return;
  }

  const xcassetsDir = join(ghosttyDir, "macos/Assets.xcassets");
  if (!existsSync(xcassetsDir)) {
    log.warn("Assets.xcassets not found");
    stage.ok("Icon replacement skipped");
    return;
  }

  let count = 0;
  function replacePngsRecursive(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        replacePngsRecursive(full);
      } else if (entry.name.endsWith(".png")) {
        copyFileSync(iconPng, full);
        count++;
      }
    }
  }

  replacePngsRecursive(xcassetsDir);
  stage.ok(`Replaced ${count} icon PNGs`);
}

function bundleBuildNumber(version: string): string {
  const explicit = process.env.MACBRIDGE_BUILD_NUMBER;
  if (explicit != null && /^[1-9][0-9]*$/.test(explicit)) {
    return explicit;
  }

  const [major = 0, minor = 0, patch = 0] = version
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));

  return String(Math.max(1, major * 1_000_000 + minor * 1_000 + patch));
}

function configNameFromGhostty(ghosttyDir: string): string {
  void ghosttyDir;
  return "MacBridge";
}
