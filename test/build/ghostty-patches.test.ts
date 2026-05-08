import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyGhosttySwiftPatches } from "../../build/ghostty/patches.ts";
import type { BuildLogger, TimedStage } from "../../build/runtime/log.ts";

function testLog(): BuildLogger {
  const stage: TimedStage = {
    error() {},
    ok() {},
  };

  return {
    error() {},
    info() {},
    ok() {},
    start: () => stage,
    step() {},
    warn() {},
  };
}

function writeGhosttyPatchFixture(ghosttyDir: string): void {
  const appDir = join(ghosttyDir, "macos/Sources/App/macOS");
  const configDir = join(ghosttyDir, "macos/Sources/MacBridge");
  const aboutDir = join(ghosttyDir, "macos/Sources/Features/About");
  mkdirSync(appDir, { recursive: true });
  mkdirSync(configDir, { recursive: true });
  mkdirSync(aboutDir, { recursive: true });

  writeFileSync(
    join(appDir, "AppDelegate.swift"),
    `import AppKit
import SwiftUI
import UserNotifications
import OSLog
import Sparkle
import MacBridgeKit

class AppDelegate: NSObject {
#if DEBUG
        macbridge = MacBridge.App(configPath: ProcessInfo.processInfo.environment["MACBRIDGE_CONFIG_PATH"])
#else
        macbridge = MacBridge.App()
#endif

    @IBAction func checkForUpdates(_ sender: Any?) {
        updateController.checkForUpdates()
        // UpdateSimulator.happyPath.simulate(with: updateViewModel)
    }
}
`,
  );

  writeFileSync(
    join(configDir, "MacBridge.Config.swift"),
    `func load(path: String?) {
            if let path {
                macbridge_config_load_file(cfg, path)
            } else {
                macbridge_config_load_default_files(cfg)
            }
}
`,
  );

  writeFileSync(join(aboutDir, "AboutView.swift"), "");
  writeFileSync(join(aboutDir, "AboutViewModel.swift"), "");
  writeFileSync(join(aboutDir, "CyclingIconView.swift"), "");
}

describe("Ghostty Swift patches", () => {
  test("routes the MacBridge update menu through the npm registry", () => {
    const ghosttyDir = mkdtempSync(join(tmpdir(), "macbridge-ghostty-patch-"));

    try {
      writeGhosttyPatchFixture(ghosttyDir);
      applyGhosttySwiftPatches(testLog(), ghosttyDir);

      const appDelegate = readFileSync(
        join(ghosttyDir, "macos/Sources/App/macOS/AppDelegate.swift"),
        "utf-8",
      );

      expect(appDelegate).toContain("private final class MacBridgeNpmUpdateChecker");
      expect(appDelegate).toContain("https://registry.npmjs.org/macbridge/latest");
      expect(appDelegate).toContain("https://www.npmjs.com/package/macbridge/v/");
      expect(appDelegate).toContain('private let installCommand = "npx macbridge@latest"');
      expect(appDelegate).toContain("MacBridgeNpmUpdateChecker.shared.checkForUpdates()");
      expect(appDelegate).not.toContain("updateController.checkForUpdates()");
    } finally {
      rmSync(ghosttyDir, { recursive: true, force: true });
    }
  });
});
