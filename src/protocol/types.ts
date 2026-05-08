import type { Json, WindowInfo } from "../native/macbridge.js";

export type CoordMode = "pixel" | "normalized" | "global";

export type Point = {
  x: number;
  y: number;
  coord?: CoordMode;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DisplaySelector = "main" | number | string;

export type Target =
  | { kind: "window"; wid: number }
  | { kind: "app"; name?: string; bundleID?: string; pid?: number }
  | { kind: "display"; display: DisplaySelector }
  | { kind: "desktop" };

export type DisplayInfo = {
  index: number;
  displayID: number;
  screenNumber: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visibleX: number;
  visibleY: number;
  visibleWidth: number;
  visibleHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  scaleFactor: number;
  main: boolean;
  builtin: boolean;
};

export type PermissionReport = {
  ok: boolean;
  prompted: boolean;
  permissions: Array<{
    id: string;
    name: string;
    granted: boolean;
    requiredFor: string[];
  }>;
};

export type Artifact = {
  path: string;
  kind:
    | "target-screenshot"
    | "display-screenshot"
    | "desktop-screenshot"
    | "video-frame"
    | "session-frames"
    | "session-video"
    | "observation"
    | "summary"
    | "accessibility"
    | "log";
  bytes?: number;
};

export type RedactedText = {
  redacted: true;
  kind: "text";
  chars: number;
  words: number;
  reason: "user-content";
};

export type RedactionOptions = {
  maxDepth?: number;
  maxArrayItems?: number;
};

export type RedactionReport = {
  policy: "default-user-content";
  textFieldsRedacted: number;
  arraysTruncated: number;
  objectsTruncated: number;
  maxDepth: number;
  maxArrayItems: number;
};

export type ObservationSummary = {
  id: string;
  target: Target;
  capturedAt: string;
  permissions: {
    ok: boolean;
    missing: string[];
  };
  displays: Array<{
    index: number;
    displayID: number;
    name: string;
    bounds: Rect;
    visibleBounds: Rect;
    scaleFactor: number;
    main: boolean;
  }>;
  windows: Array<{
    wid: number;
    pid: number;
    owner: string;
    bundleID?: string;
    bounds: Rect;
    title?: RedactedText;
  }>;
  targetWindow?: {
    wid: number;
    pid: number;
    owner: string;
    bundleID?: string;
    bounds: Rect;
    title?: RedactedText;
  };
  artifacts: Artifact[];
  captures: {
    target?: Artifact;
    display?: Artifact;
  };
  accessibility?: Json;
  redaction: RedactionReport;
};

export type Observation = {
  id: string;
  target: Target;
  capturedAt: string;
  permissions: PermissionReport;
  displays: DisplayInfo[];
  windows: WindowInfo[];
  artifacts: Artifact[];
  /** Cropped capture of the resolved target, usually one app/window. */
  targetScreenshot?: Artifact;
  /** Full monitor capture used to verify what is actually visible on screen. */
  displayScreenshot?: Artifact;
  accessibility?: Json;
  summary?: ObservationSummary;
};

export type ObserveInput = {
  target: Target;
  /** Cropped target capture. Defaults to true. */
  targetScreenshot?: boolean;
  /** Full display sanity capture. Defaults to false. */
  displayScreenshot?: boolean | { display?: DisplaySelector };
  accessibility?: boolean | Point;
  /** Redacted model/log summary. Defaults to true. */
  redactedSummary?: boolean | RedactionOptions;
  outDir?: string;
  requirePermissions?: boolean;
  promptPermissions?: boolean;
};

export type Action =
  | { type: "activate"; target: Target }
  | { type: "click"; target: Target; point: Point }
  | { type: "type"; target: Target; text: string; at?: Point; replace?: boolean }
  | {
      type: "paste";
      target: Target;
      text: string;
      at?: Point;
      activate?: boolean;
      submit?: boolean;
      preserveClipboard?: boolean;
    }
  | { type: "press"; target: Target; key: string; modifiers?: string[] }
  | { type: "axAction"; target: Target; point: Point; action: string }
  | { type: "setFrame"; target: Target; frame: Rect }
  | { type: "maximize"; target: Target; display?: string | number; margin?: number }
  | { type: "command"; argv: string[] };

export type Expectation =
  | { type: "artifact"; path: string; minBytes?: number }
  | { type: "windowTitle"; target: Target; match: string; flags?: string }
  | { type: "permissions"; ok?: boolean };

export type PlannedAction = {
  action: Action;
  reason?: string;
  expect?: Expectation;
};

export type PlannerInput = {
  observation: Observation;
  session: {
    id: string;
    outDir: string;
  };
};

export type Planner = (input: PlannerInput) => PlannedAction | Promise<PlannedAction>;

export type ActionPolicy = {
  allow?: Array<Action["type"]>;
  commandPrefixes?: string[][];
};

export type ActionResult = {
  id: string;
  action: Action;
  status: "pass" | "fail";
  startedAt: string;
  finishedAt: string;
  stdout?: string;
  stderr?: string;
  json?: Json;
  error?: string;
  artifacts: Artifact[];
};

export type RecordingFrame = {
  index: number;
  capturedAt: string;
  artifact: Artifact;
};

export type Recording = {
  id: string;
  target: Target;
  startedAt: string;
  finishedAt: string;
  fps: number;
  frames: RecordingFrame[];
  artifacts: Artifact[];
  video?: Artifact;
  probe?: Json;
};

export type Verification = {
  id: string;
  expectation: Expectation;
  status: "pass" | "fail";
  checkedAt: string;
  detail?: Json;
  error?: string;
};

export type RunRecord = {
  id: string;
  sessionID: string;
  startedAt: string;
  finishedAt: string;
  observation: Observation;
  plan: PlannedAction;
  action: ActionResult;
  verification?: Verification;
  recording?: Recording;
  artifacts: Artifact[];
};

export type MacBridgeOptions = {
  bin?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
};
