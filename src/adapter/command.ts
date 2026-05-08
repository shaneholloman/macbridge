import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ControlPlane } from "../core/control.js";
import { observeApp } from "./helpers.js";
import { listAppAdapters, requireAppAdapter } from "./registry.js";
import type { AppObserveOptions } from "./types.js";

type IO = {
  stdout: Pick<typeof process.stdout, "write">;
  stderr: Pick<typeof process.stderr, "write">;
};

type ParsedObserve = AppObserveOptions & {
  adapter: string;
};

export function appsUsage(): string {
  return [
    "usage:",
    "  macbridge apps list",
    "  macbridge apps observe <adapter> [--launch] [--prompt] [--out DIR]",
    "",
    "known adapters:",
    ...listAppAdapters().map(
      (adapter) =>
        `  ${adapter.id.padEnd(8)} ${adapter.displayName} (${adapter.kind}) ${adapter.bundleIDs.join(", ")}`,
    ),
  ].join("\n");
}

export async function runAppsCommand(
  args: string[],
  createControl: () => ControlPlane,
  io: IO,
): Promise<number> {
  const command = args[0];
  switch (command) {
    case undefined:
    case "-h":
    case "--help":
    case "help":
      io.stdout.write(`${appsUsage()}\n`);
      return 0;
    case "list":
      io.stdout.write(`${JSON.stringify(listAdaptersOutput(), null, 2)}\n`);
      return 0;
    case "observe": {
      if (args[1] == null) {
        io.stderr.write(`${appsObserveUsage()}\n`);
        return 1;
      }
      if (
        args[1] === "-h" ||
        args[1] === "--help" ||
        args.slice(2).includes("-h") ||
        args.slice(2).includes("--help")
      ) {
        io.stdout.write(`${appsObserveUsage()}\n`);
        return 0;
      }
      const options = parseAppsObserveArgs(args.slice(1));
      const adapter = requireAppAdapter(options.adapter);
      mkdirSync(options.outDir, { recursive: true });
      const control = createControl();
      const output =
        adapter.observe == null
          ? await observeApp(adapter, options, control)
          : await adapter.observe(options, control);
      io.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      return 0;
    }
    default:
      io.stderr.write(`unknown apps command: ${command}\n${appsUsage()}\n`);
      return 1;
  }
}

function parseAppsObserveArgs(args: string[]): ParsedObserve {
  const adapter = args[0];
  if (adapter == null || adapter === "-h" || adapter === "--help") {
    throw new Error(appsObserveUsage());
  }
  const options: ParsedObserve = {
    adapter,
    launch: false,
    prompt: false,
    outDir: join("tmp", "observations", `${adapter}-${stamp()}`),
  };
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--launch":
        options.launch = true;
        break;
      case "--prompt":
        options.prompt = true;
        break;
      case "--out": {
        const value = args[index + 1];
        if (value == null) throw new Error("--out needs a directory");
        options.outDir = value;
        index += 1;
        break;
      }
      case "-h":
      case "--help":
        throw new Error(appsObserveUsage());
      default:
        throw new Error(`unknown apps observe option: ${arg}\n${appsObserveUsage()}`);
    }
  }
  return options;
}

function appsObserveUsage(): string {
  return ["usage:", "  macbridge apps observe <adapter> [--launch] [--prompt] [--out DIR]"].join(
    "\n",
  );
}

function listAdaptersOutput() {
  return listAppAdapters().map((adapter) => ({
    id: adapter.id,
    displayName: adapter.displayName,
    kind: adapter.kind,
    appNames: adapter.appNames,
    bundleIDs: adapter.bundleIDs,
  }));
}

function stamp(): string {
  return new Date().toISOString().replaceAll(/[-:.]/g, "").replace("T", "T").replace("Z", "Z");
}
