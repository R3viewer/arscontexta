/**
 * session-orient.mjs — Ars Contexta Session Orientation & Session Start Tracking Hook.
 * Native cross-platform Node ESM replacement for hooks/scripts/session-orient.sh.
 *
 * Responsibilities:
 * 1. Track session start in `ops/sessions/current.json` (promoting any prior session to archive).
 * 2. Build the orientation briefing:
 *    - Workspace file tree (up to 3 levels, zero `tree` binary dependency)
 *    - Previous session context (continuity handoff)
 *    - Persistent working memory (`self/goals.md` or `ops/goals.md`)
 *    - Identity & methodology (`self/identity.md`, `self/methodology.md`)
 *    - Recent methodology learnings (`ops/methodology/*.md`)
 *    - Condition-based maintenance signals (observations, tensions, unprocessed sessions, inbox, orphans, staleness)
 *    - Queue summary (`ops/queue/queue.json` or `ops/queue/queue.yaml` or `ops/queue.yaml`)
 */

import fs from 'node:fs';
import path from 'node:path';
import { isVaultDirectory, readVaultConfig, resolveVaultStructure } from '../vault.mjs';
import { enqueueVaultGitTask, isGitWorkTree, runGit } from '../git-queue.mjs';
import {
  isSessionMetadataFile,
  isUnprocessedArchivedSession,
  parseSessionMetadata,
} from '../session-metadata.mjs';

const SKIP_DIRS = new Set(['.git', 'node_modules']);
const TREE_EXTENSIONS = new Set(['.md', '.yaml', '.yml', '.json', '.jsonc']);

/**
 * Formats a UTC timestamp as YYYYMMDD-HHMMSS (matching Ars Contexta session archive naming).
 *
 * @param {Date} [date]
 * @returns {string}
 */
export function formatSessionTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

/**
 * Builds an ASCII workspace tree up to `maxDepth` levels deep for relevant vault files.
 *
 * @param {string} rootDir
 * @param {number} [maxDepth=3]
 * @returns {string}
 */
export function buildWorkspaceTree(rootDir, maxDepth = 3) {
  const lines = ['.'];

  function walk(currentDir, prefix, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    // Filter to relevant files & directories containing relevant files
    const filtered = entries
      .filter((e) => {
        if (SKIP_DIRS.has(e.name)) return false;
        // Skip noisy session archive internals in tree output
        const rel = path.relative(rootDir, path.join(currentDir, e.name)).replace(/\\/g, '/');
        if (rel.startsWith('ops/sessions/') && e.name !== 'current.json') return false;
        if (e.isDirectory()) return true;
        if (e.isFile()) {
          const ext = path.extname(e.name).toLowerCase();
          return TREE_EXTENSIONS.has(ext) || e.name === '.arscontexta';
        }
        return false;
      })
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    for (let i = 0; i < filtered.length; i++) {
      const entry = filtered[i];
      const isLast = i === filtered.length - 1;
      const connector = isLast ? '+-- ' : '|-- ';
      const nextPrefix = prefix + (isLast ? '    ' : '|   ');
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        lines.push(`${prefix}${connector}${entry.name}/`);
        if (depth < maxDepth) {
          walk(fullPath, nextPrefix, depth + 1);
        }
      } else {
        lines.push(`${prefix}${connector}${entry.name}`);
      }
    }
  }

  walk(rootDir, '', 1);
  return lines.join('\n');
}

function readSafe(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  } catch {
    return null;
  }
}

function listMdFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  try {
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name.toLowerCase() !== 'readme.md')
      .map((e) => path.join(dirPath, e.name));
  } catch {
    return [];
  }
}

/**
 * Records session start in `ops/sessions/current.json`, archiving any previous session with a different ID.
 * Returns the previous session JSON text (if one existed before promotion) for continuity injection.
 *
 * @param {string} vaultDir
 * @param {string} sessionID
 * @returns {Promise<{ previousSessionJson: string | null, committedPromise: Promise<void> | null }>}
 */
export async function trackSessionStart(vaultDir, sessionID) {
  const resolvedVault = path.resolve(vaultDir);
  if (!sessionID || !isVaultDirectory(resolvedVault)) {
    return { previousSessionJson: null, committedPromise: null };
  }

  const currentPath = path.join(resolvedVault, 'ops', 'sessions', 'current.json');
  const existingRaw = readSafe(currentPath);

  if (readVaultConfig(resolvedVault, 'session_capture', 'true') !== 'true') {
    return { previousSessionJson: existingRaw, committedPromise: null };
  }

  const sessionsDir = path.join(resolvedVault, 'ops', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });

  const now = new Date();
  const timestamp = formatSessionTimestamp(now);
  let previousSessionJson = null;

  if (existingRaw) {
    try {
      const parsed = JSON.parse(existingRaw);
      if (parsed && parsed.id && parsed.id !== sessionID) {
        previousSessionJson = existingRaw.trim();
        const archiveBase = String(parsed.started || timestamp).replace(/[^A-Za-z0-9_-]/g, '-');
        let archivePath = path.join(sessionsDir, `${archiveBase}.json`);
        if (fs.existsSync(archivePath)) {
          archivePath = path.join(sessionsDir, `${archiveBase}-${parsed.id.slice(-6)}.json`);
        }
        fs.renameSync(currentPath, archivePath);
      } else if (parsed && parsed.id === sessionID) {
        // Already tracking this exact session; do not overwrite started timestamp
        return { previousSessionJson: null, committedPromise: null };
      }
    } catch {
      previousSessionJson = existingRaw.trim();
    }
  }

  const currentRecord = {
    id: sessionID,
    started: timestamp,
    startedIso: now.toISOString(),
    status: 'active',
  };
  fs.writeFileSync(currentPath, JSON.stringify(currentRecord, null, 2) + '\n', 'utf8');

  let committedPromise = null;
  if (readVaultConfig(resolvedVault, 'git', 'true') === 'true') {
    committedPromise = enqueueVaultGitTask(resolvedVault, async () => {
      if (!(await isGitWorkTree(resolvedVault))) return;
      const toAdd = ['ops/sessions'];
      if (fs.existsSync(path.join(resolvedVault, 'self', 'goals.md'))) toAdd.push('self/goals.md');
      if (fs.existsSync(path.join(resolvedVault, 'ops', 'goals.md'))) toAdd.push('ops/goals.md');
      await runGit(resolvedVault, ['add', '--', ...toAdd]);
      const diffCheck = await runGit(resolvedVault, ['diff', '--cached', '--quiet']);
      if (!diffCheck.ok) {
        await runGit(resolvedVault, ['commit', '-m', `Session start: ${timestamp}`, '--quiet', '--no-verify']);
      }
    });
  }

  return { previousSessionJson, committedPromise };
}

/**
 * Summarizes queue counts from `ops/queue/queue.json`, `ops/queue/queue.yaml`, or `ops/queue.yaml`.
 *
 * @param {string} vaultDir
 * @returns {{ pipelinePending: number, maintenancePending: number } | null}
 */
export function summarizeQueue(vaultDir) {
  const jsonCandidates = [
    path.join(vaultDir, 'ops', 'queue', 'queue.json'),
    path.join(vaultDir, 'ops', 'queue.json'),
  ];
  for (const jf of jsonCandidates) {
    const raw = readSafe(jf);
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      const tasks = Array.isArray(data?.tasks) ? data.tasks : Array.isArray(data) ? data : [];
      let pipelinePending = 0;
      let maintenancePending = 0;
      for (const t of tasks) {
        const isDone = t.status === 'done' || t.status === 'completed' || t.current_phase === 'done';
        if (isDone) continue;
        if (t.type === 'maintenance') maintenancePending++;
        else pipelinePending++;
      }
      return { pipelinePending, maintenancePending };
    } catch {
      // Ignore malformed JSON
    }
  }

  const yamlCandidates = [
    path.join(vaultDir, 'ops', 'queue', 'queue.yaml'),
    path.join(vaultDir, 'ops', 'queue.yaml'),
  ];
  for (const yf of yamlCandidates) {
    const raw = readSafe(yf);
    if (!raw) continue;
    // Lightweight line-based scan for YAML task blocks
    const blocks = raw.split(/\n\s*-\s+id:/).slice(1);
    let pipelinePending = 0;
    let maintenancePending = 0;
    for (const block of blocks) {
      if (/status:\s*(?:done|completed)/i.test(block) || /current_phase:\s*done/i.test(block)) continue;
      if (/type:\s*maintenance/i.test(block)) maintenancePending++;
      else pipelinePending++;
    }
    return { pipelinePending, maintenancePending };
  }

  return null;
}

/**
 * Generates the complete Markdown orientation block for an Ars Contexta vault.
 *
 * @param {string} vaultDir
 * @param {{ previousSessionJson?: string | null }} [options]
 * @returns {string | null}
 */
export function buildOrientationContext(vaultDir, options = {}) {
  const resolvedVault = path.resolve(vaultDir);
  if (!isVaultDirectory(resolvedVault)) return null;

  const { notesDir, inboxDir, vocabulary } = resolveVaultStructure(resolvedVault);
  const sections = ['<arscontexta_orientation>'];

  // 1. Workspace Structure
  sections.push('## Workspace Structure\n\n```text\n' + buildWorkspaceTree(resolvedVault, 3) + '\n```');

  // 2. Previous Session Context
  const prevJson = options.previousSessionJson ?? readSafe(path.join(resolvedVault, 'ops', 'sessions', 'current.json'));
  if (prevJson && prevJson.trim()) {
    sections.push('## Previous Session Context\n\n```json\n' + prevJson.trim() + '\n```');
  }

  // 3. Persistent Working Memory (Goals)
  const selfGoals = readSafe(path.join(resolvedVault, 'self', 'goals.md'));
  const opsGoals = readSafe(path.join(resolvedVault, 'ops', 'goals.md'));
  if (selfGoals) {
    sections.push('## Current Goals (self/goals.md)\n\n' + selfGoals.trim());
  } else if (opsGoals) {
    sections.push('## Current Goals (ops/goals.md)\n\n' + opsGoals.trim());
  }

  // 4. Identity & Self Methodology (when self/ space is enabled)
  const identityMd = readSafe(path.join(resolvedVault, 'self', 'identity.md'));
  const selfMethMd = readSafe(path.join(resolvedVault, 'self', 'methodology.md'));
  if (identityMd) {
    sections.push('## Identity (self/identity.md)\n\n' + identityMd.trim());
  }
  if (selfMethMd) {
    sections.push('## Self Methodology (self/methodology.md)\n\n' + selfMethMd.trim());
  }

  // 5. Recent Methodology Learnings (ops/methodology/*.md, newest 5 excluding MOC)
  const methDir = path.join(resolvedVault, 'ops', 'methodology');
  const methFiles = listMdFiles(methDir)
    .filter((f) => path.basename(f).toLowerCase() !== 'methodology.md')
    .map((f) => ({ file: f, mtimeMs: fs.statSync(f).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 5);

  if (methFiles.length > 0) {
    const bullets = [];
    for (const { file } of methFiles) {
      const text = readSafe(file) || '';
      const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(file, '.md');
      bullets.push(`- ${heading}`);
    }
    sections.push('## Recent Methodology Learnings\n\n' + bullets.join('\n'));
  }

  // 6. Condition-Based Maintenance Signals
  const signals = [];
  const obsThreshold = Number.parseInt(readVaultConfig(resolvedVault, 'obs_threshold', '10'), 10) || 10;
  const tensThreshold = Number.parseInt(readVaultConfig(resolvedVault, 'tension_threshold', '5'), 10) || 5;

  const obsFiles = listMdFiles(path.join(resolvedVault, 'ops', 'observations'));
  const pendingObs = obsFiles.filter((f) => {
    const t = readSafe(f) || '';
    return !/^status:\s*(?:resolved|promoted|archived|dismissed)/m.test(t);
  }).length;
  if (pendingObs >= obsThreshold) {
    signals.push(`CONDITION: ${pendingObs} pending observations. Consider /${vocabulary.rethink}.`);
  }

  const tensFiles = listMdFiles(path.join(resolvedVault, 'ops', 'tensions'));
  const openTens = tensFiles.filter((f) => {
    const t = readSafe(f) || '';
    return !/^status:\s*(?:resolved|archived|closed)/m.test(t);
  }).length;
  if (openTens >= tensThreshold) {
    signals.push(`CONDITION: ${openTens} unresolved tensions. Consider /${vocabulary.rethink}.`);
  }

  const sessionsDir = path.join(resolvedVault, 'ops', 'sessions');
  if (fs.existsSync(sessionsDir)) {
    try {
      const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
      let unprocessedSessions = 0;
      for (const entry of entries) {
        if (!entry.isFile() || !isSessionMetadataFile(entry.name)) continue;
        const parsed = parseSessionMetadata(readSafe(path.join(sessionsDir, entry.name)));
        if (isUnprocessedArchivedSession(parsed)) unprocessedSessions++;
      }
      if (unprocessedSessions >= 5) {
        signals.push(`CONDITION: ${unprocessedSessions} unprocessed sessions. Consider /${vocabulary.remember} --mine-sessions.`);
      }
    } catch {
      // Ignore
    }
  }

  const inboxFiles = listMdFiles(path.join(resolvedVault, inboxDir));
  if (inboxFiles.length >= 3) {
    signals.push(`CONDITION: ${inboxFiles.length} items in ${inboxDir}/. Consider /${vocabulary.reduce} or /pipeline.`);
  }

  // Orphan check in notesDir
  const notesPath = path.join(resolvedVault, notesDir);
  const noteFiles = listMdFiles(notesPath);
  if (noteFiles.length > 0 && noteFiles.length <= 500) {
    const incomingTargets = new Set();
    const linkRe = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
    const nonMocTitles = [];

    for (const nf of noteFiles) {
      const text = readSafe(nf) || '';
      const title = path.basename(nf, '.md');
      if (!/^type:\s*["']?moc["']?/m.test(text)) {
        nonMocTitles.push(title);
      }
      let match;
      while ((match = linkRe.exec(text)) !== null) {
        incomingTargets.add(path.basename(match[1].trim(), '.md'));
      }
    }

    const orphanCount = nonMocTitles.filter((t) => !incomingTargets.has(t)).length;
    if (orphanCount > 0) {
      signals.push(`CONDITION: ${orphanCount} orphan notes (no incoming links). Consider /${vocabulary.reflect}.`);
    }
  }

  // Tutorial state check
  const tutorialRaw = readSafe(path.join(resolvedVault, 'ops', 'tutorial-state.yaml'));
  if (tutorialRaw) {
    const stepMatch = tutorialRaw.match(/^current_step:\s*(\d+)/m);
    const step = stepMatch ? Number.parseInt(stepMatch[1], 10) : NaN;
    if (!Number.isNaN(step) && step <= 5) {
      signals.push(`NOTE: Unfinished tutorial (step ${step} of 5). Resume with /arscontexta:tutorial.`);
    }
  }

  // Methodology staleness check (Rule Zero)
  const opsConfigPath = path.join(resolvedVault, 'ops', 'config.yaml');
  if (fs.existsSync(opsConfigPath) && methFiles.length > 0) {
    const configMtime = fs.statSync(opsConfigPath).mtimeMs;
    const newestMethMtime = methFiles[0].mtimeMs;
    const daysStale = Math.floor((configMtime - newestMethMtime) / (86400 * 1000));
    if (daysStale >= 30) {
      signals.push(`CONDITION: Methodology notes are ${daysStale}+ days behind config changes. Consider /${vocabulary.rethink} drift.`);
    }
  }

  if (signals.length > 0) {
    sections.push('## Maintenance Signals\n\n' + signals.join('\n'));
  }

  // 7. Queue Summary
  const queue = summarizeQueue(resolvedVault);
  if (queue && (queue.pipelinePending > 0 || queue.maintenancePending > 0)) {
    sections.push(
      `## Queue\n\nPipeline: ${queue.pipelinePending} pending | Maintenance: ${queue.maintenancePending} pending\nRun /next for recommendations.`
    );
  }

  sections.push('</arscontexta_orientation>');
  return sections.join('\n\n');
}
