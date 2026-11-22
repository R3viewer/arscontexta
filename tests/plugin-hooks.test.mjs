import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  isVaultDirectory,
  findVaultRoot,
  readVaultConfig,
  resolveVaultStructure,
} from '../plugin/vault.mjs';

import {
  buildWorkspaceTree,
  formatSessionTimestamp,
  trackSessionStart,
  summarizeQueue,
  buildOrientationContext,
} from '../plugin/hooks/session-orient.mjs';

import {
  WRITE_TOOL_NAMES,
  extractModifiedFiles,
  isKnowledgeNoteFile,
  validateNoteFile,
  appendValidationToToolResult,
  runWriteValidateOnToolEvent,
} from '../plugin/hooks/write-validate.mjs';

import { captureSessionState } from '../plugin/hooks/session-capture.mjs';
import { autoCommitVault } from '../plugin/hooks/auto-commit.mjs';
import {
  PLUGIN_COMMANDS_META,
  expandCommandPrompt,
  loadBundledPluginSkills,
  parseSkillMarkdown,
  resolvePluginRootTokens,
} from '../plugin/commands.mjs';

import plugin from '../plugin/index.js';

function createTempVault() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ars-test-vault-'));
  fs.writeFileSync(path.join(tmpDir, '.arscontexta'), 'git: false\nsession_capture: true\n', 'utf8');
  fs.mkdirSync(path.join(tmpDir, 'notes'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'inbox'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'ops', 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'ops', 'observations'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'ops', 'tensions'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'self'), { recursive: true });
  return tmpDir;
}

test('Vault Detection & Config - Identifies vaults, marker migration and configs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ars-vaultguard-'));
  try {
    assert.equal(isVaultDirectory(tmpDir), false, 'Empty dir is not a vault');

    // Create legacy marker with cat face
    const marker = path.join(tmpDir, '.arscontexta');
    fs.writeFileSync(marker, '(^.^)\n', 'utf8');

    assert.equal(isVaultDirectory(tmpDir), true, 'Legacy marker recognized as vault');
    const migrated = fs.readFileSync(marker, 'utf8');
    assert.ok(migrated.includes('git: true'), 'Auto-migrated legacy marker to YAML config');

    assert.equal(readVaultConfig(tmpDir, 'git', 'false'), 'true');
    assert.equal(readVaultConfig(tmpDir, 'session_capture', 'false'), 'true');
    assert.equal(readVaultConfig(tmpDir, 'nonexistent', 'my-default'), 'my-default');

    // Nested file resolution
    const deepNote = path.join(tmpDir, 'notes', 'sub', 'test.md');
    fs.mkdirSync(path.dirname(deepNote), { recursive: true });
    fs.writeFileSync(deepNote, '# Test', 'utf8');

    const foundRoot = findVaultRoot(deepNote);
    assert.equal(foundRoot, path.resolve(tmpDir));

    // Test indented derivation-manifest.md with comments parsing
    fs.mkdirSync(path.join(tmpDir, 'ops'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'ops', 'derivation-manifest.md'),
      `---
vocabulary:
  notes: "reflections" # e.g. reflections
  inbox: "journal" # quick captures
  note: "reflection"
  topic_map: "theme"
  reduce: "surface"
---`,
      'utf8'
    );

    const structure = resolveVaultStructure(tmpDir);
    assert.equal(structure.notesDir, 'reflections', 'Should resolve indented notes folder from derivation-manifest');
    assert.equal(structure.inboxDir, 'journal', 'Should resolve indented inbox folder from derivation-manifest');
    assert.equal(structure.vocabulary.note, 'reflection');
    assert.equal(structure.vocabulary.topicMap, 'theme');
    assert.equal(structure.vocabulary.reduce, 'surface');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Session Orient Hook - Workspace tree, session tracking and orientation briefing', async () => {
  const vaultDir = createTempVault();
  try {
    fs.writeFileSync(path.join(vaultDir, 'notes', 'test-note.md'), '---\ndescription: hello\n---\n# Test', 'utf8');
    fs.writeFileSync(path.join(vaultDir, 'self', 'identity.md'), '# I am an agent partner', 'utf8');
    fs.writeFileSync(path.join(vaultDir, 'self', 'goals.md'), '- [ ] Finish testing', 'utf8');

    // 1. Test tree builder
    const tree = buildWorkspaceTree(vaultDir, 2);
    assert.ok(tree.includes('notes/'), 'Tree must include notes/');
    assert.ok(tree.includes('self/'), 'Tree must include self/');

    // 2. Track session 1
    const s1 = await trackSessionStart(vaultDir, 'ses-test-1');
    assert.equal(s1.previousSessionJson, null);

    const currentPath = path.join(vaultDir, 'ops', 'sessions', 'current.json');
    assert.ok(fs.existsSync(currentPath));
    const current1 = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
    assert.equal(current1.id, 'ses-test-1');

    // 3. Track session 2 -> should archive session 1 and return previous session context
    const s2 = await trackSessionStart(vaultDir, 'ses-test-2');
    assert.ok(s2.previousSessionJson, 'Should return previous session JSON for continuity');
    assert.ok(s2.previousSessionJson.includes('ses-test-1'));

    const current2 = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
    assert.equal(current2.id, 'ses-test-2');

    // Check archive file was created in ops/sessions
    const sessionFiles = fs.readdirSync(path.join(vaultDir, 'ops', 'sessions'));
    assert.ok(sessionFiles.length >= 2, 'Archive file must be created alongside current.json');

    // 4. Build orientation context
    const orientation = buildOrientationContext(vaultDir, { previousSessionJson: s2.previousSessionJson });
    assert.ok(orientation.includes('<arscontexta_orientation>'));
    assert.ok(orientation.includes('## Workspace Structure'));
    assert.ok(orientation.includes('## Previous Session Context'));
    assert.ok(orientation.includes('ses-test-1'));
    assert.ok(orientation.includes('## Current Goals'));
    assert.ok(orientation.includes('## Identity'));
  } finally {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  }
});

test('Write Validate Hook - Validates note schema and appends warnings', () => {
  const vaultDir = createTempVault();
  try {
    const validNotePath = path.join(vaultDir, 'notes', 'valid.md');
    fs.writeFileSync(
      validNotePath,
      '---\ndescription: Proper description explaining mechanism.\ntopics:\n  - "[[overview]]"\n---\n# Valid Note\n\nContent linking to [[other]].',
      'utf8'
    );

    const validRes = validateNoteFile(validNotePath, vaultDir);
    assert.equal(validRes.valid, true);
    assert.equal(validRes.warnings.length, 0);

    // Note missing description and topics
    const badNotePath = path.join(vaultDir, 'notes', 'bad.md');
    fs.writeFileSync(badNotePath, '# Bad Note\n\nNo frontmatter.', 'utf8');

    const badRes = validateNoteFile(badNotePath, vaultDir);
    assert.equal(badRes.valid, false);
    assert.ok(badRes.warnings.some((w) => w.includes('Missing YAML frontmatter')));

    // Test tool event integration
    const mockEvent = {
      tool: 'write',
      input: { filePath: badNotePath },
      status: 'completed',
      result: { content: 'File written successfully' },
    };

    const { vaultsTouched, feedbackText } = runWriteValidateOnToolEvent(mockEvent, vaultDir);
    assert.ok(vaultsTouched.has(path.resolve(vaultDir)));
    assert.ok(feedbackText && feedbackText.includes('Ars Contexta Schema Warning'));
    assert.ok(typeof mockEvent.result.content === 'string');
    assert.ok(mockEvent.result.content.includes('[Ars Contexta Schema Warning]'));
  } finally {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  }
});

test('Session Capture Hook - Persists session on idle/archive', async () => {
  const vaultDir = createTempVault();
  try {
    const res = await captureSessionState(vaultDir, 'ses-capture-test', { status: 'completed' });
    assert.equal(res.captured, true);
    assert.ok(fs.existsSync(res.sessionFile));

    const content = JSON.parse(fs.readFileSync(res.sessionFile, 'utf8'));
    assert.equal(content.id, 'ses-capture-test');
    assert.equal(content.status, 'completed');
    assert.ok(content.ended);
  } finally {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  }
});

test('Commands & Skill Loading - Resolves root tokens and loads 10 plugin skills', () => {
  const skills = loadBundledPluginSkills(process.cwd());
  assert.equal(skills.length, 10, 'Must load all 10 plugin skills');

  const setupSkill = skills.find((s) => s.id === 'setup');
  assert.ok(setupSkill);
  assert.equal(setupSkill.commandName, 'arscontexta:setup');
  assert.ok(!setupSkill.resolvedBody.includes('${CLAUDE_PLUGIN_ROOT}'), 'Must resolve plugin root tokens');
  assert.ok(setupSkill.resolvedBody.includes('<arscontexta_plugin_paths>'));

  // Test command prompt expansion
  const expandedWithArg = expandCommandPrompt('Run with $ARGUMENTS', 'my-query');
  assert.equal(expandedWithArg, 'Run with my-query');

  const expandedAppend = expandCommandPrompt('Review changes.', 'extra context');
  assert.equal(expandedAppend, 'Review changes.\n\nextra context');
});

test('Plugin Setup Integration - Registers references, commands, skills, tools and hooks', async () => {
  const registered = {
    references: [],
    commands: [],
    skills: [],
    tools: [],
    sessionHooks: [],
    toolHooks: [],
    eventsSubscribed: false,
  };

  const mockCtx = {
    location: { directory: process.cwd() },
    reference: {
      transform: async (cb) => {
        const editor = {
          get: (name) => registered.references.find((r) => r.name === name),
          add: (name, source) => registered.references.push({ name, source }),
        };
        cb(editor);
      },
    },
    command: {
      transform: async (cb) => {
        const editor = {
          add: (def) => registered.commands.push(def),
        };
        cb(editor);
      },
    },
    skill: {
      transform: async (cb) => {
        const editor = {
          get: (id) => registered.skills.find((s) => s.id === id),
          add: (def) => registered.skills.push(def),
          update: (id, updateFn) => {
            const item = registered.skills.find((s) => s.id === id);
            if (item) updateFn(item);
          },
        };
        cb(editor);
      },
    },
    tool: {
      transform: async (cb) => {
        const editor = {
          namespace: () => {},
          add: (def) => registered.tools.push(def),
        };
        cb(editor);
      },
      hook: async (name, cb) => {
        registered.toolHooks.push({ name, cb });
        return { dispose: async () => {} };
      },
    },
    session: {
      hook: async (name, cb) => {
        registered.sessionHooks.push({ name, cb });
        return { dispose: async () => {} };
      },
      get: async () => ({ location: { directory: process.cwd() } }),
    },
    event: {
      subscribe: () => {
        registered.eventsSubscribed = true;
        return (async function* () {})();
      },
    },
  };

  const cleanup = await plugin.setup(mockCtx);
  assert.equal(typeof cleanup, 'function');

  assert.ok(registered.references.length >= 4, 'Must register bundled local references');
  assert.ok(registered.references.some((r) => r.name === 'arscontexta-methodology'));
  assert.ok(registered.references.some((r) => r.name === 'arscontexta-reference'));

  assert.equal(registered.commands.length, 10, 'Must register 10 /arscontexta:* commands');
  assert.ok(registered.commands.some((c) => c.name === 'arscontexta:setup'));
  assert.ok(registered.commands.some((c) => c.name === 'arscontexta:help'));

  assert.equal(registered.skills.length, 10, 'Must register 10 plugin skills');
  const validateTool = registered.tools.find((t) => t.name === 'validate_kernel');
  assert.ok(validateTool, 'Must register validate_kernel tool');

  const toolResult = await validateTool.execute(
    { path: 'tests/fixtures/vault-minimal-openchamber' },
    { sessionID: 'test-ses', agent: 'build' }
  );
  const parsedReport = JSON.parse(toolResult.content);
  assert.equal(parsedReport.status, 'PASS');
  assert.equal(parsedReport.ok, true);
  assert.equal(parsedReport.fail, 0);

  assert.ok(registered.sessionHooks.some((h) => h.name === 'context'), 'Must register context session hook');
  assert.ok(registered.toolHooks.some((h) => h.name === 'execute.after'), 'Must register execute.after tool hook');
  assert.equal(registered.eventsSubscribed, true, 'Must subscribe to server events');

  cleanup();
});
