#!/usr/bin/env node
/**
 * validate-kernel.mjs — Check a knowledge system against the 15 universal primitives.
 * Native Node.js ESM, cross-platform (Windows, macOS, Linux). Zero external dependencies.
 *
 * Usage:
 *   node reference/validate-kernel.mjs [path-to-vault] [--json]
 *   import { validateKernel } from './reference/validate-kernel.mjs';
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ANSI colors
const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[1;33m';
const NC = '\x1b[0m';

/**
 * Recursively find all files in dir matching filter
 */
function findFiles(dir, filterFn, maxDepth = 10, currentDepth = 0) {
  if (currentDepth > maxDepth || !fs.existsSync(dir)) return [];
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findFiles(fullPath, filterFn, maxDepth, currentDepth + 1));
      } else if (entry.isFile()) {
        if (!filterFn || filterFn(entry.name, fullPath)) {
          results.push(fullPath);
        }
      }
    }
  } catch {
    // Ignore unreadable directories
  }
  return results;
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Validates a vault against the 15 kernel primitives.
 * @param {string} vaultPath Path to the vault root directory
 * @returns {object} { pass, warn, fail, checks: Array<{ id, name, status: 'PASS'|'WARN'|'FAIL', message }> }
 */
export function validateKernel(vaultPath = '.') {
  const resolvedVault = path.resolve(vaultPath);
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;
  const checks = [];

  function record(id, name, status, message) {
    if (status === 'PASS') passCount++;
    else if (status === 'WARN') warnCount++;
    else if (status === 'FAIL') failCount++;
    checks.push({ id, name, status, message });
  }

  // 1. Markdown files with YAML frontmatter
  const mdFiles = findFiles(resolvedVault, (name) => {
    if (!name.endsWith('.md')) return false;
    const lower = name.toLowerCase();
    return lower !== 'readme.md' && lower !== 'skill.md' && lower !== 'claude.md' && lower !== 'agents.md';
  });

  if (mdFiles.length === 0) {
    record('markdown-yaml', 'Markdown files with YAML frontmatter', 'FAIL', 'No markdown files found');
  } else {
    let yamlCount = 0;
    for (const file of mdFiles) {
      const content = readFileSafe(file);
      if (content && content.startsWith('---') && content.indexOf('\n---', 3) !== -1) {
        yamlCount++;
      }
    }
    const noYaml = mdFiles.length - yamlCount;
    if (noYaml === 0) {
      record('markdown-yaml', 'Markdown files with YAML frontmatter', 'PASS', `${mdFiles.length} markdown files, all with YAML frontmatter`);
    } else if (noYaml < Math.floor(yamlCount / 5) + 1) {
      record('markdown-yaml', 'Markdown files with YAML frontmatter', 'WARN', `${yamlCount} with YAML, ${noYaml} without (< 20% missing)`);
    } else {
      record('markdown-yaml', 'Markdown files with YAML frontmatter', 'FAIL', `${noYaml} of ${mdFiles.length} files missing YAML frontmatter`);
    }
  }

  // 2. Wiki links as graph edges
  const existingNoteNames = new Set(
    findFiles(resolvedVault, (name) => name.endsWith('.md')).map((f) => path.basename(f, '.md'))
  );

  let linkFilesCount = 0;
  const linkCandidates = new Set();
  const wikiLinkRegex = /\[\[([A-Za-z0-9_\-\s./]+)\]\]/g;

  for (const file of mdFiles) {
    const content = readFileSafe(file);
    if (!content) continue;
    if (content.includes('[[')) {
      linkFilesCount++;
      let match;
      while ((match = wikiLinkRegex.exec(content)) !== null) {
        const target = match[1].split('|')[0].split('#')[0].trim();
        if (target) linkCandidates.add(target);
      }
    }
  }

  if (mdFiles.length === 0) {
    record('wiki-links', 'Wiki links as graph edges', 'FAIL', 'No notes to check');
  } else if (linkFilesCount > Math.floor(mdFiles.length / 2)) {
    let dangling = 0;
    for (const target of linkCandidates) {
      const targetBase = path.basename(target, '.md');
      if (!existingNoteNames.has(targetBase)) {
        dangling++;
      }
    }
    if (linkCandidates.size === 0) {
      record('wiki-links', 'Wiki links as graph edges', 'WARN', 'No wiki links found to check');
    } else if (dangling === 0) {
      record('wiki-links', 'Wiki links as graph edges', 'PASS', `No dangling wiki links (checked ${linkCandidates.size} unique links, ${linkFilesCount} files with links)`);
    } else {
      record('wiki-links', 'Wiki links as graph edges', 'WARN', `${dangling} unresolved wiki links out of ${linkCandidates.size} unique (may include planned notes/examples)`);
    }
  } else {
    record('wiki-links', 'Wiki links as graph edges', 'WARN', `Only ${linkFilesCount} of ${mdFiles.length} files contain wiki links (< 50%)`);
  }

  // 3. MOC hierarchy for attention management
  let mocCount = 0;
  let mocLikeCount = 0;
  for (const file of mdFiles) {
    const content = readFileSafe(file);
    if (!content) continue;
    if (/^type:\s*["']?moc["']?/m.test(content)) {
      mocCount++;
    } else if (content.includes('## Core Ideas') || content.includes('## Topics') || content.includes('# MOC')) {
      mocLikeCount++;
    }
  }

  if (mocCount >= 3) {
    record('moc-hierarchy', 'MOC hierarchy for attention management', 'PASS', `${mocCount} MOCs found`);
  } else if (mocCount > 0) {
    record('moc-hierarchy', 'MOC hierarchy for attention management', 'WARN', `${mocCount} MOCs found (minimum recommended: 3)`);
  } else if (mocLikeCount > 0) {
    record('moc-hierarchy', 'MOC hierarchy for attention management', 'WARN', `${mocLikeCount} MOC-like files found but none declare "type: moc"`);
  } else {
    record('moc-hierarchy', 'MOC hierarchy for attention management', 'FAIL', 'No MOCs found');
  }

  // 4. Tree injection / workspace map
  const agentsMd = readFileSafe(path.join(resolvedVault, 'AGENTS.md'));
  const claudeMd = readFileSafe(path.join(resolvedVault, 'CLAUDE.md'));
  const workspaceMap = fs.existsSync(path.join(resolvedVault, 'WORKSPACE-MAP.md'));
  const hasOrientHook = fs.existsSync(path.join(resolvedVault, 'hooks', 'scripts', 'session-orient.sh')) ||
                        fs.existsSync(path.join(resolvedVault, '.claude', 'hooks', 'session-start.sh')) ||
                        fs.existsSync(path.join(resolvedVault, '.arscontexta')) ||
                        fs.existsSync(path.join(resolvedVault, 'plugin', 'hooks', 'session-orient.mjs'));

  const treeMentioned = (agentsMd && /tree|workspace.map|orient/i.test(agentsMd)) ||
                        (claudeMd && /tree|workspace.map|orient/i.test(claudeMd));

  if (workspaceMap || hasOrientHook || treeMentioned) {
    record('tree-injection', 'Tree injection at session start', 'PASS', 'Tree injection / orientation mechanism found');
  } else {
    record('tree-injection', 'Tree injection at session start', 'WARN', 'No tree injection mechanism detected');
  }

  // 5. Description field for progressive disclosure
  const noteDirCandidates = ['notes', '01_thinking', 'thinking', 'knowledge'];
  let noteDirs = noteDirCandidates.map(d => path.join(resolvedVault, d)).filter(p => fs.existsSync(p));
  if (noteDirs.length === 0) noteDirs = [resolvedVault];

  let descCount = 0;
  let totalNotesInDirs = 0;
  for (const dir of noteDirs) {
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.md') && !['readme.md', 'skill.md', 'agents.md', 'claude.md'].includes(f.toLowerCase()))
      .map(f => path.join(dir, f));
    for (const f of files) {
      if (!fs.statSync(f).isFile()) continue;
      totalNotesInDirs++;
      const content = readFileSafe(f);
      if (content && /^description:\s*.+/m.test(content)) {
        descCount++;
      }
    }
  }

  const noDesc = totalNotesInDirs - descCount;
  if (totalNotesInDirs === 0) {
    record('description-field', 'Description field for progressive disclosure', 'WARN', 'No notes found in expected directories');
  } else if (noDesc <= 0) {
    record('description-field', 'Description field for progressive disclosure', 'PASS', `All ${descCount} notes have description fields`);
  } else if (noDesc < Math.floor(totalNotesInDirs / 5) + 1) {
    record('description-field', 'Description field for progressive disclosure', 'WARN', `${descCount} with descriptions, ${noDesc} without (< 20% missing)`);
  } else {
    record('description-field', 'Description field for progressive disclosure', 'FAIL', `${noDesc} of ${totalNotesInDirs} notes missing description field`);
  }

  // 6. Topics footer linking notes to MOCs
  let topicsCount = 0;
  for (const dir of noteDirs) {
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.md') && !['readme.md', 'skill.md', 'agents.md', 'claude.md'].includes(f.toLowerCase()))
      .map(f => path.join(dir, f));
    for (const f of files) {
      if (!fs.statSync(f).isFile()) continue;
      const content = readFileSafe(f);
      if (content && /^topics:\s*.+/m.test(content)) {
        topicsCount++;
      }
    }
  }

  const noTopics = totalNotesInDirs - topicsCount;
  if (totalNotesInDirs === 0) {
    record('topics-footer', 'Topics footer linking notes to MOCs', 'WARN', 'No notes found in expected directories');
  } else if (noTopics <= 0) {
    record('topics-footer', 'Topics footer linking notes to MOCs', 'PASS', `All ${topicsCount} notes have topics`);
  } else if (noTopics < Math.floor(totalNotesInDirs / 5) + 1) {
    record('topics-footer', 'Topics footer linking notes to MOCs', 'WARN', `${topicsCount} with topics, ${noTopics} without (< 20% missing)`);
  } else {
    record('topics-footer', 'Topics footer linking notes to MOCs', 'FAIL', `${noTopics} of ${totalNotesInDirs} notes missing topics`);
  }

  // 7. Schema enforcement via validation
  const hasTemplatesDir = ['templates', '04_meta/templates', '_templates'].some(d => fs.existsSync(path.join(resolvedVault, d)));
  const hasValidateSkill = fs.existsSync(path.join(resolvedVault, '.opencode', 'skills', 'validate', 'SKILL.md')) ||
                          fs.existsSync(path.join(resolvedVault, '.opencode', 'skills', 'verify', 'SKILL.md')) ||
                          fs.existsSync(path.join(resolvedVault, '.claude', 'skills', 'validate', 'SKILL.md')) ||
                          fs.existsSync(path.join(resolvedVault, 'skills', 'validate', 'SKILL.md')) ||
                          fs.existsSync(path.join(resolvedVault, 'skills', 'verify', 'SKILL.md')) ||
                          fs.existsSync(path.join(resolvedVault, 'validate-schema.sh')) ||
                          fs.existsSync(path.join(resolvedVault, 'validate.mjs'));

  if (hasTemplatesDir && hasValidateSkill) {
    record('schema-enforcement', 'Schema enforcement via validation', 'PASS', 'Templates and validation mechanism found');
  } else if (hasTemplatesDir) {
    record('schema-enforcement', 'Schema enforcement via validation', 'WARN', 'Templates found but no validation mechanism');
  } else if (hasValidateSkill) {
    record('schema-enforcement', 'Schema enforcement via validation', 'WARN', 'Validation mechanism found but no templates directory');
  } else {
    record('schema-enforcement', 'Schema enforcement via validation', 'FAIL', 'No templates or validation mechanism found');
  }

  // 8. Self space for agent persistent memory (CONFIGURABLE)
  const selfDir = path.join(resolvedVault, 'self');
  if (fs.existsSync(selfDir)) {
    const hasIdentity = fs.existsSync(path.join(selfDir, 'identity.md'));
    const hasMethodology = fs.existsSync(path.join(selfDir, 'methodology.md'));
    const hasGoals = fs.existsSync(path.join(selfDir, 'goals.md'));
    const selfFiles = findFiles(selfDir, f => f.endsWith('.md')).length;

    if (hasIdentity && hasMethodology && hasGoals) {
      record('self-space', 'Self space for agent persistent memory (configurable)', 'PASS', `self/ with ${selfFiles} files (identity, methodology, goals present)`);
    } else if (selfFiles > 0) {
      record('self-space', 'Self space for agent persistent memory (configurable)', 'WARN', `self/ exists with ${selfFiles} files but missing core files`);
    } else {
      record('self-space', 'Self space for agent persistent memory (configurable)', 'WARN', 'self/ directory exists but is empty');
    }
  } else {
    if (fs.existsSync(path.join(resolvedVault, 'ops', 'goals.md'))) {
      record('self-space', 'Self space for agent persistent memory (configurable)', 'PASS', 'self/ disabled, ops/ fallback in use (ops/goals.md found)');
    } else {
      record('self-space', 'Self space for agent persistent memory (configurable)', 'WARN', 'No self/ directory found (configurable — off by default for research vaults)');
    }
  }

  // 9. Session rhythm: orient, work, persist
  const hasRhythmDoc = (agentsMd && /orient.*work.*persist|session rhythm/i.test(agentsMd)) ||
                       (claudeMd && /orient.*work.*persist|session rhythm/i.test(claudeMd));
  const hasRhythmHook = hasOrientHook;

  if (hasRhythmDoc || hasRhythmHook) {
    record('session-rhythm', 'Session rhythm: orient, work, persist', 'PASS', 'Session rhythm documented or automated');
  } else {
    record('session-rhythm', 'Session rhythm: orient, work, persist', 'WARN', 'No session rhythm pattern found');
  }

  // 10. Semantic search capability (CONFIGURABLE)
  const opencodeJsonPath = [
    path.join(resolvedVault, 'opencode.jsonc'),
    path.join(resolvedVault, 'opencode.json'),
    path.join(resolvedVault, '.opencode', 'opencode.jsonc'),
    path.join(resolvedVault, '.opencode', 'opencode.json'),
  ].find(p => fs.existsSync(p));

  let hasSearchMcp = false;
  if (opencodeJsonPath) {
    const raw = readFileSafe(opencodeJsonPath) || '';
    if (raw.includes('"qmd"') || raw.includes('qmd')) hasSearchMcp = true;
  }
  const mcpJson = readFileSafe(path.join(resolvedVault, '.mcp.json'));
  if (mcpJson && mcpJson.includes('"qmd"')) hasSearchMcp = true;

  const hasSearchDocs = (agentsMd && /semantic search|qmd|vector_search|deep_search/i.test(agentsMd)) ||
                        (claudeMd && /semantic search|qmd|vector_search|deep_search/i.test(claudeMd));

  if (hasSearchMcp) {
    record('semantic-search', 'Semantic search capability (configurable)', 'PASS', 'Semantic search configured in MCP server config');
  } else if (hasSearchDocs) {
    record('semantic-search', 'Semantic search capability (configurable)', 'WARN', 'Semantic search mentioned in docs but no qmd server configuration detected');
  } else {
    record('semantic-search', 'Semantic search capability (configurable)', 'PASS', 'Semantic search not enabled (configurable)');
  }

  // 10A. Filesystem graph database (unique-addresses)
  const graphDirs = ['ops/scripts/graph', '04_meta/scripts/graph', 'scripts/graph', 'ops/graph'];
  const hasGraphScripts = graphDirs.some(d => fs.existsSync(path.join(resolvedVault, d)));

  if (hasGraphScripts) {
    record('unique-addresses', 'Filesystem graph database (unique-addresses)', 'PASS', 'Graph analysis scripts directory found');
  } else {
    record('unique-addresses', 'Filesystem graph database (unique-addresses)', 'WARN', 'No ops/scripts/graph/ directory detected');
  }

  // 11. Discovery-first quality gate
  const hasDiscoverySection = (agentsMd && /discovery.first/i.test(agentsMd)) ||
                              (claudeMd && /discovery.first/i.test(claudeMd));

  const skillDirs = [
    path.join(resolvedVault, '.opencode', 'skills'),
    path.join(resolvedVault, '.claude', 'skills'),
    path.join(resolvedVault, 'skills')
  ].filter(d => fs.existsSync(d));

  let hasDiscoverySkills = false;
  for (const sDir of skillDirs) {
    const skillFiles = findFiles(sDir, f => f.endsWith('.md'));
    for (const sf of skillFiles) {
      const content = readFileSafe(sf);
      if (content && /discovery|findability/i.test(content)) {
        hasDiscoverySkills = true;
        break;
      }
    }
    if (hasDiscoverySkills) break;
  }

  if (hasDiscoverySection && hasDiscoverySkills) {
    record('discovery-first', 'Discovery-first quality gate', 'PASS', 'Discovery-first gate in context file and skills');
  } else if (hasDiscoverySection) {
    record('discovery-first', 'Discovery-first quality gate', 'WARN', 'Discovery-first in context file but not in skills');
  } else if (hasDiscoverySkills) {
    record('discovery-first', 'Discovery-first quality gate', 'WARN', 'Discovery checks in skills but no context file section');
  } else {
    record('discovery-first', 'Discovery-first quality gate', 'WARN', 'No discovery-first quality gate detected');
  }

  // 12. Operational learning loop
  const hasObsDir = ['ops/observations', '04_meta/logs/observations', 'observations'].some(d => fs.existsSync(path.join(resolvedVault, d)));
  const hasTensionsDir = ['ops/tensions', '04_meta/logs/tensions', 'tensions'].some(d => fs.existsSync(path.join(resolvedVault, d)));
  const hasReviewTrigger = (agentsMd && /rethink|review|observations/i.test(agentsMd)) ||
                           (claudeMd && /rethink|review|observations/i.test(claudeMd));
  const hasRethink = fs.existsSync(path.join(resolvedVault, '.opencode', 'commands', 'rethink.md')) ||
                     fs.existsSync(path.join(resolvedVault, '.opencode', 'skills', 'rethink', 'SKILL.md')) ||
                     fs.existsSync(path.join(resolvedVault, '.claude', 'skills', 'rethink', 'SKILL.md')) ||
                     fs.existsSync(path.join(resolvedVault, 'skills', 'rethink', 'SKILL.md')) ||
                     fs.existsSync(path.join(resolvedVault, 'skills', 'rethink.md'));

  let loopPassed = 0;
  if (hasObsDir) loopPassed++;
  if (hasTensionsDir) loopPassed++;
  if (hasReviewTrigger) loopPassed++;
  if (hasRethink) loopPassed++;

  if (loopPassed === 4) {
    record('operational-learning-loop', 'Operational learning loop', 'PASS', 'Operational learning loop: observations, tensions, review trigger, rethink mechanism');
  } else if (loopPassed >= 2) {
    const missing = [];
    if (!hasObsDir) missing.push('observations dir');
    if (!hasTensionsDir) missing.push('tensions dir');
    if (!hasReviewTrigger) missing.push('review trigger');
    if (!hasRethink) missing.push('rethink mechanism');
    record('operational-learning-loop', 'Operational learning loop', 'WARN', `Partial learning loop (${loopPassed}/4). Missing: ${missing.join(', ')}`);
  } else {
    record('operational-learning-loop', 'Operational learning loop', 'FAIL', 'No operational learning loop detected (need observations dir, tensions dir, review trigger, rethink mechanism)');
  }

  // 13. Task stack
  const hasTasksMd = ['ops/tasks.md', '04_meta/tasks/tasks.md'].some(f => fs.existsSync(path.join(resolvedVault, f)));
  const hasQueueFile = [
    'ops/queue.yaml', 'ops/queue/queue.yaml', 'ops/queue/queue.json',
    '04_meta/tasks/queue.json', '04_meta/tasks/queue.yaml'
  ].some(f => fs.existsSync(path.join(resolvedVault, f)));

  if (hasTasksMd && hasQueueFile) {
    record('task-stack', 'Task stack', 'PASS', 'Task stack: tasks.md and queue file found');
  } else if (hasTasksMd) {
    record('task-stack', 'Task stack', 'WARN', 'tasks.md found but no queue file');
  } else if (hasQueueFile) {
    record('task-stack', 'Task stack', 'WARN', 'Queue file found but no tasks.md');
  } else {
    record('task-stack', 'Task stack', 'WARN', 'No task stack detected (ops/tasks.md + queue file)');
  }

  // 14. Methodology folder
  const hasMethodologyDir = ['ops/methodology', '04_meta/methodology'].some(d => fs.existsSync(path.join(resolvedVault, d)));
  const hasMethodologyMoc = ['ops/methodology/methodology.md', '04_meta/methodology/methodology.md'].some(f => fs.existsSync(path.join(resolvedVault, f)));

  if (hasMethodologyDir && hasMethodologyMoc) {
    record('methodology-folder', 'Methodology folder', 'PASS', 'Methodology folder with methodology.md MOC found');
  } else if (hasMethodologyDir) {
    record('methodology-folder', 'Methodology folder', 'WARN', 'ops/methodology/ exists but no methodology.md MOC inside');
  } else {
    record('methodology-folder', 'Methodology folder', 'WARN', 'No ops/methodology/ directory detected');
  }

  // 15. Session capture
  const hasSessionsDir = ['ops/sessions', '04_meta/sessions', 'self/sessions'].some(d => fs.existsSync(path.join(resolvedVault, d)));
  if (hasSessionsDir) {
    record('session-capture', 'Session capture', 'PASS', 'Session capture directory found');
  } else {
    record('session-capture', 'Session capture', 'WARN', 'No ops/sessions/ directory detected');
  }

  return {
    vault: resolvedVault,
    pass: passCount,
    warn: warnCount,
    fail: failCount,
    total: checks.length,
    ok: failCount === 0,
    checks,
  };
}

// CLI invocation
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const vaultArg = args.find(a => !a.startsWith('--')) || '.';

  const result = validateKernel(vaultArg);

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`=== Kernel Validation: ${result.vault} ===\n`);
    const idDisplay = {
      'markdown-yaml': '1.',
      'wiki-links': '2.',
      'moc-hierarchy': '3.',
      'tree-injection': '4.',
      'description-field': '5.',
      'topics-footer': '6.',
      'schema-enforcement': '7.',
      'self-space': '8.',
      'session-rhythm': '9.',
      'semantic-search': '10.',
      'unique-addresses': '10A.',
      'discovery-first': '11.',
      'operational-learning-loop': '12.',
      'task-stack': '13.',
      'methodology-folder': '14.',
      'session-capture': '15.'
    };
    for (const c of result.checks) {
      const num = idDisplay[c.id] || '';
      const color = c.status === 'PASS' ? GREEN : c.status === 'WARN' ? YELLOW : RED;
      console.log(`${num} ${c.name}`);
      console.log(`  ${color}${c.status}${NC} ${c.message}`);
    }
    console.log('\n=== Kernel Validation Summary ===');
    console.log(`  ${GREEN}PASS:${NC} ${result.pass}`);
    console.log(`  ${YELLOW}WARN:${NC} ${result.warn}`);
    console.log(`  ${RED}FAIL:${NC} ${result.fail}\n`);

    if (result.fail === 0 && result.warn === 0) {
      console.log(`${GREEN}All 15 primitives validated successfully.${NC}`);
      process.exit(0);
    } else if (result.fail === 0) {
      console.log(`${YELLOW}Kernel present with warnings. ${result.warn} primitive(s) need attention.${NC}`);
      process.exit(0);
    } else {
      console.log(`${RED}${result.fail} kernel primitive(s) missing. System may not function reliably.${NC}`);
      process.exit(1);
    }
  }
}
