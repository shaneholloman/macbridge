# MacBridge

MacBridge is a TypeScript-friendly native macOS automation adapter.

It provides a Swift native runtime plus a TypeScript package for agent systems
that need to inspect displays, windows, permissions, screenshots, accessibility
state, typed actions, observations, and evidence artifacts.

MacBridge is public-alpha software. It already does useful native work, but the
higher-level SDK shape is still evolving before the first stable release.

## Run

```bash
npx macbridge
npx macbridge --help
npx macbridge permissions check
npx macbridge displays list
```

MacBridge currently targets Apple Silicon Macs only. Running `npx macbridge`
uses the packaged signed `.pkg` installer, then opens
`/Applications/MacBridge.app` so macOS permission prompts attach to the stable
app identity.

## Install

```bash
bun add macbridge
```

Double-clicking the installed app opens the MacBridge shell and permission
surface. After installation, developer workflows can use the `macbridge`
command.

## Quick Start

```bash
npx macbridge windows list
npx macbridge capture display main --png -o screenshot.png
```

TypeScript usage:

```ts
import { createControlPlane, runJSON, type Json } from "macbridge";

const displays = runJSON<Json>(["displays", "list"]);
const mac = createControlPlane();
const permissions = mac.permissions({ require: false });
```

Source-owned TypeScript commands:

```bash
macbridge observe window <wid> --display-screenshot main --ax --out tmp/observations/window
macbridge act action.json
macbridge verify expectation.json
macbridge agent models --type text --provider openai --json
macbridge prefs init --preferred-screen left
macbridge apps list
macbridge apps observe helium --launch
macbridge terminal start --screen left --session macbridge
macbridge terminal send "echo hello" --session macbridge
```

Workspace preferences live at `~/MacBridge/preferences.toml`. App-specific
behavior lives behind `src/apps` adapters, and the terminal lane uses a selected
terminal adapter backed by tmux so MacBridge can drive a dedicated screen while
the human keeps working elsewhere.

## Documentation

- [Usage Guide](docs/usage.md)
- [CLI Reference](docs/cli.md)
- [Repository Development](docs/development/repository.md)
- [RFC Index](docs/development/rfcs/index.md)

## Architecture RFCs

Architecture and contract decisions live under `docs/development/rfcs`.

Current RFC index:

- [RFC Index](docs/development/rfcs/index.md)

Active RFCs:

- [RFC-0007: App Identity and Icon Distribution](docs/development/rfcs/rfc-0007-app-identity-and-icon-distribution.md)
- [RFC-0008: Model Agnostic Agent Loop](docs/development/rfcs/rfc-0008-model-agnostic-agent-loop.md)
- [RFC-0010: Multimodal Evidence and Session Video](docs/development/rfcs/rfc-0010-multimodal-evidence-and-session-video.md)
- [RFC-0011: Inviting CLI and Shell Experience](docs/development/rfcs/rfc-0011-inviting-cli-and-shell-experience.md)

## Package Surface

The current public TypeScript surface includes:

- native command helpers: `run`, `runJSON`
- binary path helpers: `defaultBin`, `packagedBin`, `resolveDefaultBin`
- `MacBridge` and the `ControlPlane` protocol
- typed observation, action, verification, planning, and recording helpers
- package CLI semantics for `agent`, `observe`, `act`, and `verify`
- media probing and recording helpers

## Status

MacBridge is useful today for deterministic macOS automation and local agent
experiments. The next major product work is to make the TypeScript API more
domain-shaped, with stable operations for displays, windows, capture,
observation, permissions, and actions.

## License

MIT
