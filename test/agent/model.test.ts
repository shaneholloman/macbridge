import { describe, expect, test } from "bun:test";
import { configuredModels, parseModelID } from "../../src/agent/model.ts";

describe("model semantics", () => {
  test("parses provider/model ids", () => {
    expect(parseModelID("openai/gpt-x")).toEqual({
      id: "openai/gpt-x",
      provider: "openai",
      name: "gpt-x",
    });
  });

  test("rejects short model ids at public boundaries", () => {
    expect(() => parseModelID("gpt-x")).toThrow("provider/model");
  });

  test("lists configured models with filters", () => {
    const models = configuredModels(
      {
        MACBRIDGE_MODEL: "openai/gpt-x",
        MACBRIDGE_VISION_MODEL: "anthropic/claude-x",
      },
      { kind: "vision" },
    );

    expect(models).toEqual([
      {
        id: "anthropic/claude-x",
        provider: "anthropic",
        name: "claude-x",
        kind: "vision",
        source: "env",
        env: "MACBRIDGE_VISION_MODEL",
      },
    ]);
  });
});
