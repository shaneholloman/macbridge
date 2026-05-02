import { dirname, join } from "node:path";
import type { Logger } from "pino";
import type { NativeTarget } from "../native/targets.ts";
import type { BuildArtifact, BuildManifest } from "../runtime/manifest.ts";
import { paths } from "../runtime/paths.ts";
import { copyFile, ensureDir, fileSHA256, removePath, run } from "../runtime/runner.ts";

const appName = "MacBridge";
const bundleID = "com.shaneholloman.macbridge";
const iconName = "MacBridge";
const brandMarkName = "MacBridgeMark.png";
const iconSource = "assets/icon/macbridge.svg";

type IconSlot = {
  name: string;
  pixels: number;
};

const iconSlots: IconSlot[] = [
  { name: "icon_16x16.png", pixels: 16 },
  { name: "icon_16x16@2x.png", pixels: 32 },
  { name: "icon_32x32.png", pixels: 32 },
  { name: "icon_32x32@2x.png", pixels: 64 },
  { name: "icon_128x128.png", pixels: 128 },
  { name: "icon_128x128@2x.png", pixels: 256 },
  { name: "icon_256x256.png", pixels: 256 },
  { name: "icon_256x256@2x.png", pixels: 512 },
  { name: "icon_512x512.png", pixels: 512 },
  { name: "icon_512x512@2x.png", pixels: 1024 },
];

export function appBundlePath(target: NativeTarget): string {
  return join(paths.dist.app, target.id, `${appName}.app`);
}

export function appExecutablePath(target: NativeTarget): string {
  return join(appBundlePath(target), "Contents", "MacOS", "macbridge");
}

export function appInfoPlistPath(target: NativeTarget): string {
  return join(appBundlePath(target), "Contents", "Info.plist");
}

export function appIconPath(target: NativeTarget): string {
  return join(appBundlePath(target), "Contents", "Resources", `${iconName}.icns`);
}

export function appBrandMarkPath(target: NativeTarget): string {
  return join(appBundlePath(target), "Contents", "Resources", brandMarkName);
}

export function appNotaryEvidencePath(target: NativeTarget): string {
  return join(paths.dist.security, `${appName}-${target.id}.app.notary.json`);
}

export async function stageApps(
  log: Logger,
  manifest: BuildManifest,
  targets: NativeTarget[],
): Promise<BuildArtifact[]> {
  const artifacts: BuildArtifact[] = [];
  const icon = await generateIcon(log);
  const brandMark = await generateBrandMark(log);
  artifacts.push(icon);
  artifacts.push(brandMark);

  for (const target of targets) {
    artifacts.push(...(await stageApp(log, manifest, target, icon.path, brandMark.path)));
  }

  return artifacts;
}

async function generateIcon(log: Logger): Promise<BuildArtifact> {
  if (!(await Bun.file(iconSource).exists())) {
    throw new Error(`missing app icon source: ${iconSource}`);
  }

  const iconRoot = join(paths.dist.app, "icons");
  const iconset = join(iconRoot, `${iconName}.iconset`);
  const icns = join(iconRoot, `${iconName}.icns`);

  await removePath(iconset);
  await ensureDir(iconset);

  for (const slot of iconSlots) {
    await run(log, [
      "rsvg-convert",
      "--width",
      String(slot.pixels),
      "--height",
      String(slot.pixels),
      "--output",
      join(iconset, slot.name),
      iconSource,
    ]);
  }

  await run(log, ["iconutil", "--convert", "icns", "--output", icns, iconset]);

  return {
    path: icns,
    kind: "app-icon",
    sha256: await fileSHA256(icns),
    size: Bun.file(icns).size,
  };
}

async function generateBrandMark(log: Logger): Promise<BuildArtifact> {
  if (!(await Bun.file(iconSource).exists())) {
    throw new Error(`missing app icon source: ${iconSource}`);
  }

  const iconRoot = join(paths.dist.app, "icons");
  const brandMark = join(iconRoot, brandMarkName);

  await ensureDir(iconRoot);
  await run(log, [
    "rsvg-convert",
    "--width",
    "256",
    "--height",
    "256",
    "--output",
    brandMark,
    iconSource,
  ]);

  return {
    path: brandMark,
    kind: "app-brand-mark",
    sha256: await fileSHA256(brandMark),
    size: Bun.file(brandMark).size,
  };
}

async function stageApp(
  log: Logger,
  manifest: BuildManifest,
  target: NativeTarget,
  icon: string,
  brandMark: string,
): Promise<BuildArtifact[]> {
  const app = appBundlePath(target);
  const contents = join(app, "Contents");
  const macOS = join(contents, "MacOS");
  const resources = join(contents, "Resources");
  const sourceBinary = join(paths.dist.bin, target.binaryName);
  const executable = appExecutablePath(target);
  const infoPlist = appInfoPlistPath(target);
  const appIcon = appIconPath(target);
  const appBrandMark = appBrandMarkPath(target);

  if (!(await Bun.file(sourceBinary).exists())) {
    throw new Error(`missing staged binary for ${target.id}: ${sourceBinary}`);
  }

  await removePath(app);
  await ensureDir(macOS);
  await ensureDir(resources);
  await copyFile(sourceBinary, executable);
  await run(log, ["chmod", "755", executable]);
  await copyFile(icon, appIcon);
  await copyFile(brandMark, appBrandMark);
  await Bun.write(infoPlist, await appInfoPlist(target));

  manifest.native.push({
    target: target.id,
    source: sourceBinary,
    staged: executable,
    signed: false,
    notarized: false,
  });

  return [
    {
      path: executable,
      kind: "app-native-executable",
      target: target.id,
      sha256: await fileSHA256(executable),
      size: Bun.file(executable).size,
    },
    {
      path: infoPlist,
      kind: "app-info-plist",
      target: target.id,
      sha256: await fileSHA256(infoPlist),
      size: Bun.file(infoPlist).size,
    },
    {
      path: appIcon,
      kind: "app-icon-resource",
      target: target.id,
      sha256: await fileSHA256(appIcon),
      size: Bun.file(appIcon).size,
    },
    {
      path: appBrandMark,
      kind: "app-brand-mark-resource",
      target: target.id,
      sha256: await fileSHA256(appBrandMark),
      size: Bun.file(appBrandMark).size,
    },
  ];
}

async function appInfoPlist(target: NativeTarget): Promise<string> {
  const pkg = JSON.parse(await Bun.file("package.json").text()) as { version: string };
  const executable = "macbridge";
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>${appName}</string>
  <key>CFBundleExecutable</key>
  <string>${executable}</string>
  <key>CFBundleIconFile</key>
  <string>${iconName}</string>
  <key>CFBundleIdentifier</key>
  <string>${bundleID}.${target.arch}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${appName}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${pkg.version}</string>
  <key>CFBundleVersion</key>
  <string>${pkg.version}</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHumanReadableCopyright</key>
  <string>Copyright © 2026 Shane Holloman</string>
</dict>
</plist>
`;
}

export async function appBundleFiles(target: NativeTarget): Promise<string[]> {
  return [
    appExecutablePath(target),
    appInfoPlistPath(target),
    appIconPath(target),
    appBrandMarkPath(target),
    join(dirname(appBundlePath(target)), `${appName}-${target.id}.zip`),
  ];
}
