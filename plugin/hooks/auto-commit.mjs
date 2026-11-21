/**
 * auto-commit.mjs — Ars Contexta Non-Blocking Git Auto-Commit Hook.
 * Native cross-platform Node ESM replacement for hooks/scripts/auto-commit.sh.
 *
 * Commits pending vault changes asynchronously on serialized per-vault git queue
 * whenever `git: true` (default) is active in `.arscontexta`.
 */

import path from 'node:path';
import { isVaultDirectory, readVaultConfig } from '../vault.mjs';
import { enqueueVaultGitTask, isGitWorkTree, runGit } from '../git-queue.mjs';

/**
 * Stages and commits pending changes in `vaultDir` if Git auto-commit is enabled.
 * Safe to invoke concurrently: serialized per `vaultDir` via `enqueueVaultGitTask`.
 *
 * @param {string} vaultDir
 * @returns {Promise<{ committed: boolean, message?: string }>}
 */
export function autoCommitVault(vaultDir) {
  const resolvedVault = path.resolve(vaultDir);
  if (!isVaultDirectory(resolvedVault)) {
    return Promise.resolve({ committed: false });
  }

  if (readVaultConfig(resolvedVault, 'git', 'true') !== 'true') {
    return Promise.resolve({ committed: false });
  }

  return enqueueVaultGitTask(resolvedVault, async () => {
    if (!(await isGitWorkTree(resolvedVault))) {
      return { committed: false };
    }

    const addRes = await runGit(resolvedVault, ['add', '-A']);
    if (!addRes.ok) {
      return { committed: false };
    }

    // Exit code 0 means NO staged changes; exit code 1 means there ARE staged changes
    const quietDiff = await runGit(resolvedVault, ['diff', '--cached', '--quiet']);
    if (quietDiff.ok) {
      return { committed: false };
    }

    const namesRes = await runGit(resolvedVault, ['diff', '--cached', '--name-only']);
    const changedFiles = namesRes.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (changedFiles.length === 0) {
      return { committed: false };
    }

    const statRes = await runGit(resolvedVault, ['diff', '--cached', '--shortstat']);
    const shortStat = statRes.stdout.trim();

    let message =
      changedFiles.length === 1
        ? `Auto: ${changedFiles[0]}`
        : `Auto: ${changedFiles.length} files`;

    if (shortStat) {
      message = `${message} | ${shortStat}`;
    }

    const commitRes = await runGit(resolvedVault, ['commit', '-m', message, '--no-verify', '--quiet']);
    return {
      committed: commitRes.ok,
      message: commitRes.ok ? message : undefined,
    };
  });
}
