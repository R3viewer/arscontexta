import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Audit scanner for Claude Code patterns:
 * Ensures migrated modules do not contain deprecated Claude Code artifacts or idioms.
 */

const FORBIDDEN_PATTERNS = [
  { id: 'claude-plugin-root', regex: /\$\{CLAUDE_PLUGIN_ROOT\}/g, desc: '${CLAUDE_PLUGIN_ROOT} environment reference' },
  { id: 'claude-project-dir', regex: /CLAUDE_PROJECT_DIR/g, desc: 'CLAUDE_PROJECT_DIR environment reference' },
  { id: 'ask-user-question', regex: /AskUserQuestion/g, desc: 'Claude Code AskUserQuestion tool reference' },
  { id: 'claude-mcp-prefix', regex: /mcp__qmd__/g, desc: 'Claude Code mcp__qmd__ tool prefix (use qmd_* or tools.qmd.*)' },
  { id: 'context-fork', regex: /^context:\s*fork/m, desc: 'Claude Code context: fork frontmatter' },
  { id: 'task-tool', regex: /\bTask tool\b/g, desc: 'Claude Code Task tool (use OpenCode subagent tool)' },
];

function scanDirectory(dir, excludeDirs = ['.git', 'node_modules', 'tests/fixtures']) {
  const results = [];
  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative('.', fullPath).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        if (excludeDirs.some(ex => relPath === ex || relPath.startsWith(ex + '/'))) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.md', '.mjs', '.js', '.json', '.yaml', '.yml', '.sh'].includes(ext)) {
          results.push({ fullPath, relPath });
        }
      }
    }
  }
  walk(dir);
  return results;
}

// Strictly migrated directories/files that must have ZERO leaks
const FULLY_MIGRATED_TARGETS = [
  'package.json',
  'plugin',
  'reference/validate-kernel.mjs',
  'tests',
];

test('Legacy Cleanup Gate - .claude-plugin directory is completely removed', () => {
  assert.equal(fs.existsSync('.claude-plugin'), false, '.claude-plugin directory must not exist in OpenChamber branch');
});

test('Claude Code Leak Gate - Migrated files have zero Claude Code leaks', () => {
  const leaks = [];

  for (const target of FULLY_MIGRATED_TARGETS) {
    const isDir = fs.existsSync(target) && fs.statSync(target).isDirectory();
    const files = isDir ? scanDirectory(target) : [{ fullPath: target, relPath: target }];

    for (const { fullPath, relPath } of files) {
      if (relPath.startsWith('tests/fixtures/') || relPath.endsWith('no-claude-leak.test.mjs')) continue;
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.regex.test(content)) {
          leaks.push({ file: relPath, pattern: pattern.id, desc: pattern.desc });
        }
      }
    }
  }

  assert.equal(leaks.length, 0, `Detected Claude Code leaks in migrated files:\n${leaks.map(l => `  - ${l.file}: ${l.desc}`).join('\n')}`);
});

test('Claude Code Leak Gate - Scan baseline across repository', () => {
  const allFiles = scanDirectory('.');
  let totalLeaks = 0;
  const leaksByPattern = {};

  for (const { fullPath, relPath } of allFiles) {
    if (relPath.startsWith('tests/fixtures/') || relPath.endsWith('no-claude-leak.test.mjs')) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      const matches = content.match(pattern.regex);
      if (matches) {
        totalLeaks += matches.length;
        leaksByPattern[pattern.id] = (leaksByPattern[pattern.id] || 0) + matches.length;
      }
    }
  }

  // Ensure leak tracking is active and can be used to measure burn-down per chantier
  assert.ok(totalLeaks > 0, 'Baseline leak count should detect existing Claude Code references to migrate');
});
