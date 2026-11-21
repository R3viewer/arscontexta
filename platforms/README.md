# platforms/ -- Distribution View

This directory maps the distribution layout for the OpenChamber / OpenCode agent platform. It does not contain the generation logic itself -- that lives in `generators/`. What `platforms/` provides is a reference view of what the platform produces and how the shared components relate to platform-specific ones.

## Relationship to generators/

The `generators/` directory is the working structure:

- `generators/agents-md.md` -- AGENTS.md generation template
- `generators/features/` -- 17 composable feature blocks

`platforms/` organizes these same components from a distribution perspective: what does an OpenChamber user get? What is shared across platforms?

## Structure

```
platforms/
├── shared/
│   ├── features/     --> generators/features/ (17 canonical feature blocks)
│   └── templates/    --> reference/templates/ (10 note type templates)
├── openchamber/
│   └── generator.md  --> generators/agents-md.md (AGENTS.md generation & OpenCode wiring)
└── README.md         This file
```

## How platforms/ is used

During extension packaging, OpenChamber loads the bundled OpenCode V2 plugin (`plugin/`), plugin skills (`skills/`), and references (`reference/`, `methodology/`, `generators/`).

The `generators/` directory remains the canonical source. Files here document platform-specific output context.

## What the platform produces

| Output | OpenChamber / OpenCode |
|--------|------------------------|
| Context file | `AGENTS.md` |
| Marker & config | `.arscontexta` |
| Project config | `opencode.jsonc` |
| Skills & commands | `.opencode/skills/` and `.opencode/commands/` |
| Hooks | Provided natively by bundled OpenCode V2 plugin |
| Identity & goals | `self/identity.md`, `self/goals.md`, `self/methodology.md` |
