import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const EXPECTED_FEATURE_BLOCKS = [
  'atomic-notes.md',
  'wiki-links.md',
  'mocs.md',
  'processing-pipeline.md',
  'semantic-search.md',
  'schema.md',
  'maintenance.md',
  'self-evolution.md',
  'methodology-knowledge.md',
  'personality.md',
  'session-rhythm.md',
  'templates.md',
  'multi-domain.md',
  'ethical-guardrails.md',
  'self-space.md',
  'helper-functions.md',
  'graph-analysis.md',
];

test('Generators - AGENTS.md template exists and contains required sections', () => {
  const agentsGenPath = path.resolve('generators/agents-md.md');
  assert.ok(fs.existsSync(agentsGenPath), 'generators/agents-md.md must exist');
  const content = fs.readFileSync(agentsGenPath, 'utf8');

  const requiredSections = [
    '# AGENTS.md',
    '## Philosophy',
    '## Discovery-First Design',
    '## Session Rhythm',
    '## Operational Space',
    '## Feature Blocks',
    '## Pipeline Compliance',
    '## Self-Extension',
    '## System Evolution',
  ];

  for (const sec of requiredSections) {
    assert.ok(content.includes(sec), `generators/agents-md.md must contain section: ${sec}`);
  }

  assert.equal(fs.existsSync('generators/claude-md.md'), false, 'generators/claude-md.md must be removed');
});

test('Platforms - platforms/openchamber/ exists and claude-code is removed', () => {
  const ocGenPath = path.resolve('platforms/openchamber/generator.md');
  assert.ok(fs.existsSync(ocGenPath), 'platforms/openchamber/generator.md must exist');
  const content = fs.readFileSync(ocGenPath, 'utf8');

  assert.ok(content.includes('AGENTS.md'), 'generator.md must document AGENTS.md context file');
  assert.ok(content.includes('.arscontexta'), 'generator.md must document .arscontexta marker');
  assert.ok(content.includes('opencode.jsonc'), 'generator.md must document opencode.jsonc configuration');

  assert.equal(fs.existsSync('platforms/claude-code'), false, 'platforms/claude-code directory must be removed');
});

test('Feature Blocks - All 17 feature blocks exist and are non-empty', () => {
  const featuresDir = path.resolve('generators/features');
  assert.ok(fs.existsSync(featuresDir), 'generators/features/ directory must exist');

  for (const block of EXPECTED_FEATURE_BLOCKS) {
    const blockPath = path.join(featuresDir, block);
    assert.ok(fs.existsSync(blockPath), `Feature block missing: ${block}`);
    const stat = fs.statSync(blockPath);
    assert.ok(stat.size > 0, `Feature block must not be empty: ${block}`);
  }
});

test('OpenChamber Native Feature Block - openchamber-native.md documents Lead awareness & boundaries', () => {
  const nativePath = path.resolve('generators/features/openchamber-native.md');
  assert.ok(fs.existsSync(nativePath), 'generators/features/openchamber-native.md must exist');
  const content = fs.readFileSync(nativePath, 'utf8');
  assert.ok(content.includes('lead.brief'), 'openchamber-native.md must document lead.brief');
  assert.ok(content.includes('lead.digest'), 'openchamber-native.md must document lead.digest');
  assert.ok(content.includes('openchamber_knowledge'), 'openchamber-native.md must document openchamber_knowledge boundaries');

  const agentsTemplate = fs.readFileSync(path.resolve('generators/agents-md.md'), 'utf8');
  assert.ok(agentsTemplate.includes('openchamber-native'), 'generators/agents-md.md must include openchamber-native block');
});

test('OpenChamber Saved Workflows - workflow templates conform to OpenChamber sandbox contract', () => {
  const workflowFiles = [
    { file: 'generators/workflows/process-queue.js', expectedName: 'process-queue' },
    { file: 'generators/workflows/vault-health-audit.js', expectedName: 'vault-health-audit' },
  ];

  for (const { file, expectedName } of workflowFiles) {
    const fullPath = path.resolve(file);
    assert.ok(fs.existsSync(fullPath), `Workflow template missing: ${file}`);
    const src = fs.readFileSync(fullPath, 'utf8');

    const metaMatch = src.match(/^export\s+const\s+meta\s*=\s*(\{[\s\S]*?\n\});/m);
    assert.ok(metaMatch, `${file} must start with export const meta = { ... };`);

    const meta = vm.runInNewContext(`(${metaMatch[1]})`, {}, { timeout: 100 });
    assert.equal(meta.name, expectedName);
    assert.ok(typeof meta.description === 'string' && meta.description.length > 0 && meta.description.length <= 500);
    assert.ok(Array.isArray(meta.phases) && meta.phases.length > 0);

    const body = src.slice(metaMatch.index + metaMatch[0].length);
    assert.equal(/^\s*import\s[\s\S]*?from\s/m.test(body), false, `${file} must not contain import statements`);
    assert.equal(/\b(?:Date\.now|Math\.random|new\s+Date)\b/.test(body), false, `${file} must avoid non-deterministic globals`);

    // Must compile inside async wrapper as OpenChamber workflow sandbox does
    new vm.Script(`(async () => {\n${body}\n})()`, { filename: file });

    // Every phase("...") call must appear in meta.phases
    for (const match of body.matchAll(/\bphase\(\s*(["'`])((?:(?!\1).)+)\1\s*\)/g)) {
      assert.ok(meta.phases.includes(match[2]), `${file} phase("${match[2]}") missing from meta.phases`);
    }
  }
});

test('OpenChamber Workflows Integration - setup, ralph, and pipeline reference openchamber_workflow', () => {
  for (const file of ['skills/setup/SKILL.md', 'skill-sources/ralph/SKILL.md', 'skill-sources/pipeline/SKILL.md']) {
    const content = fs.readFileSync(path.resolve(file), 'utf8');
    assert.ok(content.includes('openchamber_workflow'), `${file} must document openchamber_workflow`);
  }
});
