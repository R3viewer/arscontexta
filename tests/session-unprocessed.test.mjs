import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  isSessionMetadataFile,
  isUnprocessedArchivedSession,
  parseSessionMetadata,
} from '../plugin/session-metadata.mjs';
import { buildOrientationContext } from '../plugin/hooks/session-orient.mjs';
import { inspectVault } from '../panel/vault-client.ts';

function createMockHost(files) {
  const normalized = new Map(
    Object.entries(files).map(([k, v]) => [k.replace(/^\/+/, ''), v])
  );

  return {
    async readFile(filePath) {
      const key = filePath.replace(/^\/+/, '');
      if (!normalized.has(key)) {
        throw new Error(`NOT_FOUND: ${key}`);
      }
      return { content: normalized.get(key) };
    },
    async listDir(dirPath) {
      const prefix = dirPath === '.' ? '' : `${dirPath.replace(/^\/+|\/+$/g, '')}/`;
      const seen = new Map();
      for (const key of normalized.keys()) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        if (!rest) continue;
        const slashIdx = rest.indexOf('/');
        if (slashIdx === -1) {
          seen.set(rest, { name: rest, kind: 'file' });
        } else {
          const dirName = rest.slice(0, slashIdx);
          if (!seen.has(dirName)) {
            seen.set(dirName, { name: dirName, kind: 'directory' });
          }
        }
      }
      return { entries: [...seen.values()] };
    },
    async stat(targetPath) {
      const key = targetPath.replace(/^\/+/, '');
      if (normalized.has(key)) return { kind: 'file', size: normalized.get(key).length };
      const prefix = `${key}/`;
      for (const k of normalized.keys()) {
        if (k.startsWith(prefix)) return { kind: 'directory', size: 0 };
      }
      throw new Error(`NOT_FOUND: ${key}`);
    },
  };
}

function buildSessionFilesFixture({ unminedCount, minedCount, activeCount, completedCount = 0 }) {
  const files = {
    '.arscontexta': 'git: false\nsession_capture: true\n',
    'ops/sessions/current.json': JSON.stringify({
      id: 'ses-current',
      started: '20260101-000000',
      status: 'archived',
    }),
    'ops/sessions/malformed.json': '{not valid json',
    'ops/sessions/null.json': 'null',
    'ops/sessions/array.json': '[]',
    'ops/sessions/empty.json': '',
  };

  let idx = 1;
  const add = (name, record) => {
    files[`ops/sessions/${name}`] = JSON.stringify(record);
  };

  for (let i = 0; i < unminedCount; i++) {
    add(`20260101-0000${String(idx++).padStart(2, '0')}.json`, {
      id: `ses-unmined-${i}`,
      started: '20260101-000000',
      status: 'archived',
      ...(i % 2 === 1 ? { mined: false } : {}),
    });
  }
  for (let i = 0; i < minedCount; i++) {
    add(`20260101-0001${String(idx++).padStart(2, '0')}.json`, {
      id: `ses-mined-${i}`,
      started: '20260101-000100',
      status: 'archived',
      mined: true,
    });
  }
  for (let i = 0; i < activeCount; i++) {
    add(`20260101-0002${String(idx++).padStart(2, '0')}.json`, {
      id: `ses-active-${i}`,
      started: '20260101-000200',
      status: 'active',
    });
  }
  for (let i = 0; i < completedCount; i++) {
    add(`20260101-0003${String(idx++).padStart(2, '0')}.json`, {
      id: `ses-completed-${i}`,
      started: '20260101-000300',
      status: 'completed',
    });
  }

  return files;
}

test('session-metadata helpers filter current.json, malformed JSON, mined, and non-archived records', () => {
  assert.equal(isSessionMetadataFile('current.json'), false);
  assert.equal(isSessionMetadataFile('20260101-000000.json'), true);
  assert.equal(isSessionMetadataFile('notes.md'), false);

  assert.equal(parseSessionMetadata('{bad'), null);
  assert.equal(parseSessionMetadata('null'), null);
  assert.equal(parseSessionMetadata('[]'), null);
  assert.equal(parseSessionMetadata(''), null);
  assert.deepEqual(parseSessionMetadata('{"status":"archived"}'), { status: 'archived' });

  assert.equal(isUnprocessedArchivedSession({ status: 'archived' }), true);
  assert.equal(isUnprocessedArchivedSession({ status: 'archived', mined: false }), true);
  assert.equal(isUnprocessedArchivedSession({ status: 'archived', mined: true }), false);
  assert.equal(isUnprocessedArchivedSession({ status: 'active' }), false);
  assert.equal(isUnprocessedArchivedSession({ status: 'completed' }), false);
  assert.equal(isUnprocessedArchivedSession(null), false);
});

test('inspectVault counts only unmined archived sessions and excludes mined, active, current.json, and malformed files', async () => {
  const belowThresholdHost = createMockHost(
    buildSessionFilesFixture({ unminedCount: 4, minedCount: 50, activeCount: 57, completedCount: 3 })
  );
  const belowSnap = await inspectVault(belowThresholdHost);
  assert.equal(belowSnap.unprocessedSessions, 4);
  assert.equal(
    belowSnap.signals.some((s) => s.id === 'sessions'),
    false,
    'Must not emit sessions signal when fewer than 5 unmined archived sessions exist'
  );
  assert.equal(belowSnap.recentSessions.length, 5);

  const atThresholdHost = createMockHost(
    buildSessionFilesFixture({ unminedCount: 5, minedCount: 50, activeCount: 57, completedCount: 3 })
  );
  const atSnap = await inspectVault(atThresholdHost);
  assert.equal(atSnap.unprocessedSessions, 5);
  const sig = atSnap.signals.find((s) => s.id === 'sessions');
  assert.ok(sig, 'Must emit sessions signal when 5 or more unmined archived sessions exist');
  assert.equal(sig.label, '5 unprocessed sessions ready to mine');
});

test('buildOrientationContext counts only unmined archived sessions for startup signal', () => {
  const writeVaultFixture = (counts) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ars-unprocessed-orient-'));
    const files = buildSessionFilesFixture(counts);
    for (const [relPath, content] of Object.entries(files)) {
      const full = path.join(dir, relPath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf8');
    }
    return dir;
  };

  const belowDir = writeVaultFixture({ unminedCount: 4, minedCount: 10, activeCount: 12, completedCount: 4 });
  const atDir = writeVaultFixture({ unminedCount: 6, minedCount: 10, activeCount: 12, completedCount: 4 });

  try {
    const belowContext = buildOrientationContext(belowDir);
    assert.ok(belowContext);
    assert.equal(belowContext.includes('unprocessed sessions'), false);

    const atContext = buildOrientationContext(atDir);
    assert.ok(atContext);
    assert.ok(atContext.includes('CONDITION: 6 unprocessed sessions. Consider /remember --mine-sessions.'));
  } finally {
    fs.rmSync(belowDir, { recursive: true, force: true });
    fs.rmSync(atDir, { recursive: true, force: true });
  }
});
