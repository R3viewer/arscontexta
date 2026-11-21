/**
 * session-capture.mjs — Ars Contexta Session Capture Hook.
 * Native cross-platform Node ESM replacement for platforms/claude-code/hooks/session-capture.sh.template.
 *
 * Triggered when a session becomes idle or is archived (`session.idle`, `session.archived`).
 * Persists session state in `ops/sessions/` for `/remember --mine-sessions` and commits vault artifacts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { isVaultDirectory, readVaultConfig, resolveVaultStructure } from '../vault.mjs';
import { enqueueVaultGitTask, isGitWorkTree, runGit } from '../git-queue.mjs';
import { formatSessionTimestamp } from './session-orient.mjs';

/**
 * Captures session completion/idle state into `ops/sessions/` and commits session artifacts if git is enabled.
 *
 * @param {string} vaultDir
 * @param {string} sessionID
 * @param {{ status?: 'completed' | 'archived' }} [options]
 * @returns {Promise<{ captured: boolean, sessionFile?: string, committed?: boolean }>}
 */
export async function captureSessionState(vaultDir, sessionID, options = {}) {
  const resolvedVault = path.resolve(vaultDir);
  if (!sessionID || !isVaultDirectory(resolvedVault)) {
    return { captured: false };
  }

  if (readVaultConfig(resolvedVault, 'session_capture', 'true') !== 'true') {
    return { captured: false };
  }

  const sessionsDir = path.join(resolvedVault, 'ops', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });

  const now = new Date();
  const timestamp = formatSessionTimestamp(now);
  const currentPath = path.join(sessionsDir, 'current.json');

  let started = timestamp;
  let startedIso = now.toISOString();
  let existingArchiveFile = null;

  if (fs.existsSync(currentPath)) {
    try {
      const current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
      if (current && current.id === sessionID) {
        if (current.started) started = current.started;
        if (current.startedIso) startedIso = current.startedIso;
        if (current.archiveFile) existingArchiveFile = current.archiveFile;
      }
    } catch {
      // Ignore malformed current.json
    }
  }

  const safeStamp = String(started).replace(/[^A-Za-z0-9_-]/g, '-');
  const archiveFileName = existingArchiveFile || `${safeStamp}.json`;
  const archivePath = path.join(sessionsDir, archiveFileName);

  const record = {
    id: sessionID,
    started,
    startedIso,
    ended: now.toISOString(),
    status: options.status || 'completed',
    archiveFile: archiveFileName,
  };

  const serialized = JSON.stringify(record, null, 2) + '\n';
  fs.writeFileSync(archivePath, serialized, 'utf8');
  fs.writeFileSync(currentPath, serialized, 'utf8');

  let committed = false;
  if (readVaultConfig(resolvedVault, 'git', 'true') === 'true') {
    committed = await enqueueVaultGitTask(resolvedVault, async () => {
      if (!(await isGitWorkTree(resolvedVault))) return false;

      const { notesDir, inboxDir } = resolveVaultStructure(resolvedVault);
      const candidateDirs = [
        'ops/sessions',
        'ops/observations',
        'ops/tensions',
        'ops/methodology',
        'self/goals.md',
        'ops/goals.md',
        notesDir,
        inboxDir,
      ].filter((rel) => fs.existsSync(path.join(resolvedVault, rel)));

      if (candidateDirs.length === 0) return false;

      await runGit(resolvedVault, ['add', '--', ...candidateDirs]);
      const diffCheck = await runGit(resolvedVault, ['diff', '--cached', '--quiet']);
      if (diffCheck.ok) return false;

      const commitRes = await runGit(resolvedVault, [
        'commit',
        '-m',
        `Session capture: ${timestamp}`,
        '--quiet',
        '--no-verify',
      ]);
      return commitRes.ok;
    });
  }

  return {
    captured: true,
    sessionFile: archivePath,
    committed,
  };
}
