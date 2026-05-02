import type { Json, WindowInfo } from "../native/macbridge.js";
import type {
  DisplayInfo,
  Observation,
  ObservationSummary,
  Rect,
  RedactedText,
  RedactionOptions,
  RedactionReport,
} from "../protocol/types.js";

const defaultMaxDepth = 6;
const defaultMaxArrayItems = 24;

const safeStringKeys = new Set([
  "AXRole",
  "AXSubrole",
  "role",
  "subrole",
  "plan",
  "kind",
  "path",
  "bundleID",
  "id",
  "coord",
]);

const safeStringArrayKeys = new Set(["actions", "settable", "parameterized"]);

const sensitiveStringKeys = new Set([
  "AXTitle",
  "AXDescription",
  "AXValue",
  "AXHelp",
  "AXPlaceholderValue",
  "AXSelectedText",
  "title",
  "description",
  "value",
  "text",
  "label",
  "name",
]);

type RedactionState = {
  options: Required<RedactionOptions>;
  report: RedactionReport;
};

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

function words(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

export function redactText(value: string): RedactedText {
  return {
    redacted: true,
    kind: "text",
    chars: value.length,
    words: words(value),
    reason: "user-content",
  };
}

function shouldPreserveString(key: string | undefined, parentKey: string | undefined): boolean {
  if (key === "name" && parentKey === "plan") return true;
  if (key != null && safeStringKeys.has(key) && !sensitiveStringKeys.has(key)) return true;
  if (parentKey != null && safeStringArrayKeys.has(parentKey)) return true;
  return false;
}

function redactJsonValue(
  value: Json,
  state: RedactionState,
  key: string | undefined,
  parentKey: string | undefined,
  depth: number,
): Json {
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;

  if (typeof value === "string") {
    if (shouldPreserveString(key, parentKey)) return value;
    state.report.textFieldsRedacted += 1;
    return redactText(value);
  }

  if (depth >= state.options.maxDepth) {
    state.report.objectsTruncated += 1;
    return { truncated: true, reason: "max-depth" };
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, state.options.maxArrayItems);
    if (items.length < value.length) state.report.arraysTruncated += 1;
    const redacted = items.map((item) => redactJsonValue(item, state, undefined, key, depth + 1));
    if (items.length < value.length) {
      redacted.push({
        truncated: true,
        omitted: value.length - items.length,
        reason: "max-array-items",
      });
    }
    return redacted;
  }

  const out: Record<string, Json> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    out[childKey] = redactJsonValue(childValue, state, childKey, key, depth + 1);
  }
  return out;
}

function summarizeDisplay(display: DisplayInfo): ObservationSummary["displays"][number] {
  return {
    index: display.index,
    displayID: display.displayID,
    name: display.name,
    bounds: rect(display.x, display.y, display.width, display.height),
    visibleBounds: rect(
      display.visibleX,
      display.visibleY,
      display.visibleWidth,
      display.visibleHeight,
    ),
    scaleFactor: display.scaleFactor,
    main: display.main,
  };
}

function summarizeWindow(
  window: WindowInfo,
  state: RedactionState,
): ObservationSummary["windows"][number] {
  if (window.name !== "") state.report.textFieldsRedacted += 1;
  return {
    wid: window.wid,
    pid: window.pid,
    owner: window.owner,
    ...(window.bundleID == null ? {} : { bundleID: window.bundleID }),
    bounds: rect(window.x, window.y, window.width, window.height),
    ...(window.name === "" ? {} : { title: redactText(window.name) }),
  };
}

function targetWindow(observation: Observation): WindowInfo | undefined {
  if (observation.target.kind !== "window") return undefined;
  const { wid } = observation.target;
  return observation.windows.find((window) => window.wid === wid);
}

export function createObservationSummary(
  observation: Observation,
  options: RedactionOptions = {},
): ObservationSummary {
  const resolvedOptions: Required<RedactionOptions> = {
    maxDepth: options.maxDepth ?? defaultMaxDepth,
    maxArrayItems: options.maxArrayItems ?? defaultMaxArrayItems,
  };
  const state: RedactionState = {
    options: resolvedOptions,
    report: {
      policy: "default-user-content",
      textFieldsRedacted: 0,
      arraysTruncated: 0,
      objectsTruncated: 0,
      maxDepth: resolvedOptions.maxDepth,
      maxArrayItems: resolvedOptions.maxArrayItems,
    },
  };

  const missing = observation.permissions.permissions
    .filter((permission) => !permission.granted)
    .map((permission) => permission.name);
  const target = targetWindow(observation);
  const windows = observation.windows.map((window) => summarizeWindow(window, state));
  const targetSummary =
    target == null ? undefined : windows.find((window) => window.wid === target.wid);

  return {
    id: observation.id,
    target: observation.target,
    capturedAt: observation.capturedAt,
    permissions: {
      ok: observation.permissions.ok,
      missing,
    },
    displays: observation.displays.map(summarizeDisplay),
    windows,
    ...(targetSummary == null ? {} : { targetWindow: targetSummary }),
    artifacts: observation.artifacts,
    captures: {
      ...(observation.targetScreenshot == null ? {} : { target: observation.targetScreenshot }),
      ...(observation.displayScreenshot == null ? {} : { display: observation.displayScreenshot }),
    },
    ...(observation.accessibility === undefined
      ? {}
      : {
          accessibility: redactJsonValue(observation.accessibility, state, undefined, undefined, 0),
        }),
    redaction: state.report,
  };
}
