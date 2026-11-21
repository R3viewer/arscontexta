/**
 * git-queue.mjs — Serialized per-vault Git command queue.
 * Prevents `.git/index.lock` collisions when parallel tools or subagents write simultaneously,
 * and avoids shell interpolation by invoking `git` directly via `node:child_process.execFile`.
 */

import { execFile } from 'node:child_process';
import path from 'node:path';
import { normalizeComparePath } from './vault.mjs';

/** @type {Map<string, Promise<unknown>>} */
const queues = new Map();

/**
 * Runs a single `git` command inside `cwd` without a shell.
 *
 * @param {string} cwd
 * @param {string[]} args
 * @param {number} [timeoutMs=10000]
 * @returns {Promise<{ ok: boolean, code: number, stdout: string, stderr: string }>}
 */
export function runGit(cwd, args, timeoutMs = 10000) {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd, timeout: timeoutMs, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            code: typeof error.code === 'number' ? error.code : 1,
            stdout: String(stdout || ''),
            stderr: String(stderr || error.message || ''),
          });
          return;
        }
        resolve({
          ok: true,
          code: 0,
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
        });
      }
    );
  });
}

/**
 * Checks whether `dir` is inside a Git work tree.
 *
 * @param {string} dir
 * @returns {Promise<boolean>}
 */
export async function isGitWorkTree(dir) {
  const res = await runGit(dir, ['rev-parse', '--is-inside-work-tree']);
  return res.ok && res.stdout.trim() === 'true';
}

/**
 * Enqueues an async Git task for `vaultDir` so concurrent hooks never collide on `.git/index.lock`.
 *
 * @template T
 * @param {string} vaultDir
 * @param {() => Promise<T>} taskFn
 * @returns {Promise<T>}
 */
export function enqueueVaultGitTask(vaultDir, taskFn) {
  const key = normalizeComparePath(path.resolve(vaultDir));
  const previous = queues.get(key) ?? Promise.resolve();

  const next = previous
    .catch(() => {})
    .then(() => taskFn());

  const tracked = next.finally(() => {
    if (queues.get(key) === tracked) {
      queues.delete(key);
    }
  });

  queues.set(key, tracked);
  return next;
}

/**
 * Waits for all pending Git tasks on `vaultDir` (or all vaults if omitted) to settle.
 *
 * @param {string} [vaultDir]
 * @returns {Promise<void>}
 */
export async function flushVaultGitTasks(vaultDir) {
  if (vaultDir) {
    const key = normalizeComparePath(path.resolve(vaultDir));
    const pending = queues.get(key);
    if (pending) {
      await pending.catch(() => {});
    }
    return;
  }
  await Promise.allSettled([...queues.values()]);
}
