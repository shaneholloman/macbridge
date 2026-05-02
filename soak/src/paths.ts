import { homedir } from "node:os";
import { join } from "node:path";

export function soakRoot(): string {
  return process.env.MACBRIDGE_SOAK_ROOT ?? join(homedir(), "macbridge", "soak");
}
