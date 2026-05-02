import { createLogger } from "../../src/core/log.ts";

export function createBuildLog(command: string) {
  return createLogger(`build:${command}`);
}
