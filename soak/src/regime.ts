import type { Soak } from "./context.ts";
import {
  basicDiscovery,
  captureActiveWindow,
  captureDisplays,
  cursorWorkflow,
  liveHeliumWorkflow,
  liveTextEditWorkflow,
  permissionPreflight,
  serviceWorkflow,
  stopServices,
} from "./probes.ts";
import type { Regime } from "./types.ts";

export async function runRegime(ctx: Soak): Promise<void> {
  await stopServices(ctx);
  await permissionPreflight(ctx);

  if (ctx.options.regime === "smoke") {
    await basicDiscovery(ctx);
    await captureDisplays(ctx);
    await stopServices(ctx);
    return;
  }

  for (let iteration = 0; iteration < ctx.options.iterations; iteration += 1) {
    ctx.setIteration(iteration + 1);
    if (ctx.options.iterations > 1) {
      await ctx.step(`iteration ${iteration + 1} begin`, () => ({ iteration: iteration + 1 }));
    }
    await basicDiscovery(ctx);
    await captureDisplays(ctx);
    await captureActiveWindow(ctx);
    await serviceWorkflow(ctx);
    await cursorWorkflow(ctx);
    if (ctx.options.liveTextEdit) {
      await liveTextEditWorkflow(ctx);
    }
    if (ctx.options.liveHelium) {
      await liveHeliumWorkflow(ctx);
    }
    await stopServices(ctx);
  }
}

export function defaultIterations(regime: Regime): number {
  if (regime === "burn") return 5;
  return 1;
}
