import { join } from "node:path";
import { parseTargets } from "../native/swift.ts";
import { createBuildLog } from "../runtime/log.ts";
import { createManifest, finishManifest, writeManifest } from "../runtime/manifest.ts";
import { paths } from "../runtime/paths.ts";
import { ensureDir, fileSHA256, removePath, run } from "../runtime/runner.ts";
import { appleConfig, requireInstallerIdentity, requireNotaryProfile } from "./config.ts";
import { LEGACY_MACBRIDGE_BUNDLE_IDS, MACBRIDGE_BUNDLE_ID } from "./identity.ts";

export async function pkg(args: string[] = []): Promise<void> {
  const fromDist = args.includes("--from-dist");
  const skipNotarize = args.includes("--skip-notarize");
  const buildArgs = args.filter((arg) => arg !== "--from-dist" && arg !== "--skip-notarize");
  const targets = parseTargets(buildArgs);
  const log = createBuildLog("apple:pkg");
  const manifest = createManifest("apple-pkg");
  const config = appleConfig();
  const installerIdentity = requireInstallerIdentity(config);

  if (!fromDist) {
    throw new Error("pkg packaging requires --from-dist after signed app bundles are staged");
  }

  await ensureDir(paths.dist.pkg);
  await ensureDir(paths.dist.security);

  const packageJSON = JSON.parse(await Bun.file("package.json").text()) as {
    version: string;
  };

  for (const target of targets) {
    const app = join(paths.dist.root, target.id, "MacBridge.app");
    const pkgRoot = join(paths.dist.pkg, target.id);
    const payload = join(pkgRoot, "payload");
    const scripts = join(pkgRoot, "scripts");
    const resources = join(pkgRoot, "resources");
    const componentPlist = join(pkgRoot, "component.plist");
    const component = join(pkgRoot, "component.pkg");
    const distribution = join(pkgRoot, "Distribution.xml");
    const unsigned = join(pkgRoot, "unsigned.pkg");
    const installer = join(paths.dist.pkg, `macbridge-${packageJSON.version}-${target.id}.pkg`);
    const packageEnv = { ...Bun.env, COPYFILE_DISABLE: "1" };

    await run(log, ["codesign", "--verify", "--deep", "--strict", "--verbose=2", app]);
    await removePath(pkgRoot);
    await ensureDir(join(payload, "Applications"));
    await ensureDir(join(payload, "usr", "local", "bin"));
    await ensureDir(scripts);
    await ensureDir(resources);

    await run(log, ["cp", "-R", app, join(payload, "Applications", "MacBridge.app")], {
      env: packageEnv,
    });
    await Bun.write(
      join(payload, "usr", "local", "bin", "macbridge"),
      [
        "#!/bin/zsh",
        'exec "/Applications/MacBridge.app/Contents/MacOS/macbridge-runtime" "$@"',
        "",
      ].join("\n"),
    );
    await run(log, ["chmod", "755", join(payload, "usr", "local", "bin", "macbridge")]);
    await Bun.write(join(scripts, "preinstall"), preinstallScript());
    await run(log, ["chmod", "755", join(scripts, "preinstall")]);
    await Bun.write(join(scripts, "postinstall"), postinstallScript(packageJSON.version));
    await run(log, ["chmod", "755", join(scripts, "postinstall")]);
    await Bun.write(componentPlist, componentPolicyPlist());
    await writeInstallerResources(log, resources, packageJSON.version);
    await run(log, ["dot_clean", "-m", payload]);
    await run(log, ["find", payload, "-name", "._*", "-delete"]);
    await run(log, [
      "codesign",
      "--verify",
      "--deep",
      "--strict",
      "--verbose=2",
      join(payload, "Applications", "MacBridge.app"),
    ]);

    await run(
      log,
      [
        "pkgbuild",
        "--root",
        payload,
        "--identifier",
        `${MACBRIDGE_BUNDLE_ID}.pkg.${target.id}`,
        "--version",
        packageJSON.version,
        "--component-plist",
        componentPlist,
        "--scripts",
        scripts,
        "--install-location",
        "/",
        component,
      ],
      { env: packageEnv },
    );
    await Bun.write(
      distribution,
      distributionXML({
        componentPackage: "component.pkg",
        packageId: `${MACBRIDGE_BUNDLE_ID}.pkg.${target.id}`,
        version: packageJSON.version,
      }),
    );
    await run(
      log,
      [
        "productbuild",
        "--distribution",
        distribution,
        "--resources",
        resources,
        "--package-path",
        pkgRoot,
        unsigned,
      ],
      { env: packageEnv },
    );
    await run(log, [
      "productsign",
      "--sign",
      installerIdentity,
      "--timestamp",
      unsigned,
      installer,
    ]);
    await run(log, ["pkgutil", "--check-signature", installer]);
    await run(log, ["pkgutil", "--payload-files", installer]);

    manifest.artifacts.push({
      path: installer,
      kind: "signed-pkg-installer",
      target: target.id,
      sha256: await fileSHA256(installer),
      size: Bun.file(installer).size,
    });

    if (!skipNotarize && !config.skipNotarize) {
      const profile = requireNotaryProfile(config);
      const result = await run(log, [
        "xcrun",
        "notarytool",
        "submit",
        installer,
        "--keychain-profile",
        profile,
        "--wait",
        "--output-format",
        "json",
      ]);
      const notaryResult = JSON.parse(result.stdout) as { status?: string; id?: string };
      if (notaryResult.status !== "Accepted") {
        throw new Error(
          `pkg notarization for ${target.id} was not accepted: ${JSON.stringify(notaryResult)}`,
        );
      }
      const evidencePath = join(
        paths.dist.security,
        `macbridge-${packageJSON.version}-${target.id}.pkg.notary.json`,
      );
      await Bun.write(evidencePath, `${result.stdout}\n`);
      await run(log, ["xcrun", "stapler", "staple", installer]);
      await run(log, ["xcrun", "stapler", "validate", installer]);
      manifest.artifacts.push({
        path: evidencePath,
        kind: "pkg-notary-evidence",
        target: target.id,
        sha256: await fileSHA256(evidencePath),
        size: Bun.file(evidencePath).size,
      });
    }
  }

  finishManifest(manifest);
  await writeManifest(manifest);
}

function componentPolicyPlist(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<array>",
    "  <dict>",
    "    <key>RootRelativeBundlePath</key>",
    "    <string>Applications/MacBridge.app</string>",
    "    <key>BundleIsRelocatable</key>",
    "    <false/>",
    "    <key>BundleIsVersionChecked</key>",
    "    <false/>",
    "    <key>BundleOverwriteAction</key>",
    "    <string>upgrade</string>",
    "  </dict>",
    "</array>",
    "</plist>",
    "",
  ].join("\n");
}

async function writeInstallerResources(
  log: ReturnType<typeof createBuildLog>,
  resources: string,
  version: string,
): Promise<void> {
  await Bun.write(
    join(resources, "welcome.html"),
    `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:20px}
h1{font-size:24px;font-weight:600;margin:0 0 4px}
.tag{font-size:14px;color:#888;margin-bottom:20px}
p{font-size:14px;line-height:1.6}
li{font-size:14px;line-height:1.8}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
.note{font-size:13px;color:#666;margin-top:20px}
</style></head><body>
<h1>MacBridge</h1>
<p class="tag">Native macOS automation shell</p>
<p>This installer will set up MacBridge ${escapeHTML(version)} on your Mac.</p>
<ul>
<li><strong>MacBridge.app</strong> at <code>/Applications</code></li>
<li>The <strong>macbridge</strong> command at <code>/usr/local/bin</code></li>
<li>The bundled native adapter at <code>/Applications/MacBridge.app/Contents/MacOS/macbridge-runtime</code></li>
</ul>
<br/>
<p class="note">Click "Continue" to proceed.</p>
</body></html>`,
  );

  await Bun.write(
    join(resources, "conclusion.html"),
    `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:20px}
h1{font-size:24px;font-weight:600;margin:0 0 16px}
p{font-size:14px;line-height:1.6}
li{font-size:14px;line-height:1.8}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
</style></head><body>
<h1>Installation Complete</h1>
<p>MacBridge.app is available in Applications.</p>
<p>Open MacBridge from Applications, then choose <strong>MacBridge > About MacBridge > Permissions</strong> to grant macOS privacy access.</p>
<p>Commands installed:</p>
<ul>
<li><code>macbridge</code></li>
</ul>
</body></html>`,
  );

  const backgroundSvg = join(resources, "pkg-background.svg");
  const backgroundPng = join(resources, "pkg-background.png");
  await Bun.write(backgroundSvg, installerBackgroundSVG());
  await run(log, [
    "rsvg-convert",
    "--width",
    "1550",
    "--height",
    "1045",
    "--output",
    backgroundPng,
    backgroundSvg,
  ]);
}

function distributionXML(input: {
  componentPackage: string;
  packageId: string;
  version: string;
}): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="1">
  <title>MacBridge</title>
  <organization>${MACBRIDGE_BUNDLE_ID}</organization>
  <domains enable_localSystem="true"/>
  <options customize="never" require-scripts="true" rootVolumeOnly="true"/>
  <background file="pkg-background.png" alignment="bottomleft" scaling="proportional"/>
  <background-darkAqua file="pkg-background.png" alignment="bottomleft" scaling="proportional"/>
  <volume-check>
    <allowed-os-versions><os-version min="13.0"/></allowed-os-versions>
  </volume-check>
  <welcome file="welcome.html" mime-type="text/html"/>
  <conclusion file="conclusion.html" mime-type="text/html"/>
  <choices-outline><line choice="default"><line choice="macbridge"/></line></choices-outline>
  <choice id="default"/>
  <choice id="macbridge" visible="false"><pkg-ref id="${input.packageId}"/></choice>
  <pkg-ref id="${input.packageId}" version="${input.version}" onConclusion="none">${input.componentPackage}</pkg-ref>
</installer-gui-script>
`;
}

function installerBackgroundSVG(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1550" height="1045" viewBox="0 0 1550 1045">
  <rect width="1550" height="1045" fill="none"/>
  <g transform="translate(-500, 0) scale(38.4615384615)" opacity="0.12">
    <g transform="translate(1.0000013,1.0000013)">
      <circle style="fill:#c00000;fill-opacity:1;stroke:#c00000;stroke-width:0.942938" cx="11.999999" cy="11.999999" r="12.528531"/>
      <path d="m 4.479486,18.607528 c 3.7425514,4.564881 11.282696,4.528163 15.097948,-0.01659" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 21.712217,14.383899 C 22.741202,10.192653 20.965268,5.814128 17.307384,3.523881 13.6495,1.233634 8.935019,1.548427 5.614098,4.304663 2.293177,7.060899 1.115137,11.636665 2.692217,15.653899" transform="rotate(3.827338,12.001055,12.001987)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="m 7.762217,16.243899 c 1.567955,1.57708 3.879601,2.157549 6.006603,1.508297 2.127002,-0.649252 3.72043,-2.421718 4.14038,-4.605592 0.41995,-2.183874 -0.402469,-4.420898 -2.136983,-5.812705" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="m 12.002217,6.003899 h -0.01" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="m 6.012217,12.343899 c -0.110361,-1.93013 0.71607,-3.795185 2.22,-5.01" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle r="2" transform="rotate(180,6.0011,6.00195)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" cx="0" cy="0"/>
    </g>
  </g>
</svg>
`;
}

function escapeHTML(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function preinstallScript(): string {
  const legacyBundleIds = LEGACY_MACBRIDGE_BUNDLE_IDS
    .map((id) => `"${id}"`)
    .join(" ");
  return [
    "#!/bin/zsh",
    "set +e",
    'APP="/Applications/MacBridge.app"',
    'PLIST="$APP/Contents/Info.plist"',
    'CONSOLE_USER="$(/usr/bin/stat -f %Su /dev/console 2>/dev/null || true)"',
    'CONSOLE_HOME=""',
    'if [ -n "$CONSOLE_USER" ] && [ "$CONSOLE_USER" != "root" ]; then',
    '  CONSOLE_HOME="$(/usr/bin/dscl . -read "/Users/$CONSOLE_USER" NFSHomeDirectory 2>/dev/null | /usr/bin/awk \'{print $2}\' || true)"',
    "fi",
    "",
    "count_tcc_cleanup_rows() {",
    '  local database="$1"',
    '  [ -f "$database" ] || return 0',
    `  /usr/bin/sqlite3 "$database" "select count(*) from access where lower(client) like '%macbridge%' and client != '${MACBRIDGE_BUNDLE_ID}';" 2>/dev/null || /bin/echo 0`,
    "}",
    "",
    "delete_legacy_tcc_rows() {",
    '  local database="$1"',
    '  [ -f "$database" ] || return 0',
    `  /usr/bin/sqlite3 "$database" "delete from access where lower(client) like '%macbridge%' and client != '${MACBRIDGE_BUNDLE_ID}';" >/dev/null 2>&1`,
    "}",
    "",
    "legacy_tcc_row_count() {",
    '  local total=0',
    '  local count=0',
    '  count="$(count_tcc_cleanup_rows "/Library/Application Support/com.apple.TCC/TCC.db" | /usr/bin/tail -n 1)"',
    '  [[ "$count" == <-> ]] && total=$((total + count))',
    '  if [ -n "$CONSOLE_HOME" ]; then',
    '    count="$(count_tcc_cleanup_rows "$CONSOLE_HOME/Library/Application Support/com.apple.TCC/TCC.db" | /usr/bin/tail -n 1)"',
    '    [[ "$count" == <-> ]] && total=$((total + count))',
    "  fi",
    '  /bin/echo "$total"',
    "}",
    "",
    "cleanup_legacy_tcc_rows() {",
    '  local total="$(legacy_tcc_row_count)"',
    '  [[ "$total" == <-> ]] || total=0',
    '  [ "$total" -gt 0 ] || return 0',
    '  delete_legacy_tcc_rows "/Library/Application Support/com.apple.TCC/TCC.db"',
    '  if [ -n "$CONSOLE_HOME" ]; then',
    '    delete_legacy_tcc_rows "$CONSOLE_HOME/Library/Application Support/com.apple.TCC/TCC.db"',
    "  fi",
    `  for bundle_id in ${legacyBundleIds}; do`,
    '    for service in Accessibility ScreenCapture; do',
    '      /usr/bin/tccutil reset "$service" "$bundle_id" >/dev/null 2>&1',
    "    done",
    "  done",
    '  /usr/bin/killall tccd >/dev/null 2>&1',
    "}",
    "",
    "cleanup_legacy_tcc_rows",
    "",
    'if [ -f "$PLIST" ]; then',
    '  BUNDLE_ID="$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$PLIST" 2>/dev/null || true)"',
    `  for LEGACY_ID in ${LEGACY_MACBRIDGE_BUNDLE_IDS.map((id) => `"${id}"`).join(" ")}; do`,
    '    if [ "$BUNDLE_ID" = "$LEGACY_ID" ]; then',
    '      rm -rf "$APP"',
    "      break",
    "    fi",
    "  done",
    "fi",
    "exit 0",
    "",
  ].join("\n");
}

function postinstallScript(version: string): string {
  return [
    "#!/bin/zsh",
    'LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"',
    'APP="/Applications/MacBridge.app"',
    'if [ -d "$APP" ]; then',
    '  "$LSREGISTER" -f "$APP" >/dev/null 2>&1',
    "fi",
    `echo "MacBridge ${version} installed."`,
    'echo "Run: macbridge permissions check --prompt"',
    "exit 0",
    "",
  ].join("\n");
}
