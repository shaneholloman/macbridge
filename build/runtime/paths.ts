export const paths = {
  src: {
    entrypoint: "src/index.ts",
  },
  native: {
    swiftPackage: "native/swift",
    swiftScratch: "tmp/swiftpm",
  },
  dist: {
    root: "dist",
    app: "dist/app",
    bin: "dist/bin",
    build: "dist/build",
    latest: "dist/build/latest.json",
    logs: "dist/build/logs",
    manifests: "dist/build/manifests",
    npm: "dist/build/npm",
    pkg: "dist/pkg",
    security: "dist/build/security",
    timings: "dist/build/timings",
  },
  tmp: "tmp",
  tmpNotary: "tmp/notary",
};
