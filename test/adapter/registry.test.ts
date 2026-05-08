import { describe, expect, test } from "bun:test";
import {
  getAppAdapter,
  getTerminalAppAdapter,
  listAppAdapters,
} from "../../src/adapter/registry.ts";

describe("adapter registry", () => {
  test("exposes first-class adapters for known app surfaces", () => {
    expect(listAppAdapters().map((adapter) => adapter.id)).toEqual([
      "helium",
      "textedit",
      "ghostty",
      "terminal",
      "outlook",
    ]);
  });

  test("matches adapters by id, app name, and bundle id", () => {
    expect(getAppAdapter("Helium")?.id).toBe("helium");
    expect(getAppAdapter("com.apple.TextEdit")?.id).toBe("textedit");
    expect(getAppAdapter("Microsoft Outlook")?.id).toBe("outlook");
  });

  test("separates terminal-capable adapters", () => {
    expect(getTerminalAppAdapter("ghostty")?.id).toBe("ghostty");
    expect(getTerminalAppAdapter("Terminal")?.id).toBe("terminal");
    expect(getTerminalAppAdapter("helium")).toBeUndefined();
  });
});
