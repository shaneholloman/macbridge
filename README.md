# MacBridge

MacBridge is a TypeScript-friendly native macOS automation adapter.

It provides a Swift native runtime plus a TypeScript package for agent systems
that need to inspect displays, windows, permissions, screenshots, accessibility
state, typed actions, observations, and evidence artifacts.

MacBridge is public-alpha software. It already does useful native work, but the
higher-level SDK shape is still evolving before the first stable release.

## Run

```bash
npx macbridge --help
npx macbridge permissions check
npx macbridge displays list
```

MacBridge currently targets macOS on `arm64` and `x64`. The npm package carries
target-specific `MacBridge.app` bundles with the project icon and bundle
metadata; native commands prefer the app-bundled Swift executable so macOS
permission prompts have a clearer product identity. TypeScript harness commands
such as `observe`, `act`, `verify`, and `agent` use Bun.

## Install

```bash
bun add macbridge
```

Double-clicking the bundled app opens a small MacBridge permission window, while
developer workflows can keep using `npx macbridge`.

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
```

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
