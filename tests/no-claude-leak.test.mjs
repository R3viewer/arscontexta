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
  { id: 'ask-user-question', regex: /AskUserQuestion/gi, desc: 'Claude Code AskUserQuestion tool reference' },
  { id: 'claude-mcp-prefix', regex: /mcp__qmd__/g, desc: 'Claude Code mcp__qmd__ tool prefix (use qmd_* or tools.qmd.*)' },
  { id: 'context-fork', regex: /^context:\s*fork/m, desc: 'Claude Code context: fork frontmatter' },
  { id: 'task-tool', regex: /\bTask\s+tool\b/gi, desc: 'Claude Code Task tool (use OpenCode subagent tool)' },
  { id: 'task-call', regex: /\bTask\s*\(/g, desc: 'Claude Code Task(...) invocation (use subagent(...))' },
  { id: 'claude-code-mention', regex: /\bclaude\s+code\b/gi, desc: 'Legacy Claude Code platform reference' },
  { id: 'legacy-mcp-json', regex: /\.mcp\.json\b/gi, desc: 'Legacy .mcp.json reference (use opencode.jsonc)' },
  { id: 'subagent-type', regex: /\bsubagent_type\b/gi, desc: 'Legacy subagent_type parameter (use agent)' },
  { id: 'dont-ask', regex: /\bdontAsk\b/gi, desc: 'Legacy dontAsk parameter' },
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
  'agents',
  'generators',
  'package.json',
  'platforms',
  'plugin',
  'presets',
  'reference',
  'scripts',
  'skills',
  'skill-sources',
  'tests',
];

test('Legacy Cleanup Gate - .claude-plugin directory is completely removed', () => {
  assert.equal(fs.existsSync('.claude-plugin'), false, '.claude-plugin directory must not exist in OpenChamber branch');
});

test('Legacy Cleanup Gate - hooks directory is completely removed', () => {
  assert.equal(fs.existsSync('hooks'), false, 'hooks/ directory must not exist in OpenChamber branch (replaced by plugin/)');
});

test('Legacy Cleanup Gate - platforms/claude-code directory is completely removed', () => {
  assert.equal(fs.existsSync('platforms/claude-code'), false, 'platforms/claude-code directory must not exist in OpenChamber branch');
});

test('Legacy Cleanup Gate - generators/claude-md.md is completely removed', () => {
  assert.equal(fs.existsSync('generators/claude-md.md'), false, 'generators/claude-md.md must not exist in OpenChamber branch');
});

test('Claude Code Leak Gate - Migrated files have zero Claude Code leaks', () => {
  const leaks = [];

  for (const target of FULLY_MIGRATED_TARGETS) {
    const isDir = fs.existsSync(target) && fs.statSync(target).isDirectory();
    const files = isDir ? scanDirectory(target) : [{ fullPath: target, relPath: target }];

    for (const { fullPath, relPath } of files) {
      if (relPath.startsWith('tests/fixtures/') || relPath.endsWith('.test.mjs')) continue;
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (relPath.endsWith('validate-kernel.mjs') && pattern.id === 'legacy-mcp-json') continue;
        if (pattern.regex.test(content)) {
          leaks.push({ file: relPath, pattern: pattern.id, desc: pattern.desc });
        }
      }
    }
  }

  assert.equal(leaks.length, 0, `Detected Claude Code leaks in migrated files:\n${leaks.map(l => `  - ${l.file}: ${l.desc}`).join('\n')}`);
});

test('Claude Code Leak Gate - Zero leaks across all active modules', () => {
  const allFiles = scanDirectory('.', ['.git', 'node_modules', 'tests/fixtures', 'methodology']);
  let activeLeaks = 0;
  const leaksList = [];

  for (const { fullPath, relPath } of allFiles) {
    if (relPath.startsWith('tests/fixtures/') || relPath.endsWith('.test.mjs') || relPath === 'README.md') continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (relPath.endsWith('validate-kernel.mjs') && pattern.id === 'legacy-mcp-json') continue;
      const matches = content.match(pattern.regex);
      if (matches) {
        activeLeaks += matches.length;
        leaksList.push({ file: relPath, pattern: pattern.id, count: matches.length });
      }
    }
  }

  assert.equal(
    activeLeaks,
    0,
    `Expected 0 Claude Code leaks across all active modules, found ${activeLeaks}:\n${leaksList.map(l => `  - ${l.file}: ${l.pattern} (${l.count})`).join('\n')}`
  );
});
