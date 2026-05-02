export type ModelKind = "text" | "vision" | "action";

export type ModelRef = {
  id: string;
  provider: string;
  name: string;
};

export type ModelInfo = ModelRef & {
  kind: ModelKind;
  source: "env";
  env: string;
};

export type ModelQuery = {
  kind?: ModelKind;
  provider?: string;
};

const modelEnv = [
  { env: "MACBRIDGE_MODEL", kind: "text" },
  { env: "MACBRIDGE_TEXT_MODEL", kind: "text" },
  { env: "MACBRIDGE_VISION_MODEL", kind: "vision" },
  { env: "MACBRIDGE_ACTION_MODEL", kind: "action" },
  { env: "AI_GATEWAY_MODEL", kind: "text" },
  { env: "OPENAI_MODEL", kind: "text" },
  { env: "ANTHROPIC_MODEL", kind: "text" },
] as const;

export function parseModelID(id: string): ModelRef {
  const slash = id.indexOf("/");
  if (slash <= 0 || slash === id.length - 1) {
    throw new Error(`model id must use provider/model form: ${id}`);
  }
  return {
    id,
    provider: id.slice(0, slash),
    name: id.slice(slash + 1),
  };
}

export function configuredModels(
  env: Record<string, string | undefined> = process.env,
  query: ModelQuery = {},
): ModelInfo[] {
  const seen = new Set<string>();
  const models: ModelInfo[] = [];
  for (const entry of modelEnv) {
    const id = env[entry.env];
    if (id == null || id.length === 0) continue;
    const ref = parseModelID(id);
    const key = `${entry.kind}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    models.push({ ...ref, kind: entry.kind, source: "env", env: entry.env });
  }

  return models.filter((model) => {
    if (query.kind != null && model.kind !== query.kind) return false;
    if (query.provider != null && model.provider !== query.provider) return false;
    return true;
  });
}
