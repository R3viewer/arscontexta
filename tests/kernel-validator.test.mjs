import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { validateKernel } from '../reference/validate-kernel.mjs';

const FIXTURE_DIR = path.resolve('tests/fixtures/vault-minimal-openchamber');

test('Kernel Validator - minimal OpenChamber fixture passes 15/15 primitives', () => {
  const result = validateKernel(FIXTURE_DIR);
  assert.equal(result.fail, 0, `Expected 0 failures, got ${result.fail}: ${JSON.stringify(result.checks.filter(c => c.status === 'FAIL'))}`);
  assert.equal(result.warn, 0, `Expected 0 warnings, got ${result.warn}: ${JSON.stringify(result.checks.filter(c => c.status === 'WARN'))}`);
  assert.equal(result.ok, true);

  const checkIds = result.checks.map(c => c.id);
  const expectedPrimitives = [
    'markdown-yaml',
    'wiki-links',
    'moc-hierarchy',
    'tree-injection',
    'description-field',
    'topics-footer',
    'schema-enforcement',
    'self-space',
    'session-rhythm',
    'semantic-search',
    'unique-addresses',
    'discovery-first',
    'operational-learning-loop',
    'task-stack',
    'methodology-folder',
    'session-capture',
  ];

  for (const expected of expectedPrimitives) {
    assert.ok(checkIds.includes(expected), `Missing check for primitive: ${expected}`);
  }
});

test('Kernel Validator - empty directory fails validation', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ars-empty-vault-'));
  try {
    const result = validateKernel(tmpDir);
    assert.equal(result.ok, false);
    assert.ok(result.fail > 0, 'Empty vault should have failures');

    const failedIds = result.checks.filter(c => c.status === 'FAIL').map(c => c.id);
    assert.ok(failedIds.includes('markdown-yaml'), 'Empty vault must fail markdown-yaml');
    assert.ok(failedIds.includes('moc-hierarchy'), 'Empty vault must fail moc-hierarchy');
    assert.ok(failedIds.includes('schema-enforcement'), 'Empty vault must fail schema-enforcement');
    assert.ok(failedIds.includes('operational-learning-loop'), 'Empty vault must fail learning loop');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Kernel Validator - missing description fields trigger warnings/failure', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ars-no-desc-vault-'));
  try {
    // Copy fixture files except remove description from notes
    const notesDir = path.join(tmpDir, 'notes');
    fs.mkdirSync(notesDir, { recursive: true });
    fs.writeFileSync(path.join(notesDir, 'note1.md'), '---\ntopics: [overview]\n---\n# Note 1\nSome content [[note2]]\n');
    fs.writeFileSync(path.join(notesDir, 'note2.md'), '---\ntopics: [overview]\n---\n# Note 2\nSome content [[note1]]\n');

    const result = validateKernel(tmpDir);
    const descCheck = result.checks.find(c => c.id === 'description-field');
    assert.ok(descCheck, 'description-field check must be present');
    assert.equal(descCheck.status, 'FAIL', 'Notes without description must fail description-field');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
