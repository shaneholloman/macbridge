import type { Json, RunResult, WindowInfo } from "../native/macbridge.js";
import type {
  Action,
  ActionResult,
  Artifact,
  DisplayInfo,
  Expectation,
  Observation,
  ObserveInput,
  PermissionReport,
  Point,
  Rect,
  Target,
  Verification,
} from "../protocol/types.js";

export type ControlPlane = {
  run(args: string[]): RunResult;
  json<T extends Json>(args: string[]): T;
  permissions(options?: { prompt?: boolean; require?: boolean }): PermissionReport;
  displays(): DisplayInfo[];
  display(display: Target & { kind: "display" }): DisplayInfo;
  windows(target?: Target): WindowInfo[];
  frame(target: Target): Rect;
  maximize(target: Target, options?: { display?: string | number; margin?: number }): Rect;
  activate(target: Target): Json;
  setFrame(target: Target, frame: Rect): Rect;
  capture(target: Target, outPath: string): Artifact;
  axDump(target: Target, point: Point): Json;
  observe(input: ObserveInput): Promise<Observation>;
  act(action: Action): Promise<ActionResult>;
  verify(expectation: Expectation): Verification;
};
