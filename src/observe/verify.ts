import { statSync } from "node:fs";
import type { ControlPlane } from "../core/control.js";
import type { Json, WindowInfo } from "../native/macbridge.js";
import type { Expectation, Verification } from "../protocol/types.js";

export type VerificationContext = {
  control?: Pick<ControlPlane, "permissions" | "windows">;
};

function stamp(): string {
  return new Date().toISOString().replaceAll(/[-:.]/g, "");
}

function id(prefix: string): string {
  return `${stamp()}-${prefix}`;
}

function json(value: unknown): Json {
  return value as Json;
}

function verification(
  expectation: Expectation,
  status: Verification["status"],
  detail?: Json,
  error?: string,
): Verification {
  const result: Verification = {
    id: id("verify"),
    expectation,
    status,
    checkedAt: new Date().toISOString(),
  };
  if (detail !== undefined) result.detail = detail;
  if (error !== undefined) result.error = error;
  return result;
}

function targetWindows(
  control: Pick<ControlPlane, "windows">,
  expectation: Extract<Expectation, { type: "windowTitle" }>,
): WindowInfo[] {
  if (expectation.target.kind === "window") {
    const wid = expectation.target.wid;
    return control.windows().filter((window) => window.wid === wid);
  }
  if (expectation.target.kind === "app") return control.windows(expectation.target);
  throw new Error("windowTitle expectation requires a window or app target");
}

export function verifyExpectation(
  expectation: Expectation,
  context: VerificationContext = {},
): Verification {
  try {
    switch (expectation.type) {
      case "artifact": {
        const stats = statSync(expectation.path);
        const minBytes = expectation.minBytes ?? 1;
        const pass = stats.size >= minBytes;
        return verification(
          expectation,
          pass ? "pass" : "fail",
          json({ path: expectation.path, bytes: stats.size, minBytes }),
          pass ? undefined : `artifact is smaller than ${minBytes} bytes`,
        );
      }
      case "permissions": {
        if (context.control == null) {
          throw new Error("permissions expectation requires a control plane");
        }
        const report = context.control.permissions({ require: false });
        const expected = expectation.ok ?? true;
        const pass = report.ok === expected;
        return verification(
          expectation,
          pass ? "pass" : "fail",
          report as unknown as Json,
          pass ? undefined : `permissions ok expected ${expected}, got ${report.ok}`,
        );
      }
      case "windowTitle": {
        if (context.control == null) {
          throw new Error("windowTitle expectation requires a control plane");
        }
        const pattern = new RegExp(expectation.match, expectation.flags);
        const windows = targetWindows(context.control, expectation);
        const titles = windows.map((window) => window.name ?? "");
        const pass = titles.some((title) => pattern.test(title));
        return verification(
          expectation,
          pass ? "pass" : "fail",
          json({ titles }),
          pass ? undefined : `no window title matched ${expectation.match}`,
        );
      }
    }
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : String(caught);
    return verification(expectation, "fail", undefined, error);
  }
}
