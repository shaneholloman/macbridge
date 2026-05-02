import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { paths } from "./paths.ts";

export type ArtifactSecurityRecord = {
  artifactKind: string;
  artifactPath: string;
  note?: string;
  operation: "sign" | "notarize";
  status: "failed" | "ok" | "skipped";
};

export async function appendArtifactSecurityRecord(record: ArtifactSecurityRecord): Promise<void> {
  const path = join(paths.dist.security, "apple-security.jsonl");
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify({ ...record, at: new Date().toISOString() })}\n`);
}
