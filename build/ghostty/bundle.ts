import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import type { BuildLogger } from "../runtime/log.ts";
import { getProfileAppBundleName, type RuntimeProfile } from "../runtime/profiles.ts";

export interface BundleConfig {
  appName: string;
  appNameShort: string;
}

export interface BundleInputs {
  appPath: string;
  distDir: string;
  log: BuildLogger;
  runtimeProfile: RuntimeProfile;
  target: string;
  version: string;
}

const APP_SHELL_BINARY_NAME = "macbridge";
const APP_RUNTIME_BINARY_NAME = "macbridge-runtime";
const APP_LAUNCHER_SCRIPT_NAME = "macbridge-launch";
const SHELL_CONFIG_NAME = "macbridge-config";

function buildShippingConfig(): string {
  return `command = /bin/zsh -l -c 'RESOURCES="\${MACBRIDGE_RESOURCES_DIR:-/Applications/MacBridge.app/Contents/Resources/macbridge}"; LAUNCHER="\${RESOURCES}/../../MacOS/${APP_LAUNCHER_SCRIPT_NAME}"; exec "$LAUNCHER"'
background = #1A1A1A
window-width = 120
window-height = 36
window-padding-x = 16
window-padding-y = 8
window-padding-balance = true
font-size = 13
copy-on-select = clipboard
window-decoration = true
`;
}

function buildLauncherScript(): string {
  return `#!/bin/zsh

set -e

MACBRIDGE_BIN="\${0:A:h}/${APP_RUNTIME_BINARY_NAME}"
SUPPORT_DIR="\${HOME}/Library/Application Support/MacBridge/Shell"
ZDOTDIR="\${SUPPORT_DIR}/zdotdir"
mkdir -p "$ZDOTDIR"

cat > "$ZDOTDIR/.zshrc" <<'EOF'
if [ "$MACBRIDGE_SOURCE_USER_ZSHRC" = "1" ] && [ -r "$HOME/.zshrc" ]; then
  source "$HOME/.zshrc"
fi

export MACBRIDGE_SHELL=1
export HISTFILE="$HOME/Library/Application Support/MacBridge/Shell/history"
export SAVEHIST=10000
export HISTSIZE=10000
setopt append_history interactive_comments no_beep

macbridge() {
  if [ "$#" -eq 0 ]; then
    mb-help
    return 0
  fi

  "$MACBRIDGE_BIN" "$@"
}

mb() {
  if [ "$#" -eq 0 ]; then
    mb-help
    return 0
  fi

  "$MACBRIDGE_BIN" "$@"
}

mb-help() {
  cat <<'HELP'
MacBridge Shell

Commands:
  mb --help
  mb permissions check
  mb windows list
  mb displays list
  mb capture foreground-display main --path screenshot.png

Use MacBridge > About MacBridge > Permissions for macOS privacy grants.
Type exit to close this shell.
HELP
}

alias permissions='mb permissions check --prompt'
alias windows='mb windows list'
alias displays='mb displays list'

autoload -Uz colors
colors
PROMPT='%F{red}MacBridge%f %F{244}%1~%f
%F{green}mb>%f '
RPROMPT='%F{244}mb-help%f'
EOF

export MACBRIDGE_BIN
export PATH="\${MACBRIDGE_BIN:h}:/usr/local/bin:/opt/homebrew/bin:$PATH"
export ZDOTDIR

/usr/bin/clear 2>/dev/null || true
cat <<'EOF'
MacBridge Shell

Ready for native macOS automation.

Try:
  mb --help
  mb permissions check
  mb windows list
  mb displays list

Helpers:
  mb-help      show MacBridge shell examples
  permissions open/check macOS privacy grants
  windows     list visible windows
  displays    list displays

EOF

exec /bin/zsh -i
`;
}

export async function createAppBundle(
  config: BundleConfig,
  inputs: BundleInputs,
): Promise<{ appBundlePath: string; dmgName: string }> {
  const appBundleName = getProfileAppBundleName(inputs.runtimeProfile);
  const stage = inputs.log.start(`Creating ${appBundleName} bundle`);
  const destApp = join(inputs.distDir, appBundleName);

  if (existsSync(destApp)) rmSync(destApp, { recursive: true });
  mkdirSync(inputs.distDir, { recursive: true });
  await $`cp -R ${inputs.appPath} ${destApp}`.quiet();

  const macosDir = join(destApp, "Contents/MacOS");
  const resourcesDir = join(destApp, "Contents/Resources");
  const infoPlist = join(destApp, "Contents/Info.plist");
  const sourceBinary = join("dist/bin", `macbridge-${inputs.target}`);

  if (!existsSync(sourceBinary)) {
    throw new Error(`Missing required MacBridge binary: ${sourceBinary}`);
  }

  const renamedShellBinary = join(macosDir, APP_SHELL_BINARY_NAME);
  if (!existsSync(renamedShellBinary)) {
    throw new Error(`Missing Ghostty shell binary: ${renamedShellBinary}`);
  }
  await $`/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable ${APP_SHELL_BINARY_NAME}" ${infoPlist}`.quiet();
  inputs.log.info(`App shell executable: ${APP_SHELL_BINARY_NAME}`);

  copyFileSync(sourceBinary, join(macosDir, APP_RUNTIME_BINARY_NAME));
  await $`chmod +x ${join(macosDir, APP_RUNTIME_BINARY_NAME)}`.quiet();
  inputs.log.info(`MacBridge binary bundled as ${APP_RUNTIME_BINARY_NAME}`);

  writeFileSync(join(macosDir, APP_LAUNCHER_SCRIPT_NAME), buildLauncherScript());
  await $`chmod +x ${join(macosDir, APP_LAUNCHER_SCRIPT_NAME)}`.quiet();
  writeFileSync(join(resourcesDir, SHELL_CONFIG_NAME), buildShippingConfig());

  const iconPng = join("dist/app/icons", "MacBridgeMark.png");
  if (existsSync(iconPng)) {
    copyFileSync(iconPng, join(resourcesDir, "macbridge-icon.png"));
    inputs.log.info("About screen icon bundled");
  }

  const assetsCar = join(resourcesDir, "Assets.car");
  if (existsSync(assetsCar)) {
    rmSync(assetsCar);
    inputs.log.info("Removed compiled asset catalog so macOS uses MacBridge.icns");
  }

  const icnsSource = join("dist/app/icons", "MacBridge.icns");
  if (existsSync(icnsSource)) {
    for (const file of readdirSync(resourcesDir)) {
      if (file.endsWith(".icns")) {
        copyFileSync(icnsSource, join(resourcesDir, file));
      }
    }
    inputs.log.info("Icons replaced");
  }

  stage.ok(destApp);

  return {
    appBundlePath: destApp,
    dmgName: `${config.appNameShort.toLowerCase()}-${inputs.version}-${inputs.target}.dmg`,
  };
}
