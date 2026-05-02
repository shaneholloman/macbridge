#!/usr/bin/env bun

/**
 * Ghostty Rebranding Script
 *
 * Transforms a clean Ghostty source tree into MacBridge branding.
 * Run this on a fresh clone, inspect the results, iterate.
 *
 * Usage:
 *   bun build/scripts/rebrand-ghostty.ts                    # Rebrand in place
 *   bun build/scripts/rebrand-ghostty.ts --dry-run          # Show what would change
 *   bun build/scripts/rebrand-ghostty.ts --verify           # Check for remaining Ghostty references
 *
 * The script does two passes:
 *   1. Content replacement in text files (Ghostty -> MacBridge variants)
 *   2. File and directory renaming (Ghostty -> MacBridge variants)
 *
 * Edge cases are handled via an exclusion list -- patterns that should NOT
 * be replaced (e.g. terminfo entries that must stay lowercase "ghostty").
 */

import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { MACBRIDGE_BUNDLE_ID } from "../apple/identity.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const GHOSTTY_DIR = join(ROOT, "tmp/ghostty");

const BRAND = {
  from: "Ghostty",
  fromLower: "ghostty",
  product: "MacBridge",
  display: "MacBridge",
  shell: "MacBridge",
  lower: "macbridge",
  envPrefix: "MACBRIDGE",
  bundleIdFrom: "com.mitchellh.ghostty",
  bundleIdTo: MACBRIDGE_BUNDLE_ID,
} as const;

// -- File extensions to patch content in --
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
  ".css",
  ".html",
  ".js",
  ".ts",
]);

// -- Directories to skip --
const SKIP_DIRS = new Set([".git", "zig-cache", "zig-out", ".zig-cache", "node_modules", ".build"]);

// -- Content patterns to EXCLUDE from replacement --
// These are internal identifiers that must stay as-is for the build to work.
// Add new exclusions here as edge cases are discovered.
const _CONTENT_EXCLUSIONS: Array<{ pattern: RegExp; reason: string }> = [
  // Terminfo: terminal type names must stay "ghostty" for compatibility
  // (other programs query TERM=ghostty or xterm-ghostty)
  // -- currently none needed since terminfo names are lowercase "ghostty"
  //    and we only replace in contexts where it makes sense
];

// -- File/directory names to EXCLUDE from renaming --
// These paths (relative to GHOSTTY_DIR) should keep their original names.
const RENAME_EXCLUSIONS = new Set<string>([
  // None yet -- add paths here if renaming breaks things
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectTextFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      results.push(...collectTextFiles(full));
    } else if (PATCHABLE_EXTS.has(extname(entry.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Collect all entries depth-first (children before parents) for safe renaming.
 */
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

function relativeTo(base: string, full: string): string {
  return full.slice(base.length + 1);
}

// ---------------------------------------------------------------------------
// Pass 1: Content replacement
// ---------------------------------------------------------------------------

interface ContentResult {
  file: string;
  replacements: number;
}

function patchFileContent(fullPath: string, dryRun: boolean): ContentResult | null {
  let content: string;
  try {
    content = readFileSync(fullPath, "utf-8");
  } catch {
    return null;
  }

  const original = content;

  // Bundle ID (most specific, do first)
  content = content.replace(/com\.mitchellh\.ghostty/g, BRAND.bundleIdTo);
  content = content.replace(/com\/mitchellh\/ghostty/g, BRAND.bundleIdTo.replace(/\./g, "/"));

  // Ghost emoji
  content = content.replace(/\u{1F47B}/gu, "");

  content = content.replace(/GHOSTTY/g, BRAND.envPrefix);
  content = content.replace(/Ghostty/g, BRAND.shell);
  content = content.replace(/ghostty/g, BRAND.lower);

  if (content === original) return null;

  // Count replacements
  let replacements = 0;
  for (let i = 0; i < original.length; i++) {
    if (original[i] !== content[i]) replacements++;
  }

  if (!dryRun) {
    writeFileSync(fullPath, content);
  }

  return { file: relativeTo(GHOSTTY_DIR, fullPath), replacements };
}

// ---------------------------------------------------------------------------
// Pass 2: File and directory renaming
// ---------------------------------------------------------------------------

interface RenameResult {
  from: string;
  to: string;
}

function computeRenames(entries: string[], dryRun: boolean): RenameResult[] {
  const results: RenameResult[] = [];

  for (const fullPath of entries) {
    const parent = fullPath.slice(0, fullPath.lastIndexOf("/"));
    const name = fullPath.slice(parent.length + 1);

    if (!name.includes("GHOSTTY") && !name.includes("Ghostty") && !name.includes("ghostty"))
      continue;

    const relative = relativeTo(GHOSTTY_DIR, fullPath);
    if (RENAME_EXCLUSIONS.has(relative)) continue;

    const newName = name
      .replace(/GHOSTTY/g, BRAND.envPrefix)
      .replace(/Ghostty/g, BRAND.shell)
      .replace(/ghostty/g, BRAND.lower);
    const newPath = join(parent, newName);

    if (fullPath === newPath) continue;

    if (!dryRun && existsSync(fullPath)) {
      try {
        renameSync(fullPath, newPath);
      } catch (err) {
        process.stderr.write(`  [WARN] Failed to rename: ${relative} -- ${err}\n`);
        continue;
      }
    }

    results.push({
      from: relativeTo(GHOSTTY_DIR, fullPath),
      to: relativeTo(GHOSTTY_DIR, newPath),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Verify: check for remaining references
// ---------------------------------------------------------------------------

interface VerifyHit {
  file: string;
  line: number;
  text: string;
}

function verifyClean(): VerifyHit[] {
  const hits: VerifyHit[] = [];
  const files = collectTextFiles(GHOSTTY_DIR);

  for (const fullPath of files) {
    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Check for GHOSTTY/Ghostty/ghostty and ghost emoji
      if (line != null && /GHOSTTY|Ghostty|ghostty|\u{1F47B}/u.test(line)) {
        hits.push({
          file: relativeTo(GHOSTTY_DIR, fullPath),
          line: i + 1,
          text: line.trim().slice(0, 120),
        });
      }
    }
  }

  // Check file/directory names
  const entries = collectAllEntriesDepthFirst(GHOSTTY_DIR);
  for (const fullPath of entries) {
    const name = fullPath.slice(fullPath.lastIndexOf("/") + 1);
    if (name.includes("GHOSTTY") || name.includes("Ghostty") || name.includes("ghostty")) {
      hits.push({
        file: relativeTo(GHOSTTY_DIR, fullPath),
        line: 0,
        text: `[FILENAME] ${name}`,
      });
    }
  }

  return hits;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const verifyOnly = args.includes("--verify");

  if (!existsSync(GHOSTTY_DIR)) {
    process.stderr.write(`Ghostty source not found at ${GHOSTTY_DIR}\n`);
    process.exit(1);
  }

  if (verifyOnly) {
    process.stdout.write("\nVerifying for remaining Ghostty references...\n\n");
    const hits = verifyClean();
    if (hits.length === 0) {
      process.stdout.write("  CLEAN -- no Ghostty references found.\n\n");
    } else {
      process.stdout.write(`  Found ${hits.length} remaining references:\n\n`);
      for (const hit of hits.slice(0, 100)) {
        if (hit.line === 0) {
          process.stdout.write(`  ${hit.file}\n    ${hit.text}\n\n`);
        } else {
          process.stdout.write(`  ${hit.file}:${hit.line}\n    ${hit.text}\n\n`);
        }
      }
      if (hits.length > 100) {
        process.stdout.write(`  ... and ${hits.length - 100} more\n`);
      }
    }
    return;
  }

  const mode = dryRun ? "DRY RUN" : "LIVE";
  process.stdout.write(`\nRebrand Ghostty -> ${BRAND.product} (${mode})\n`);
  process.stdout.write(`Source: ${GHOSTTY_DIR}\n\n`);

  // Pass 1: Content
  process.stdout.write("> Pass 1: Content replacement...\n");
  const files = collectTextFiles(GHOSTTY_DIR);
  const contentResults: ContentResult[] = [];

  for (const file of files) {
    const result = patchFileContent(file, dryRun);
    if (result) contentResults.push(result);
  }

  process.stdout.write(`  Scanned ${files.length} files, patched ${contentResults.length}\n`);
  if (dryRun && contentResults.length > 0) {
    for (const r of contentResults.slice(0, 30)) {
      process.stdout.write(`    ${r.file}\n`);
    }
    if (contentResults.length > 30) {
      process.stdout.write(`    ... and ${contentResults.length - 30} more\n`);
    }
  }

  // Pass 2: Renames
  process.stdout.write("\n> Pass 2: File/directory renaming...\n");
  const entries = collectAllEntriesDepthFirst(GHOSTTY_DIR);
  const renameResults = computeRenames(entries, dryRun);

  process.stdout.write(`  Renamed ${renameResults.length} entries\n`);
  if (renameResults.length > 0) {
    for (const r of renameResults.slice(0, 30)) {
      process.stdout.write(`    ${r.from} -> ${r.to}\n`);
    }
    if (renameResults.length > 30) {
      process.stdout.write(`    ... and ${renameResults.length - 30} more\n`);
    }
  }

  // Auto-verify
  if (!dryRun) {
    process.stdout.write("\n> Verifying...\n");
    const hits = verifyClean();
    if (hits.length === 0) {
      process.stdout.write("  CLEAN -- no Ghostty references remaining.\n");
    } else {
      process.stdout.write(
        `  ${hits.length} remaining references (may need exclusions or new extensions):\n`,
      );
      for (const hit of hits.slice(0, 20)) {
        if (hit.line === 0) {
          process.stdout.write(`    ${hit.file} -- ${hit.text}\n`);
        } else {
          process.stdout.write(`    ${hit.file}:${hit.line} -- ${hit.text}\n`);
        }
      }
      if (hits.length > 20) {
        process.stdout.write(`    ... and ${hits.length - 20} more\n`);
      }
    }
  }

  process.stdout.write("\nDone.\n\n");
}

main();
