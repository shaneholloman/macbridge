import { expect, test } from "bun:test";
import type { MacBridge } from "../../src/core/client.ts";
import type { ControlPlane } from "../../src/core/control.ts";

test("MacBridge is the concrete control plane implementation", () => {
  const implementsProtocol: MacBridge extends ControlPlane ? true : false = true;
  expect(implementsProtocol).toBe(true);
});
