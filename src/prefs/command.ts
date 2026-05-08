import type { ControlPlane } from "../core/control.js";
import {
  createPreferences,
  formatPreferences,
  preferencesExist,
  preferencesPath,
  readPreferences,
  resolveWorkspaceScreen,
  writePreferences,
} from "./preferences.js";

type IO = {
  stdout: Pick<typeof process.stdout, "write">;
  stderr: Pick<typeof process.stderr, "write">;
};

export function prefsUsage(): string {
  return [
    "usage:",
    "  macbridge prefs path",
    "  macbridge prefs init [--preferred-screen <name>] [--force]",
    "  macbridge prefs show",
    "  macbridge prefs set preferred-screen <name>",
  ].join("\n");
}

export function runPrefsCommand(args: string[], control: ControlPlane, io: IO): number {
  const command = args[0];
  switch (command) {
    case undefined:
    case "-h":
    case "--help":
      io.stdout.write(`${prefsUsage()}\n`);
      return 0;
    case "path":
      io.stdout.write(`${preferencesPath()}\n`);
      return 0;
    case "init":
      return runInit(args.slice(1), control, io);
    case "show":
      return runShow(args.slice(1), control, io);
    case "set":
      return runSet(args.slice(1), io);
    default:
      io.stderr.write(`unknown prefs command: ${command}\n${prefsUsage()}\n`);
      return 1;
  }
}

function runInit(args: string[], control: ControlPlane, io: IO): number {
  let preferredScreen: string | undefined;
  let force = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--preferred-screen": {
        const value = args[index + 1];
        if (value == null) {
          io.stderr.write("--preferred-screen needs a value\n");
          return 1;
        }
        preferredScreen = value;
        index += 1;
        break;
      }
      case "--force":
        force = true;
        break;
      default:
        io.stderr.write(`unknown prefs init option: ${arg}\n${prefsUsage()}\n`);
        return 1;
    }
  }

  const path = preferencesPath();
  if (preferencesExist(path) && !force) {
    io.stderr.write(`${path} already exists; use --force to replace it\n`);
    return 1;
  }

  const preferences = createPreferences(control.displays(), {
    ...(preferredScreen == null ? {} : { preferredScreen }),
    cwd: process.cwd(),
  });
  writePreferences(preferences, path);
  io.stdout.write(`${path}\n`);
  return 0;
}

function runShow(args: string[], control: ControlPlane, io: IO): number {
  if (args.length > 0) {
    io.stderr.write(`unexpected prefs show argument: ${args[0]}\n${prefsUsage()}\n`);
    return 1;
  }
  const preferences = readPreferences();
  const resolved = resolveWorkspaceScreen(preferences, control.displays());
  io.stdout.write(
    `${JSON.stringify(
      {
        path: preferencesPath(),
        preferences,
        workspace: {
          preferredScreen: resolved.name,
          displayID: resolved.display.displayID,
          name: resolved.display.name,
          bounds: {
            x: resolved.display.x,
            y: resolved.display.y,
            width: resolved.display.width,
            height: resolved.display.height,
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  return 0;
}

function runSet(args: string[], io: IO): number {
  const field = args[0];
  const value = args[1];
  if (field !== "preferred-screen" || value == null || args.length > 2) {
    io.stderr.write(`${prefsUsage()}\n`);
    return 1;
  }

  const preferences = readPreferences();
  if (preferences.screens[value] == null) {
    io.stderr.write(`workspace screen "${value}" is not defined in ${preferencesPath()}\n`);
    return 1;
  }

  preferences.workspace.preferredScreen = value;
  writePreferences(preferences);
  io.stdout.write(formatPreferences(preferences));
  return 0;
}
