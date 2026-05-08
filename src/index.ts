export { appsUsage, runAppsCommand } from "./adapter/command.js";
export {
  appTarget,
  isTerminalAppAdapter,
  observeApp,
  openApplication,
  quitApplication,
  selectAppWindow,
  waitForAdapterWindow,
  windowsForAdapter,
} from "./adapter/helpers.js";
export {
  appAdapters,
  getAppAdapter,
  getTerminalAppAdapter,
  listAppAdapters,
  listTerminalAppAdapters,
  requireAppAdapter,
  requireTerminalAppAdapter,
} from "./adapter/registry.js";
export type {
  AppAdapter,
  AppKind,
  AppLaunchOptions,
  AppObserveOptions,
  AppObserveOutput,
  AppQuitOptions,
  AppWaitOptions,
  AppWindowIntent,
  TerminalAppAdapter,
  TerminalOpenOptions,
} from "./adapter/types.js";
export type {
  AgentRunOptions,
  ModelsOptions,
  PlanOptions,
  RecordingOptions,
} from "./agent/command.js";
export {
  agentCommandUsage,
  formatModels,
  modelsCommand,
  parseModelsArgs,
  parsePlanArgs,
  parseRunArgs,
  planCommand,
  runPlanCommand,
} from "./agent/command.js";
export type { ModelInfo, ModelKind, ModelQuery, ModelRef } from "./agent/model.js";
export { configuredModels, parseModelID } from "./agent/model.js";
export type { PlannerAdapter, ShellPlannerOptions } from "./agent/planner.js";
export { adapterPlanner, parsePlannerOutput, shellPlanner } from "./agent/planner.js";
export type { RunInput, SessionOptions } from "./agent/session.js";
export {
  defaultActionPolicy,
  fixturePlanner,
  Session,
  validateAction,
} from "./agent/session.js";
export { ghosttyAdapter } from "./apps/ghostty.js";
export { heliumAdapter } from "./apps/helium.js";
export { observeOutlook, outlookAdapter } from "./apps/outlook.js";
export { macosTerminalAdapter } from "./apps/terminal.js";
export { textEditAdapter } from "./apps/textedit.js";
export type {
  ActCommandOptions,
  ObserveCommandOptions,
  ObserveCommandOutput,
  ParsedCommand,
  VerifyCommandOptions,
} from "./cli/command.js";
export {
  actCommandUsage,
  CommandUsageError,
  observeCommandUsage,
  parseActCommand,
  parseObserveCommand,
  parseVerifyCommand,
  readActionFile,
  readExpectationFile,
  runActCommand,
  runObserveCommand,
  runVerifyCommand,
  verifyCommandUsage,
} from "./cli/command.js";
export { isTypeScriptCommand, runCLI } from "./cli/main.js";
export { createControlPlane, MacBridge } from "./core/client.js";
export type { ControlPlane } from "./core/control.js";
export type {
  MediaCapabilities,
  MediaCodecSupport,
  MediaEncoder,
  MediaEncodingCapabilities,
  MediaProbe,
  MediaProbeTrack,
} from "./media/caps.js";
export {
  mediaCapabilities,
  mediaEncodingCapabilities,
  mediaProbeJSON,
  probeMedia,
} from "./media/caps.js";
export type { FrameRecorderOptions, Recorder, RecordingControl } from "./media/recording.js";
export { encodeRecording, FrameRecorder } from "./media/recording.js";
export type { Json, RunOptions, RunResult, WindowInfo } from "./native/macbridge.js";
export {
  defaultBin,
  ensureExecutable,
  envNumber,
  envString,
  packagedBin,
  resolveDefaultBin,
  run,
  runJSON,
  sleep,
} from "./native/macbridge.js";
export { createObservationSummary, redactText } from "./observe/summary.js";
export type { VerificationContext } from "./observe/verify.js";
export { verifyExpectation } from "./observe/verify.js";
export { prefsUsage, runPrefsCommand } from "./prefs/command.js";
export type { Preferences, ResolvedScreen, ScreenPreference } from "./prefs/preferences.js";
export {
  createPreferences,
  formatPreferences,
  inferScreenPreferences,
  loadPreferences,
  parsePreferences,
  preferencesDir,
  preferencesExist,
  preferencesPath,
  readPreferences,
  resolveWorkspaceScreen,
  writePreferences,
} from "./prefs/preferences.js";
export {
  ActionSchema,
  CoordSchema,
  ExpectationSchema,
  ObserveInputSchema,
  PlannedActionSchema,
  PointSchema,
  parseAction,
  parseExpectation,
  parseObserveInput,
  parsePlan,
  RectSchema,
  RedactionOptionsSchema,
  TargetSchema,
} from "./protocol/schema.js";
export type {
  Action,
  ActionPolicy,
  ActionResult,
  Artifact,
  CoordMode,
  DisplayInfo,
  DisplaySelector,
  Expectation,
  MacBridgeOptions,
  Observation,
  ObservationSummary,
  ObserveInput,
  PermissionReport,
  PlannedAction,
  Planner,
  PlannerInput,
  Point,
  Recording,
  RecordingFrame,
  Rect,
  RedactedText,
  RedactionOptions,
  RedactionReport,
  RunRecord,
  Target,
  Verification,
} from "./protocol/types.js";
export { runTerminalCommand, terminalUsage } from "./terminal/command.js";
export type {
  TerminalCaptureOptions,
  TerminalLane,
  TerminalSendOptions,
  TerminalStartOptions,
} from "./terminal/lane.js";
export {
  captureLane,
  resolveLane,
  sendLane,
  startLane,
  stopLane,
} from "./terminal/lane.js";
export { runWorkspaceCommand, workspaceUsage } from "./workspace/command.js";
export type { WorkspaceSelection } from "./workspace/workspace.js";
export {
  focusOffset,
  maximizeTarget,
  workspaceSelection,
} from "./workspace/workspace.js";
