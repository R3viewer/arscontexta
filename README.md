# Ars Contexta

**A second brain for your agent.**

An OpenChamber extension (with a bundled OpenCode V2 plugin) that generates
complete knowledge systems from conversation. You describe how you think and
work. The engine derives a cognitive architecture -- folder structure,
`AGENTS.md` context file, processing pipeline, lifecycle hooks, navigation maps,
and note templates -- tailored to your domain and backed by 249 research claims.

No templates. No configuration. Just conversation.

**v0.8.0** · OpenChamber Extension & OpenCode V2 Plugin · MIT

---

## Installation locale

### 1. Installation dans OpenChamber (Recommandé)

Ars Contexta est packagé comme une extension OpenChamber complète qui embarque nativement son plugin serveur OpenCode V2 et ses 10 compétences de dérivation.

#### Étape 1 : Cloner le dépôt en local
```bash
git clone -b OpenChamber https://github.com/agenticnotetaking/arscontexta.git
cd arscontexta
```

#### Étape 2 : Ajouter l'extension locale dans OpenChamber
1. Ouvrez OpenChamber (Desktop ou Web).
2. Allez dans **Settings → Extensions**.
3. Dans le champ **Folder, ZIP, or URL**, collez le **chemin absolu** vers votre dossier `arscontexta` (ou utilisez le bouton dossier pour le sélectionner) :
   - *Exemple Windows* : `C:\Users\votre-nom\chemin\vers\arscontexta`
   - *Exemple macOS / Linux* : `/home/votre-nom/projets/arscontexta`
4. Cliquez sur **Add**.

#### Étape 3 : Approuver les permissions
La boîte de dialogue liste les permissions déclarées par l'extension :
- **Add a plugin to OpenCode** : autorise OpenChamber à enregistrer le plugin `plugin/` dans son instance OpenCode gérée.
- **Add to what agents read / skills** : expose les 10 compétences plugin `skills/` à tous les agents.
- **Read and write project files** (`files`) & **Send prompts to sessions** (`prompt`) : permettent au panneau latéral, à la section *Vault Status* et aux actions rapides d’inspecter le vault, capturer dans `{inbox}/` sans consommer de tokens et pré-remplir/lancer des commandes.
- Cliquez sur **Allow and enable**.

> **Note (Instance OpenCode externe)** : Si votre OpenChamber se connecte à un serveur OpenCode démarré séparément (ou si votre variable `OPENCODE_CONFIG` est définie), OpenChamber affiche un bouton **Add to global config** sur la carte de l'extension. Cliquez dessus pour que votre serveur OpenCode externe charge également le plugin.

#### Étape 4 : Initialiser votre vault
1. Ouvrez ou créez le dossier de votre vault comme projet dans OpenChamber.
2. Dans le chat, tapez la commande d'onboarding :
   ```
   /arscontexta:setup
   ```
   *(Ou invoquez directement la compétence via le sélecteur `$` : `$setup`)*
3. Répondez aux 2–4 questions sur votre domaine d'activité (~20 minutes, token-intensif mais à faire une seule fois).
4. Le moteur génère votre système complet (`AGENTS.md`, dossiers, templates, `.opencode/skills/`, `.opencode/commands/`, `.opencode/agents/`, `opencode.jsonc`, `.arscontexta`).
5. OpenCode charge immédiatement les fichiers générés à chaud (**aucun redémarrage requis**).
6. Tapez `/arscontexta:help` pour explorer toutes les commandes disponibles.

---

### 2. Installation locale dans OpenCode standalone (CLI / TUI)

Si vous utilisez OpenCode V2 directement dans un terminal sans OpenChamber, vous pouvez charger le plugin et les compétences locales de deux manières :

#### Option A : Configuration globale (`~/.config/opencode/opencode.jsonc`)
Pour que le plugin soit actif dans tous vos projets :

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "/chemin/absolu/vers/arscontexta/plugin"
  ],
  "skills": [
    "/chemin/absolu/vers/arscontexta/skills"
  ]
}
```

#### Option B : Configuration par projet (`opencode.jsonc` dans votre vault)
Pour activer le plugin uniquement sur un vault spécifique :

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "/chemin/absolu/vers/arscontexta/plugin"
  ],
  "skills": [
    "/chemin/absolu/vers/arscontexta/skills"
  ]
}
```

Après enregistrement, OpenCode V2 surveille ses fichiers de configuration et charge automatiquement le plugin et les compétences sans redémarrer le service (utilisez `/reload` si vous souhaitez forcer un rafraîchissement immédiat).

---

### Développement & Rechargement en direct

L'installation par dossier local s'exécute directement depuis votre répertoire de travail :
- **Modifications dans `plugin/` et `skills/`** : rechargées en direct dans l'OpenCode géré par OpenChamber. Vous pouvez aussi forcer un rechargement en tapant `/reload` dans le chat ou en basculant l'interrupteur **Enabled** de l'extension dans **Settings → Extensions**.
- **Désinstallation** : cliquez sur **Remove** sur la carte de l'extension dans **Settings → Extensions**. Cela supprime uniquement l'enregistrement dans OpenChamber sans toucher à votre dossier local.

---

## What It Does

Most AI tools start every session blank. Ars Contexta changes that by generating
a persistent thinking system derived from how you actually work.

**What you get:**

- **A vault** -- plain markdown files connected by wiki links, forming a
  traversable knowledge graph. No database, no cloud, no lock-in.
- **A processing pipeline** -- OpenCode skills and slash commands that extract
  insights, find connections, update old notes with new context, and verify
  quality.
- **Cross-platform automation** -- native OpenCode V2 server plugin hooks
  (macOS, Linux, Windows) that orient every session, validate schemas on every
  write/edit, capture session state, and auto-commit.
- **Navigation** -- Maps of Content (MOCs) at hub, domain, and topic levels.
- **Templates** -- note templates with `_schema` blocks as single source of
  truth.
- **A user manual** -- 7 pages of domain-native documentation generated
  alongside.
- **OpenChamber integration** -- Work Status (`Vault Status`) section, 3-tab mobile-ready vault rail panel (`Pulse`, `Maps & Notes`, `Inbox`), quick context actions (save selection/message to inbox, stage `/pipeline`), kernel validator chat card, Project Knowledge Plans & Todos, interactive `openchamber_render` forms & SVG graph map, background Workflows, and Lead-aware session digests.

**The key differentiator:** derivation, not templating. Every choice traces to
specific research claims. The engine reasons from principles about what your
domain needs and why.

---

## The Setup Flow

`/arscontexta:setup` runs a 6-phase process:

| Phase | What Happens |
|-------|-------------|
| **Detection** | Detects OpenChamber / OpenCode V2 environment, existing vault state, and available tools |
| **Understanding** | 2-4 conversation turns (using OpenChamber interactive UI forms) where you describe your domain |
| **Derivation** | Maps signals to eight configuration dimensions with confidence scoring |
| **Proposal** | Shows what will be generated and why, in your vocabulary |
| **Generation** | Produces all files: `AGENTS.md`, folders, templates, `.opencode/skills/`, `.opencode/commands/`, `.opencode/agents/`, `opencode.jsonc`, `.arscontexta`, manual |
| **Validation** | Checks all 15 kernel primitives and runs a pipeline smoke test |

The whole process takes about 20 minutes. It's token-intensive because the
engine reads research claims, reasons about your domain, and generates
substantial output. This is a one-time investment -- after setup, your agent
remembers.

For advanced users: `/arscontexta:setup --advanced` to configure dimensions
directly.

---

## Three-Space Architecture

Every generated system separates content into three spaces:

| Space | Purpose | Growth |
|-------|---------|--------|
| **self/** | Agent persistent mind -- identity, methodology, goals | Slow (tens of files) |
| **notes/** | Knowledge graph -- the reason the system exists | Steady (10-50/week) |
| **ops/** | Operational coordination -- queue state, sessions | Fluctuating |

Names adapt to your domain (`notes/` might become `reflections/`, `claims/`, or
`decisions/`), but the separation is invariant.

---

## Commands & Skills

In OpenChamber, `/` invokes **OpenCode commands** and `$` invokes **OpenCode
skills**. Ars Contexta registers both so you can trigger workflows with slash
commands or let agents load skills on demand via the `skill` tool.

### Plugin-Level (always available while extension is enabled)

Registered automatically by the bundled OpenCode V2 plugin (`ctx.command.transform`)
and exposed as skills via `contributes.skills`:

| Command | What It Does |
|---------|-------------|
| `/arscontexta:setup` | Conversational onboarding -- generates your full system |
| `/arscontexta:help` | Contextual guidance and command discovery |
| `/arscontexta:tutorial` | Interactive walkthrough (learn by doing) |
| `/arscontexta:ask` | Query the research graph for methodology answers |
| `/arscontexta:health` | Run diagnostic checks on your vault |
| `/arscontexta:recommend` | Get architecture advice for your use case |
| `/arscontexta:architect` | Research-backed evolution guidance |
| `/arscontexta:add-domain` | Add a new knowledge domain to an existing system |
| `/arscontexta:reseed` | Re-derive from first principles when drift accumulates |
| `/arscontexta:upgrade` | Apply plugin knowledge base updates to your system |

### Generated (available after setup)

Generated into your vault under `.opencode/skills/` and `.opencode/commands/`
with your domain vocabulary applied:

| Command | What It Does |
|---------|-------------|
| `/reduce` | Extract insights from sources |
| `/reflect` | Find connections, update MOCs |
| `/reweave` | Update older notes with new connections |
| `/verify` | Combined quality check: description + schema + health |
| `/validate` | Schema compliance checking |
| `/seed` | Create extraction task with duplicate detection |
| `/ralph` | Queue-based orchestration with fresh context per phase |
| `/pipeline` | End-to-end source processing |
| `/tasks` | Queue management |
| `/stats` | Vault metrics |
| `/graph` | Graph analysis |
| `/next` | Next-action recommendation |
| `/learn` | Research and grow |
| `/remember` | Mine session learnings |
| `/rethink` | Challenge system assumptions |
| `/refactor` | Structural improvements |

---

## Processing Pipeline

The vault implements the **6 Rs**, extending Cornell Note-Taking's 5 Rs with a
meta-cognitive layer:

| Phase | What Happens | Command |
|-------|-------------|---------|
| **Record** | Zero-friction capture into `inbox/` | Manual |
| **Reduce** | Extract insights with domain-native categories | `/reduce` |
| **Reflect** | Find connections, update MOCs | `/reflect` |
| **Reweave** | Update older notes with new context | `/reweave` |
| **Verify** | Description + schema + health checks | `/verify` |
| **Rethink** | Challenge system assumptions | `/rethink` |

### Fresh Context Per Phase

Each phase runs in its own context window via OpenCode's native `subagent` tool
(using `mode: subagent` worker agents such as `knowledge-worker` or `general`,
or `subagent: true` commands) and OpenChamber's isolated child sessions
(`ownWork: true`). LLM attention degrades as context fills -- by spawning a
fresh subagent per phase, every phase operates in the "smart zone."

```
/ralph 5
  |-- Read queue, find next unblocked task
  |-- Spawn OpenCode subagent (fresh context window)
  |   +-- Loads skill, updates task file, returns structured handoff
  |-- Parse handoff, capture learnings
  |-- Advance phase in queue
  +-- Repeat for 5 tasks
```

---

## Plugin Hooks & Automation

Four hooks run inside the bundled **OpenCode V2 server plugin** (`plugin/`),
gated by the `.arscontexta` marker file so non-vault projects are never touched.
Because hooks are native JavaScript/TypeScript rather than Unix shell scripts,
they work identically on **Windows, macOS, and Linux** without requiring `bash`,
`tree`, or `jq`.

| Hook | OpenCode V2 Mechanism | What It Does |
|------|-----------------------|-------------|
| **Session Orient** | `ctx.session.hook("context")` / `ctx.session.instructions.entry.put` | Injects workspace tree (native FS), loads `self/` identity & goals, restores previous session state, and surfaces condition-based maintenance signals |
| **Write Validate** | `ctx.tool.hook("execute.after")` (`write`, `edit`, `patch`) | Deterministic YAML frontmatter & schema validation (`description`, `topics`) on every note write or edit |
| **Auto Commit** | `ctx.tool.hook("execute.after")` (async, non-blocking) | Git auto-commit when `git: true` is set in `.arscontexta` |
| **Session Capture** | `ctx.event.subscribe` (session lifecycle / idle) | Persists session state to `ops/sessions/` and commits session artifacts |

In addition, the OpenCode plugin resolves its own package directory at runtime
and exposes `methodology/`, `reference/`, `generators/`, `skill-sources/`, and
`presets/` as OpenCode **References** (`ctx.reference.transform`), removing any
reliance on Claude Code's `${CLAUDE_PLUGIN_ROOT}` environment variable.

---

## The Research Graph

The `methodology/` directory contains **249 interconnected research claims**
about tools for thought, knowledge management, and agent-native cognitive
architecture. These claims back every configuration decision.

### Synthesizes

Zettelkasten -- Cornell Note-Taking -- Evergreen Notes -- PARA -- GTD -- Memory
Palaces -- Cognitive Science (extended mind, spreading activation, generation
effect) -- Network Theory (small-world topology, betweenness centrality) --
Agent Architecture (context windows, session boundaries, multi-agent patterns)

### How Claims Back Decisions

Every kernel primitive includes `cognitive_grounding` linking to specific
research:

- **MOC hierarchy** -- context-switching cost research (Leroy 2009)
- **Description field** -- progressive disclosure principles
- **Wiki links** -- spreading activation theory

Query directly: `/arscontexta:ask "Why does my system use atomic notes?"`

---

## Semantic Search (optional)

[qmd](https://github.com/tobi/qmd) adds concept matching across vocabularies.
Not required -- the system works fully with OpenCode's built-in `grep`
(ripgrep) + MOC traversal.

`/arscontexta:setup` configures this automatically when semantic search is
active. The commands below are manual fallback / verification steps.

```bash
# Install qmd
npm install -g @tobilu/qmd
# or
bun install -g @tobilu/qmd

cd your-vault/
qmd init
qmd collection add . --name <notes_directory_name> --mask "<notes_directory_name>/**/*.md"
qmd embed
```

Create or merge `opencode.jsonc` in the vault root:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "qmd": {
        "type": "local",
        "command": ["qmd", "mcp"]
      }
    }
  },
  "permissions": [
    { "action": "qmd_*", "resource": "*", "effect": "allow" }
  ]
}
```

OpenCode connects local MCP servers automatically (available as `tools.qmd.*`
in Code Mode or `qmd_*` directly). Check status anytime with `/mcps` or
`opencode mcp list`.

---

## Prerequisites

| Dependency | Required | Purpose |
|-----------|----------|---------|
| [OpenChamber](https://openchamber.dev) (with [OpenCode V2](https://opencode.ai)) | Yes | Extension host & agent runtime |
| `git` | Recommended | Vault version control & auto-commit hook |
| `ripgrep` (`rg`) | Optional | CLI graph analysis scripts (OpenCode has built-in `grep`) |
| [qmd](https://github.com/tobi/qmd) | Optional | Semantic search MCP server |

No `bash`, `jq`, or `tree` binaries are required -- all hook logic runs natively
in JavaScript inside OpenCode V2 across Windows, macOS, and Linux.

---

## Project Structure

Target layout for the OpenChamber extension and bundled OpenCode V2 plugin:

```
arscontexta/
|-- package.json                 # OpenChamber extension manifest ("openchamber" block, apiVersion: 1)
|-- plugin/                      # Bundled OpenCode V2 server plugin (contributes.opencodePlugin)
|   |-- index.js                 # Plugin entrypoint: { id, setup(ctx) }
|   |-- hooks/                   # Native cross-platform hooks (orient, validate, auto-commit, capture)
|   |-- commands/                # Plugin-level /arscontexta:* command registrations
|   |-- agents/                  # knowledge-guide & knowledge-worker agent registrations
|   +-- vault.js                 # .arscontexta vault detection & config reader
|-- panel/                       # OpenChamber UI surfaces (Work Status section, rail panel, background actions)
|   |-- index.html               # 3-tab rail & mobile panel (Pulse, Maps & Notes, Inbox)
|   |-- status.html              # Work Status section (Vault Status)
|   |-- background.html          # Background action handler (selection / file / message)
|   +-- *.js                     # Pre-bundled IIFE scripts via @openchamber/sdk & @openchamber/sdk/ui
|-- skills/                      # 10 plugin-level skills (contributes.skills)
|   |-- setup/                   # Conversational onboarding
|   |-- help/                    # Contextual guidance
|   |-- tutorial/                # Interactive walkthrough
|   |-- ask/                     # Query the research graph
|   |-- health/                  # Diagnostic checks
|   |-- recommend/               # Architecture advice
|   |-- architect/               # Evolution guidance
|   |-- reseed/                  # Re-derive from first principles
|   |-- upgrade/                 # Apply knowledge base updates
|   +-- add-domain/              # Multi-domain extension
|-- skill-sources/               # 16 generated vault skill & command templates
|   |-- reduce/                  # Extract insights
|   |-- reflect/                 # Find connections
|   |-- reweave/                 # Backward pass
|   |-- verify/                  # Combined quality check
|   +-- ...                      # 12 more processing commands
|-- agents/
|   +-- knowledge-guide.md       # Proactive methodology subagent (OpenCode V2 format)
|-- generators/
|   |-- agents-md.md             # AGENTS.md context file template
|   |-- features/                # 18 composable feature blocks (incl. openchamber-native.md)
|   +-- workflows/               # OpenChamber saved workflow templates (process-queue.js, vault-health-audit.js)
|-- methodology/                 # 249 research claims
|-- reference/                   # Core reference documents
|   |-- kernel.yaml              # 15 kernel primitives
|   |-- three-spaces.md          # Architecture spec
|   |-- use-case-presets.md      # Pre-validated configs
|   +-- validate-kernel.mjs      # Cross-platform kernel validator
|-- platforms/                   # Platform-specific adapters
|   |-- openchamber/             # OpenChamber + OpenCode V2 generation specs & templates
|   +-- shared/                  # Shared templates & skill blocks
|-- presets/                     # Pre-validated configurations
|-- scripts/                     # Utility & build scripts
+-- README.md
```

---

## Développement & Contribution

Pour développer ou contribuer sur Ars Contexta, installez le dépôt localement via la procédure [Installation dans OpenChamber](#1-installation-dans-openchamber-recommandé).

Les modifications apportées aux compétences (`skills/`) ou au plugin serveur (`plugin/`) sont prises en compte en direct dans OpenChamber.

### Compilation et vérification de l'extension UI

Si vous modifiez les composants graphiques dans `panel/` via `@openchamber/sdk` et `@openchamber/sdk/ui`, recompilez les bundles autonomes IIFE et vérifiez le manifeste avant de commiter :
```bash
npm install
npm run build:panel
npm run check:guest
```

### Exécution des tests automatisés

Ars Contexta inclut une suite de tests automatisée en Node.js ESM natif (`node --test`) garantissant la conformité du kernel, la validité du manifeste OpenChamber, la syntaxe des workflows, l'intégrité des compétences et l'absence totale de fuites de syntaxe legacy :

```bash
# Lancer tous les tests unitaires et gates d'intégrité
npm test

# Lancer la validation des 15 primitives du kernel sur un vault cible
node reference/validate-kernel.mjs /chemin/vers/votre/vault
```

### Fichiers clés pour les contributeurs

- `package.json` -- Manifest de l'extension OpenChamber (`apiVersion: 1`, `contributes`)
- `plugin/index.js` -- Point d'entrée du plugin serveur OpenCode V2
- `plugin/vault.mjs` -- Détection du vault, marker `.arscontexta` et résolution du vocabulaire
- `plugin/hooks/` -- Les 4 hooks natifs (`session-orient`, `write-validate`, `auto-commit`, `session-capture`)
- `reference/kernel.yaml` -- Les 15 primitives universelles indispensables à tout système
- `reference/validate-kernel.mjs` -- Validateur cross-platform du kernel
- `generators/agents-md.md` & `generators/features/*.md` -- Gabarit `AGENTS.md` et les 17 blocs modulaires
- `skill-sources/*/SKILL.md` -- Les 16 gabarits de compétences et commandes générées dans le vault
- `skills/setup/SKILL.md` -- Le moteur de dérivation conversationnel
- `reference/use-case-presets.md` -- Définition des préréglages (Research, Personal, Professional, Experimental)

---

## Presets

Four pre-validated configurations for common use cases:

| Preset | For | What You Get |
|--------|-----|-------------|
| **Research** | Academic work, literature reviews, synthesis | Atomic claims, citation tracking, methodology MOCs |
| **Personal** | Life management, journaling, relationships | Reflective notes, goal tracking, relationship MOCs |
| **Professional** | Consulting, leadership, multi-client work, deliverables | Insights, role-tagged engagement/responsibility maps, expertise, network, `deliverables/` workspace |
| **Experimental** | Testing, iteration, rapid prototyping | Lightweight structure, fast capture, minimal ceremony |

Presets provide starting defaults. The derivation engine adapts from there based
on your conversation.

---

## Migration Roadmap (Claude Code → OpenChamber)

| Milestone | Scope | Recommended Model | Status |
|-----------|-------|-------------------|--------|
| **0. Validation Foundation** | `reference/validate-kernel.mjs`, test suite `tests/` (validator, leak gate, integrity), fixture 15/15 | 4 Hydrogen | **Completed** |
| **1. Manifest & Packaging** | `package.json` (`openchamber` manifest), `contributes.skills`, `contributes.opencodePlugin`, cleanup `.claude-plugin/` | 4 Hydrogen | **Completed** |
| **2. OpenCode V2 Server Plugin** | Native JS ESM hooks (`orient`, `validate`, `auto-commit`, `capture`), `/arscontexta:*` commands, reference exposure, cleanup `hooks/` | 4 Carbon / 4 Neon | **Completed** |
| **3. Plugin Skills & Agents** | Port 10 plugin skills + `knowledge-guide` (remove `${CLAUDE_PLUGIN_ROOT}`, `AskUserQuestion`, `context: fork`; adopt OpenCode V2) | 4 Neon | **Completed** |
| **4. Derivation, Generators & Graph** | `AGENTS.md` generator, `.opencode/` vault output, `platforms/openchamber/`, graph analysis scripts, cleanup Claude generators | 4 Carbon / 4 Neon | **Completed** |
| **5. Pipeline & Subagents** | Port 16 `skill-sources/` (`/ralph`, `/pipeline`, etc.) from `Task` tool to OpenCode `subagent` / `ownWork` | 4 Neon + 4 Hydrogen | **Completed** |
| **6. OpenChamber Native UI** | Work Status section & vault panel (queue status, maintenance signals, 1-click commands) | 4 Hydrogen | Next (Optional) |

---

## Philosophy

The name connects to a tradition. **Ars Combinatoria**, **Ars Memoria**,
**Ars Contexta**: the art of context.

Llull's rotating wheels generated truth through combination. Bruno's memory
wheels created millions of image combinations. They were external thinking
systems -- tools to think with rather than just store in. The missing piece:
they required a human mind to do the traversing. Now LLMs can traverse. The
wheels can spin again.

Built on [Tools for Thought for Agents](https://github.com/agenticnotetaking)
research.

---

## License

MIT
