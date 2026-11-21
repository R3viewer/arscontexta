import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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
