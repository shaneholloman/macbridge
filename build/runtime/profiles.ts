export type RuntimeProfile = "shell";

export const RUNTIME_PROFILE_MATRIX: readonly RuntimeProfile[] = ["shell"];

export function getProfileArtifactSuffix(profile: RuntimeProfile): string {
  return profile === "shell" ? "" : `-${profile}`;
}

export function getProfileDisplayName(profile: RuntimeProfile): string {
  return profile.charAt(0).toUpperCase() + profile.slice(1);
}

export function getProfileAppBundleName(profile: RuntimeProfile): string {
  return profile === "shell" ? "MacBridge.app" : `MacBridge ${getProfileDisplayName(profile)}.app`;
}
