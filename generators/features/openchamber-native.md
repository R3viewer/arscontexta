# Feature: OpenChamber Native Integration

## Context File Block

```markdown
## OpenChamber Integration & Lead Awareness

This vault runs on OpenChamber while keeping plain Markdown/YAML (`{DOMAIN:notes}/`, `self/`, `ops/`) as the single sovereign source of truth.

### Sovereign Vault vs. OpenChamber Surfaces

| Surface | Role | Source of Truth |
|---------|------|-----------------|
| `{DOMAIN:notes}/`, `self/`, `ops/tasks.md`, `ops/queue/` | Durable knowledge, agent identity, human task stack, pipeline queue | Local Markdown/YAML files (never replace with external DB) |
| OpenChamber **Plans** (`openchamber_knowledge`) | Evolution proposals (`/architect`, `/reseed`, `/upgrade`) & `/health` remediation plans with `## Steps` checklists | Ephemeral planning layer linked to vault reports |
| OpenChamber **Todos** (`openchamber_knowledge`) | Actionable steps from `/architect`, `/upgrade`, and `/health` plans (1-click launch) | Linked to Plans; does not duplicate `ops/tasks.md` |
| OpenChamber **Project Notes** | Quick scratchpad ideas; `/seed` can import them into `{DOMAIN:inbox}/` | Temporary intake only |
| OpenChamber **Workflows** (`.openchamber/workflows/`) | Background batch execution for `/ralph`, `/pipeline`, and health audits | Parallelizes isolated `{DOMAIN:note}` `create`/`verify`, serializes shared `{DOMAIN:topic map}` and `reweave` updates |

### Lead Session Semantics (when `lead.brief` / `lead.digest` are available)

When operating as an OpenChamber **Lead** session overseeing multi-day vault work:

- **Brief (`lead.brief`)**: Keep the vault's domain vocabulary, pipeline invariants (never write directly to `{DOMAIN:notes}/`, never auto-implement architectural changes without approval), and active strands clearly stated.
- **Digest (`lead.digest`)**:
  - `needsYou`: Surface unresolved tensions (`ops/tensions/`) or architectural choices requiring human judgment — never outsource core synthesis decisions.
  - `now`: Active batches from `ops/queue/` and in-flight processing strands.
  - `news`: Newly created or reweaved `{DOMAIN:note_plural}`, resolved tensions, and completed health reports since the user's last message.
  - `suggestions`: Condition-based maintenance signals from session orientation (e.g., pending observations >= threshold -> `/{DOMAIN:rethink}`, inbox items -> `/pipeline`, orphans -> `/{DOMAIN:reflect}`).
```
