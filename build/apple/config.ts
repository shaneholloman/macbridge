export type AppleConfig = {
  installerIdentity?: string;
  notaryKeychain?: string;
  notaryProfile?: string;
  signIdentity?: string;
  skipNotarize: boolean;
};

export function appleConfig(): AppleConfig {
  const notaryKeychain = envString("MACBRIDGE_NOTARY_KEYCHAIN");
  return {
    installerIdentity:
      envString("MACBRIDGE_INSTALLER_IDENTITY") ??
      "Developer ID Installer: Shane Holloman (N68C9LUA5B)",
    signIdentity:
      envString("MACBRIDGE_SIGN_IDENTITY") ??
      "Developer ID Application: Shane Holloman (N68C9LUA5B)",
    notaryProfile: envString("MACBRIDGE_NOTARY_PROFILE") ?? "aria-notarytool",
    ...(notaryKeychain == null ? {} : { notaryKeychain }),
    skipNotarize: process.env.MACBRIDGE_SKIP_NOTARIZE === "1",
  };
}

export function requireSignIdentity(config = appleConfig()): string {
  if (config.signIdentity == null) {
    throw new Error("MACBRIDGE_SIGN_IDENTITY is required for Apple distribution signing");
  }
  return config.signIdentity;
}

export function requireInstallerIdentity(config = appleConfig()): string {
  if (config.installerIdentity == null) {
    throw new Error("MACBRIDGE_INSTALLER_IDENTITY is required for Apple installer signing");
  }
  return config.installerIdentity;
}

export function requireNotaryProfile(config = appleConfig()): string {
  if (config.notaryProfile == null) {
    throw new Error("MACBRIDGE_NOTARY_PROFILE is required for Apple notarization");
  }
  return config.notaryProfile;
}

function envString(name: string): string | undefined {
  const value = process.env[name];
  return value == null || value === "" ? undefined : value;
}
