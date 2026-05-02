export type NativeTarget = {
  id: "darwin-arm64" | "darwin-x64";
  os: "darwin";
  arch: "arm64" | "x64";
  swiftArch: "arm64" | "x86_64";
  buildPath: "arm64-apple-macosx" | "x86_64-apple-macosx";
  binaryName: string;
};

export const macOSTargets: NativeTarget[] = [
  {
    id: "darwin-arm64",
    os: "darwin",
    arch: "arm64",
    swiftArch: "arm64",
    buildPath: "arm64-apple-macosx",
    binaryName: "macbridge-darwin-arm64",
  },
  {
    id: "darwin-x64",
    os: "darwin",
    arch: "x64",
    swiftArch: "x86_64",
    buildPath: "x86_64-apple-macosx",
    binaryName: "macbridge-darwin-x64",
  },
];
