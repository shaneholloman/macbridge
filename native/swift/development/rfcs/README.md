# MacBridge RFC Process

This directory is the canonical source for MacBridge architecture and contract
decisions.

## Directory Contract

- RFC working directory: `docs/development/rfcs`
- Active RFC location: `docs/development/rfcs/` for `Draft`, `In Progress`,
  `Accepted`, `Rejected`, and `Superseded`
- Implemented RFC location: `docs/development/rfcs/implemented/`
- File naming: `rfc-<4-digit-id>-<short-kebab-title>.md`
- Template source: `docs/development/rfcs/rfc-template.md`
- Canonical index: `docs/development/rfcs/index.md`
- Workflow tool: `build/rfc.ts`
- RFC frontmatter and RFC file placement are the source of truth.
- Implemented RFCs do not keep duplicate copies in the root RFC directory.

## Required Metadata

Every RFC must start with YAML frontmatter:

```yaml
---
id: RFC-XXXX
name: <short name>
status: Draft
owners:
    - <team or person>
created: YYYY-MM-DD
updated: YYYY-MM-DD
supersedes: []
superseded_by: null
---
```

Rules:

- `id` is unique and never reused.
- `status` must be one of: `Draft`, `In Progress`, `Accepted`,
  `Implemented`, `Rejected`, `Superseded`.
- `updated` must change on every substantive RFC edit.
- `supersedes` and `superseded_by` must be kept accurate when RFC
  relationships change.

## Required Sections

Each RFC must contain these headings, in this order:

01. `## Summary`
02. `## Context`
03. `## Goals`
04. `## Non-Goals`
05. `## Proposal`
06. `## Alternatives Considered`
07. `## Security Impact`
08. `## Reliability Impact`
09. `## Compatibility Impact`
10. `## Testing and Quality Gates`
11. `## Rollout Plan`
12. `## Open Questions`

## Lifecycle

1. Draft: author creates RFC from template.
2. In Progress: implementation has begun but is not fully landed.
3. Accepted: scope and contract approved; implementation may start.
4. Implemented: implementation complete and validated.
5. Rejected: explicitly not proceeding.
6. Superseded: replaced by a newer RFC; link both directions.

An RFC may only move to `Implemented` after its implementation has been tested
end to end. When an RFC is ready to move, update its frontmatter status and run:

```bash
bun run rfc:sync
```

The sync command moves implemented RFC files under
`docs/development/rfcs/implemented/`, regenerates
`docs/development/rfcs/index.md`, and refreshes the README RFC section.

The normal repo sanity check runs `bun run rfc:check`, which fails if RFC
frontmatter, file placement, the index, or the README are out of sync.

## Implementation Linkage

- Implementation commits must reference the RFC ID.
- If implementation scope changes materially, update the RFC before continuing.
- If the chosen direction changes, create a new RFC and mark the old one
  `Superseded` or `Rejected`.

## Quality Gates

Each implementation phase tied to an RFC should run:

- `bun run check`
- targeted CLI smoke checks as needed
