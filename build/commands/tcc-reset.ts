import { cleanMacBridgeRegistrations, resetMacBridgeTcc } from "../apple/registrations.ts";

export async function tccReset(args: string[] = []): Promise<void> {
  const dryRun = args.includes("--dry-run");
  const includeCurrent = !args.includes("--legacy-only");
  const removeInstalledApps = !args.includes("--keep-installed-apps");

  if (args.includes("--tcc-only")) {
    await resetMacBridgeTcc({ dryRun, includeCurrent });
    return;
  }

  await cleanMacBridgeRegistrations({ dryRun, includeCurrent, removeInstalledApps });
}
