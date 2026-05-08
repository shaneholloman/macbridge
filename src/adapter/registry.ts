import { ariaAdapter } from "../apps/aria.js";
import { ghosttyAdapter } from "../apps/ghostty.js";
import { heliumAdapter } from "../apps/helium.js";
import { outlookAdapter } from "../apps/outlook.js";
import { macosTerminalAdapter } from "../apps/terminal.js";
import { textEditAdapter } from "../apps/textedit.js";
import { isTerminalAppAdapter } from "./helpers.js";
import type { AppAdapter, TerminalAppAdapter } from "./types.js";

export const appAdapters: AppAdapter[] = [
  ariaAdapter,
  heliumAdapter,
  textEditAdapter,
  ghosttyAdapter,
  macosTerminalAdapter,
  outlookAdapter,
];

export function listAppAdapters(): AppAdapter[] {
  return [...appAdapters];
}

export function getAppAdapter(value: string): AppAdapter | undefined {
  const normalized = normalizeAdapterKey(value);
  return appAdapters.find((adapter) => adapterKeys(adapter).includes(normalized));
}

export function requireAppAdapter(value: string): AppAdapter {
  const adapter = getAppAdapter(value);
  if (adapter == null) {
    throw new Error(`unknown adapter: ${value}`);
  }
  return adapter;
}

export function listTerminalAppAdapters(): TerminalAppAdapter[] {
  return appAdapters.filter(isTerminalAppAdapter);
}

export function getTerminalAppAdapter(value: string): TerminalAppAdapter | undefined {
  const adapter = getAppAdapter(value);
  return adapter != null && isTerminalAppAdapter(adapter) ? adapter : undefined;
}

export function requireTerminalAppAdapter(value: string): TerminalAppAdapter {
  const adapter = getTerminalAppAdapter(value);
  if (adapter == null) {
    throw new Error(`unknown terminal adapter: ${value}`);
  }
  return adapter;
}

function adapterKeys(adapter: AppAdapter): string[] {
  return [
    adapter.id,
    adapter.displayName,
    ...adapter.appNames,
    ...adapter.bundleIDs,
    ...adapter.appNames.map((name) => name.replaceAll(/\s+/g, "")),
  ].map(normalizeAdapterKey);
}

function normalizeAdapterKey(value: string): string {
  return value.trim().toLowerCase();
}
