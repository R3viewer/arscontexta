/**
 * Ars Contexta — OpenCode V2 Server Plugin Entrypoint.
 * Loaded by OpenChamber (`contributes.opencodePlugin: "plugin"`) or standalone OpenCode V2 via bare `import()`.
 * Pure Node.js ESM with zero external npm dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isVaultDirectory, normalizeComparePath } from './vault.mjs';
import { flushVaultGitTasks } from './git-queue.mjs';
import { buildOrientationContext, trackSessionStart } from './hooks/session-orient.mjs';
import { runWriteValidateOnToolEvent } from './hooks/write-validate.mjs';
import { autoCommitVault } from './hooks/auto-commit.mjs';
import { captureSessionState } from './hooks/session-capture.mjs';
import { expandCommandPrompt, loadBundledPluginSkills } from './commands.mjs';
import { validateKernel } from '../reference/validate-kernel.mjs';

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(PLUGIN_DIR, '..');
const PACKAGE_ROOT_POSIX = PACKAGE_ROOT.replace(/\\/g, '/');

const ORIENTATION_CACHE_TTL_MS = 1500;

const BUNDLED_REFERENCES = [
  { name: 'arscontexta-methodology', dir: 'methodology' },
  { name: 'arscontexta-reference', dir: 'reference' },
  { name: 'arscontexta-generators', dir: 'generators' },
  { name: 'arscontexta-skill-sources', dir: 'skill-sources' },
  { name: 'arscontexta-presets', dir: 'presets' },
];

export default {
  id: 'arscontexta',

  async setup(ctx) {
    /** @type {Map<string, string>} */
    const sessionDirCache = new Map();
    /** @type {Map<string, string | null>} */
    const trackedSessions = new Map();
    /** @type {Map<string, { text: string | null, expiresAt: number }>} */
    const orientationCache = new Map();

    const defaultLocationDir = () => ctx?.location?.directory || process.cwd();

    /**
     * Resolves the working directory for a given `sessionID`.
     *
     * @param {string | undefined} sessionID
     * @param {string | undefined} [explicitDir]
     * @returns {Promise<string>}
     */
    async function resolveSessionDirectory(sessionID, explicitDir) {
      if (explicitDir) {
        if (sessionID) sessionDirCache.set(sessionID, explicitDir);
        return explicitDir;
      }
      if (sessionID && sessionDirCache.has(sessionID)) {
        return /** @type {string} */ (sessionDirCache.get(sessionID));
      }
      if (sessionID && typeof ctx?.session?.get === 'function') {
        try {
          const res = await ctx.session.get({ sessionID });
          const info = res?.data ?? res;
          const dir = info?.location?.directory;
          if (typeof dir === 'string' && dir.length > 0) {
            sessionDirCache.set(sessionID, dir);
            return dir;
          }
        } catch {
          // Fall back to plugin instance location
        }
      }
      return defaultLocationDir();
    }

    function invalidateOrientationCache(vaultDir) {
      const key = normalizeComparePath(path.resolve(vaultDir));
      orientationCache.delete(key);
    }

    // 1. Expose bundled knowledge graph, references, generators & presets as OpenCode References
    if (typeof ctx?.reference?.transform === 'function') {
      const availableRefs = BUNDLED_REFERENCES
        .map((r) => ({ name: r.name, fullPath: path.join(PACKAGE_ROOT, r.dir) }))
        .filter((r) => fs.existsSync(r.fullPath));

      await ctx.reference.transform((editor) => {
        for (const ref of availableRefs) {
          if (typeof editor.get === 'function' && editor.get(ref.name)) continue;
          editor.add(ref.name, { type: 'local', path: ref.fullPath });
        }
      });
    }

    // Preload bundled plugin skills once before registering synchronous transforms
    const bundledSkills = loadBundledPluginSkills(PACKAGE_ROOT);

    // 2. Register the 10 `/arscontexta:*` slash commands
    if (typeof ctx?.command?.transform === 'function' && bundledSkills.length > 0) {
      await ctx.command.transform((editor) => {
        for (const skill of bundledSkills) {
          editor.add({
            name: skill.commandName,
            description: skill.description,
            execute: async ({ sessionID, prompt, delivery }) => {
              const argsText = typeof prompt?.text === 'string' ? prompt.text : '';
              const expanded = expandCommandPrompt(skill.resolvedBody, argsText);
              await ctx.session.prompt({
                ...prompt,
                sessionID,
                text: expanded,
                delivery,
              });
            },
          });
        }
      });
    }

    // 3. Ensure the 10 plugin skills have resolved plugin root paths (and work in standalone OpenCode)
    if (typeof ctx?.skill?.transform === 'function' && bundledSkills.length > 0) {
      await ctx.skill.transform((editor) => {
        for (const skill of bundledSkills) {
          const existing = typeof editor.get === 'function' ? editor.get(skill.id) : undefined;
          if (existing && typeof editor.update === 'function') {
            editor.update(skill.id, (entry) => {
              entry.content = skill.resolvedBody;
            });
          } else if (!existing && typeof editor.add === 'function') {
            editor.add({
              id: skill.id,
              name: skill.name,
              description: skill.description,
              autoinvoke: true,
              path: skill.path,
              content: skill.resolvedBody,
            });
          }
        }
      });
    }

    // 4. Expose native cross-platform Kernel Validator tool (`arscontexta_validate_kernel`)
    if (typeof ctx?.tool?.transform === 'function') {
      await ctx.tool.transform((editor) => {
        if (typeof editor.namespace === 'function') {
          editor.namespace({
            name: 'arscontexta',
            description: 'Ars Contexta vault diagnostics and kernel validation tools',
          });
        }
        editor.add({
          name: 'validate_kernel',
          description: 'Validate an Ars Contexta vault against the 15 universal kernel primitives.',
          options: { namespace: 'arscontexta', codemode: true },
          input: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the vault directory (defaults to current session directory).',
              },
            },
            additionalProperties: false,
          },
          execute: async (input, toolCtx) => {
            const sessionDir = await resolveSessionDirectory(toolCtx?.sessionID);
            const targetPath =
              input && typeof input === 'object' && typeof input.path === 'string' && input.path.trim()
                ? path.resolve(sessionDir, input.path.trim())
                : sessionDir;
            const report = validateKernel(targetPath);
            return {
              content: JSON.stringify(report, null, 2),
            };
          },
        });
      });
    }

    // 5. Hook: Session Orientation & Session Start Tracking (`ctx.session.hook("context")`)
    if (typeof ctx?.session?.hook === 'function') {
      await ctx.session.hook('context', async (event) => {
        const sessionID = event?.sessionID;
        const sessionDir = await resolveSessionDirectory(sessionID);

        if (!isVaultDirectory(sessionDir)) {
          return;
        }

        let previousSessionJson = null;
        if (sessionID && !trackedSessions.has(sessionID)) {
          const tracked = await trackSessionStart(sessionDir, sessionID);
          previousSessionJson = tracked.previousSessionJson;
          trackedSessions.set(sessionID, previousSessionJson);
          invalidateOrientationCache(sessionDir);
        } else if (sessionID) {
          previousSessionJson = trackedSessions.get(sessionID) ?? null;
        }

        const cacheKey = normalizeComparePath(path.resolve(sessionDir));
        const now = Date.now();
        let orientationText = null;
        const cached = orientationCache.get(cacheKey);

        if (cached && cached.expiresAt > now) {
          orientationText = cached.text;
        } else {
          orientationText = buildOrientationContext(sessionDir, { previousSessionJson });
          orientationCache.set(cacheKey, {
            text: orientationText,
            expiresAt: now + ORIENTATION_CACHE_TTL_MS,
          });
        }

        if (orientationText && Array.isArray(event?.system)) {
          event.system.push({
            type: 'text',
            text: `<arscontexta_plugin root="${PACKAGE_ROOT_POSIX}" />\n${orientationText}`,
          });
        }
      });
    }

    // 6. Hook: Post-Write Schema Validation + Async Non-Blocking Auto-Commit (`ctx.tool.hook("execute.after")`)
    if (typeof ctx?.tool?.hook === 'function') {
      await ctx.tool.hook('execute.after', async (event) => {
        const sessionDir = await resolveSessionDirectory(event?.sessionID);
        const { vaultsTouched } = runWriteValidateOnToolEvent(event, sessionDir);

        for (const vaultRoot of vaultsTouched) {
          invalidateOrientationCache(vaultRoot);
          // Non-blocking background Git auto-commit (serialized per vault)
          void autoCommitVault(vaultRoot).catch(() => {});
        }
      });
    }

    // 7. Event Subscription: Session Capture on `session.idle` / `session.archived`
    const abortController = new AbortController();
    if (typeof ctx?.event?.subscribe === 'function') {
      void (async () => {
        try {
          const stream = ctx.event.subscribe({
            types: ['session.created', 'session.moved', 'session.idle', 'session.archived', 'session.deleted'],
            signal: abortController.signal,
          });

          for await (const ev of stream) {
            if (!ev || typeof ev !== 'object') continue;
            const sessionID = ev.data?.sessionID;
            const eventDir = ev.location?.directory;

            if ((ev.type === 'session.created' || ev.type === 'session.moved') && sessionID && eventDir) {
              sessionDirCache.set(sessionID, eventDir);
              continue;
            }

            if (ev.type === 'session.deleted' && sessionID) {
              sessionDirCache.delete(sessionID);
              trackedSessions.delete(sessionID);
              continue;
            }

            if ((ev.type === 'session.idle' || ev.type === 'session.archived') && sessionID) {
              const sessionDir = await resolveSessionDirectory(sessionID, eventDir);
              if (isVaultDirectory(sessionDir)) {
                const status = ev.type === 'session.archived' ? 'archived' : 'completed';
                await captureSessionState(sessionDir, sessionID, { status });
                invalidateOrientationCache(sessionDir);
              }
            }
          }
        } catch {
          // Stream aborted on plugin unload or closed cleanly
        }
      })();
    }

    return () => {
      abortController.abort();
      void flushVaultGitTasks();
    };
  },
};
