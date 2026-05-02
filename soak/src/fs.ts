export async function ensureDir(path: string): Promise<void> {
  await Bun.$`mkdir -p ${path}`.quiet();
}

export function stamp(): string {
  return new Date().toISOString().replaceAll(":", "").replaceAll(".", "");
}

export async function writeJSON(path: string, value: unknown): Promise<void> {
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function appendLine(path: string, line: string): Promise<void> {
  const file = Bun.file(path);
  const previous = (await file.exists()) ? await file.text() : "";
  await Bun.write(path, `${previous}${line}\n`);
}

export async function fileSize(path: string): Promise<number> {
  const file = Bun.file(path);
  if (!(await file.exists())) return 0;
  return file.size;
}
