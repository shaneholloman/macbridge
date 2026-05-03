export type NativeTarget = {
  id: "darwin-arm64";
  os: "darwin";
  arch: "arm64";
  swiftArch: "arm64";
  buildPath: "arm64-apple-macosx";
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
];
