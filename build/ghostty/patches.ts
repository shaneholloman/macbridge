import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BuildLogger } from "../runtime/log.js";

interface ReplaceBlockContract {
  filePath: string;
  id: string;
  notFoundMessage: string;
  replacement: string;
  search: string;
  successMessage: string;
}

interface ReplaceContentContract {
  filePath: string;
  id: string;
  replacement: string;
  successMessage: string;
}

function applyReplaceBlockContract(log: BuildLogger, contract: ReplaceBlockContract): void {
  if (!existsSync(contract.filePath)) {
    log.warn(`${contract.id}: file not found (${contract.filePath})`);
    return;
  }

  const content = readFileSync(contract.filePath, "utf-8");
  if (!content.includes(contract.search)) {
    log.warn(`${contract.id}: ${contract.notFoundMessage}`);
    return;
  }

  const updated = content.replace(contract.search, contract.replacement);
  if (updated === content) {
    log.warn(`${contract.id}: no changes applied`);
    return;
  }

  writeFileSync(contract.filePath, updated);
  log.info(contract.successMessage);
}

function applyReplaceContentContract(log: BuildLogger, contract: ReplaceContentContract): void {
  if (!existsSync(contract.filePath)) {
    log.warn(`${contract.id}: file not found (${contract.filePath})`);
    return;
  }

  const content = readFileSync(contract.filePath, "utf-8");
  if (content === contract.replacement) return;
  writeFileSync(contract.filePath, contract.replacement);
  log.info(contract.successMessage);
}

const APP_DELEGATE_OLD_INIT = `#if DEBUG
        macbridge = MacBridge.App(configPath: ProcessInfo.processInfo.environment["MACBRIDGE_CONFIG_PATH"])
#else
        macbridge = MacBridge.App()
#endif`;

const APP_DELEGATE_NEW_INIT = `// Use bundled config from Resources, env var override, or default
        let configPath = ProcessInfo.processInfo.environment["MACBRIDGE_CONFIG_PATH"]
            ?? Bundle.main.path(forResource: "macbridge-config", ofType: nil)
        macbridge = MacBridge.App(configPath: configPath)`;

const CONFIG_OLD_LOAD_BLOCK = `            if let path {
                macbridge_config_load_file(cfg, path)
            } else {
                macbridge_config_load_default_files(cfg)
            }`;

const CONFIG_NEW_LOAD_BLOCK = `            // Always load default user config files first
            macbridge_config_load_default_files(cfg)
            // Then load bundled config as override (sets command to launch agent)
            if let path {
                macbridge_config_load_file(cfg, path)
            }`;

const ABOUT_VIEW_STATIC_CONTENT = `import ApplicationServices
import AppKit
import CoreGraphics
import ScreenCaptureKit
import SwiftUI

struct AboutView: View {
    @Environment(\\.openURL) var openURL
    @State private var permissions = PermissionState.current
    @State private var isRequestingScreenRecording = false

    private let docsURL = URL(string: "https://github.com/shaneholloman/macbridge/tree/main/docs")
    private let githubURL = URL(string: "https://github.com/shaneholloman/macbridge")
    private var copyright: String? { Bundle.main.infoDictionary?["NSHumanReadableCopyright"] as? String }
    private var version: String? { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String }

    var body: some View {
        VStack(alignment: .center, spacing: 24) {
            CyclingIconView()
                .padding(.bottom, 4)

            VStack(alignment: .center, spacing: 8) {
                Text("MacBridge")
                    .bold()
                    .font(.title)
                Text("Native macOS automation shell")
                    .multilineTextAlignment(.center)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .textSelection(.enabled)

            VStack(spacing: 8) {
                if let version {
                    PropertyRow(label: "Version", text: version)
                }
                PermissionRow(label: "Accessibility", granted: permissions.accessibility)
                PermissionRow(label: "Screen Recording", granted: permissions.screenRecording)
            }
            .frame(maxWidth: .infinity)

            HStack(spacing: 8) {
                Button("Permissions") {
                    permissions = .current
                    openNextMissingPermission()
                }
                if let url = docsURL {
                    Button("Docs") {
                        openURL(url)
                    }
                }
                if let url = githubURL {
                    Button("GitHub") {
                        openURL(url)
                    }
                }
            }

            if let copy = self.copyright {
                Text(copy)
                    .font(.caption)
                    .textSelection(.enabled)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.top, 0)
        .padding(32)
        .frame(minWidth: 320)
        .onAppear {
            permissions = .current
        }
        .background(VisualEffectBackground(material: .underWindowBackground).ignoresSafeArea())
    }

    private func openNextMissingPermission() {
        NSApp.activate(ignoringOtherApps: true)
        permissions = .current

        if !permissions.accessibility {
            _ = AXIsProcessTrustedWithOptions(
                [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
            )
            openPrivacyPane("Privacy_Accessibility")
            return
        }

        if !permissions.screenRecording {
            requestScreenRecording()
            return
        }

        openPrivacyPane("Privacy")
    }

    private func requestScreenRecording() {
        guard !isRequestingScreenRecording else {
            openPrivacyPane("Privacy_ScreenCapture")
            return
        }

        isRequestingScreenRecording = true
        _ = CGRequestScreenCaptureAccess()

        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: false) { _, _ in
            DispatchQueue.main.async {
                isRequestingScreenRecording = false
                permissions = .current
                openPrivacyPane("Privacy_ScreenCapture")
            }
        }
    }

    private func openPrivacyPane(_ anchor: String) {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\\(anchor)") else {
            return
        }

        NSWorkspace.shared.open(url)
    }

    private struct PermissionState {
        let accessibility: Bool
        let screenRecording: Bool

        static var current: PermissionState {
            PermissionState(
                accessibility: AXIsProcessTrusted(),
                screenRecording: CGPreflightScreenCaptureAccess()
            )
        }
    }

    private struct PermissionRow: View {
        let label: String
        let granted: Bool

        var body: some View {
            HStack(spacing: 4) {
                Text(label)
                    .frame(width: 126, alignment: .trailing)
                    .padding(.trailing, 2)
                Text(granted ? "Accepted" : "Missing")
                    .frame(width: 125, alignment: .leading)
                    .padding(.leading, 2)
                    .foregroundStyle(granted ? .green : .red)
                    .fontWeight(.medium)
            }
            .font(.callout)
            .frame(maxWidth: .infinity)
        }
    }

    private struct PropertyRow: View {
        let label: String
        let text: String

        var body: some View {
            HStack(spacing: 4) {
                Text(label)
                    .frame(width: 126, alignment: .trailing)
                    .padding(.trailing, 2)
                Text(text)
                    .frame(width: 125, alignment: .leading)
                    .padding(.leading, 2)
                    .foregroundStyle(.secondary)
                    .monospaced()
            }
            .font(.callout)
            .textSelection(.enabled)
            .frame(maxWidth: .infinity)
        }
    }

    private struct VisualEffectBackground: NSViewRepresentable {
        let material: NSVisualEffectView.Material
        let blendingMode: NSVisualEffectView.BlendingMode
        let isEmphasized: Bool

        init(
            material: NSVisualEffectView.Material,
            blendingMode: NSVisualEffectView.BlendingMode = .behindWindow,
            isEmphasized: Bool = false
        ) {
            self.material = material
            self.blendingMode = blendingMode
            self.isEmphasized = isEmphasized
        }

        func updateNSView(_ nsView: NSVisualEffectView, context: Context) {
            nsView.material = material
            nsView.blendingMode = blendingMode
            nsView.isEmphasized = isEmphasized
        }

        func makeNSView(context: Context) -> NSVisualEffectView {
            let visualEffect = NSVisualEffectView()
            visualEffect.autoresizingMask = [.width, .height]
            return visualEffect
        }
    }
}

struct AboutView_Previews: PreviewProvider {
    static var previews: some View {
        AboutView()
    }
}
`;

const ABOUT_VIEW_MODEL_STATIC_CONTENT = `import Combine
import MacBridgeKit

class AboutViewModel: ObservableObject {
    @Published var currentIcon: MacBridge.MacOSIcon?
    @Published var isHovering: Bool = false

    func startCyclingIcons() {
        currentIcon = nil
    }

    func stopCyclingIcons() {
        currentIcon = nil
    }

    func advanceToNextIcon() {
        currentIcon = nil
    }
}
`;

const CYCLING_ICON_VIEW_STATIC_CONTENT = `import SwiftUI
import AppKit

struct CyclingIconView: View {
    var body: some View {
        iconImage()
            .resizable()
            .aspectRatio(contentMode: .fit)
            .frame(height: 128)
            .accessibilityLabel("MacBridge Application Icon")
    }

    private func iconImage() -> Image {
        if let path = Bundle.main.path(forResource: "macbridge-icon", ofType: "png"),
           let nsImage = NSImage(contentsOfFile: path) {
            return Image(nsImage: nsImage)
        }

        return self.macbridgeIconImage()
    }
}
`;

export function applyGhosttySwiftPatches(log: BuildLogger, ghosttyDir: string): void {
  const contracts: ReplaceBlockContract[] = [
    {
      filePath: join(ghosttyDir, "macos/Sources/App/macOS/AppDelegate.swift"),
      id: "ghostty-app-delegate-config-path",
      notFoundMessage: "init pattern not found (may already be patched)",
      replacement: APP_DELEGATE_NEW_INIT,
      search: APP_DELEGATE_OLD_INIT,
      successMessage: "AppDelegate patched: bundled config path",
    },
    {
      filePath: join(ghosttyDir, "macos/Sources/MacBridge/MacBridge.Config.swift"),
      id: "ghostty-config-default-load-order",
      notFoundMessage: "load pattern not found (may already be patched)",
      replacement: CONFIG_NEW_LOAD_BLOCK,
      search: CONFIG_OLD_LOAD_BLOCK,
      successMessage: "MacBridge.Config patched: defaults loaded before bundled config",
    },
  ];

  for (const contract of contracts) {
    applyReplaceBlockContract(log, contract);
  }

  const contentContracts: ReplaceContentContract[] = [
    {
      filePath: join(ghosttyDir, "macos/Sources/Features/About/AboutView.swift"),
      id: "ghostty-about-view-permissions",
      replacement: ABOUT_VIEW_STATIC_CONTENT,
      successMessage: "AboutView patched: MacBridge permissions center",
    },
    {
      filePath: join(ghosttyDir, "macos/Sources/Features/About/AboutViewModel.swift"),
      id: "ghostty-about-view-model-static-icon",
      replacement: ABOUT_VIEW_MODEL_STATIC_CONTENT,
      successMessage: "AboutViewModel patched: icon cycling disabled",
    },
    {
      filePath: join(ghosttyDir, "macos/Sources/Features/About/CyclingIconView.swift"),
      id: "ghostty-cycling-icon-view-static-icon",
      replacement: CYCLING_ICON_VIEW_STATIC_CONTENT,
      successMessage: "CyclingIconView patched: static bundled MacBridge icon",
    },
  ];

  for (const contract of contentContracts) {
    applyReplaceContentContract(log, contract);
  }
}
