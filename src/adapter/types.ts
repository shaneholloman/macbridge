import type { ControlPlane } from "../core/control.js";
import type { WindowInfo } from "../native/macbridge.js";
import type { DisplayInfo, Observation, Target } from "../protocol/types.js";

export type AppKind = "browser" | "editor" | "mail" | "terminal" | "app";

export type AppLaunchOptions = {
  files?: string[];
  args?: string[];
};

export type AppQuitOptions = {
  saving?: "yes" | "no" | "ask";
};

export type AppWindowIntent = {
  wid?: number;
  title?: RegExp;
  minWidth?: number;
  minHeight?: number;
  display?: DisplayInfo;
  predicate?: (window: WindowInfo) => boolean;
};

export type AppWaitOptions = AppWindowIntent & {
  attempts?: number;
  delayMs?: number;
};

export type AppObserveOptions = {
  launch: boolean;
  prompt: boolean;
  outDir: string;
};

export type AppObserveOutput = {
  adapter: string;
  app: string;
  bundleID?: string;
  outDir: string;
  summaryPath: string;
};

export type AppAdapter = {
  id: string;
  displayName: string;
  kind: AppKind;
  appNames: string[];
  bundleIDs: string[];
  target: Target & { kind: "app" };
  launch(options?: AppLaunchOptions): void;
  quit(options?: AppQuitOptions): void;
  windows(control: ControlPlane): WindowInfo[];
  selectWindow(windows: WindowInfo[], intent?: AppWindowIntent): WindowInfo | undefined;
  waitForWindow(control: ControlPlane, options?: AppWaitOptions): Promise<WindowInfo>;
  observe?(
    options: AppObserveOptions,
    control?: ControlPlane,
  ): Promise<AppObserveOutput | Observation>;
};

export type TerminalOpenOptions = {
  session: string;
  tmuxBin: string;
  readOnly: boolean;
};

export type TerminalAppAdapter = AppAdapter & {
  kind: "terminal";
  terminal: {
    fallbackWindowTitles: string[];
    openSession(options: TerminalOpenOptions): void;
  };
};
