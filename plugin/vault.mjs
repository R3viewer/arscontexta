/**
 * vault.mjs — Ars Contexta vault detection, legacy marker migration, config & vocabulary resolution.
 * Replaces hooks/scripts/vaultguard.sh and hooks/scripts/read_config.sh in pure cross-platform Node ESM.
 */

import fs from 'node:fs';
import path from 'node:path';

export const VAULT_MARKER = '.arscontexta';

const DEFAULT_MARKER_CONTENT = `# Ars Contexta vault marker + config
# This file identifies the directory as an Ars Contexta vault.
# Do not delete — plugin hooks only run when this file exists.

git: true
session_capture: true
`;

const KNOWN_NOTES_DIRS = [
  'notes',
  '01_thinking',
  'thinking',
  'reflections',
  'claims',
  'decisions',
  'concepts',
  'ideas',
  'memories',
  'knowledge',
];

const KNOWN_INBOX_DIRS = [
  'inbox',
  '00_inbox',
  'captures',
  'journal',
  'encounters',
];

/**
 * Checks whether `dir` is an Ars Contexta vault root.
 * Performs automatic migration from legacy cat-face `.arscontexta` or `ops/config.yaml` / `ops/derivation-manifest.md`.
 * Never triggers on the Ars Contexta plugin repository itself.
 *
 * @param {string} dir
 * @returns {boolean}
 */
export function isVaultDirectory(dir) {
  if (!dir) return false;
  const resolved = path.resolve(dir);
  if (!fs.existsSync(resolved)) return false;

  const markerPath = path.join(resolved, VAULT_MARKER);
  if (fs.existsSync(markerPath)) {
    try {
      const content = fs.readFileSync(markerPath, 'utf8');
      if (content.includes('(^.^)')) {
        fs.writeFileSync(markerPath, DEFAULT_MARKER_CONTENT, 'utf8');
      }
      return true;
    } catch {
      return true;
    }
  }

  // Fallback legacy vault detection + auto-migration
  const hasOpsConfig = fs.existsSync(path.join(resolved, 'ops', 'config.yaml'));
  const hasDerivationManifest = fs.existsSync(path.join(resolved, 'ops', 'derivation-manifest.md')) ||
                                fs.existsSync(path.join(resolved, 'ops', 'derivation.md'));

  if (hasOpsConfig || hasDerivationManifest) {
    try {
      fs.writeFileSync(markerPath, DEFAULT_MARKER_CONTENT, 'utf8');
    } catch {
      // Read-only filesystem fallback: still recognize as vault
    }
    return true;
  }

  return false;
}

/**
 * Walks up from `targetPath` (file or directory) to `boundaryDir` (optional) looking for an Ars Contexta vault root.
 *
 * @param {string} targetPath
 * @param {string} [boundaryDir]
 * @returns {string | null} Resolved vault root path, or null if not inside a vault.
 */
export function findVaultRoot(targetPath, boundaryDir) {
  if (!targetPath) return null;
  let current = path.resolve(targetPath);
  try {
    if (fs.existsSync(current) && fs.statSync(current).isFile()) {
      current = path.dirname(current);
    }
  } catch {
    current = path.dirname(current);
  }

  const normalizedBoundary = boundaryDir ? normalizeComparePath(path.resolve(boundaryDir)) : null;

  while (true) {
    if (isVaultDirectory(current)) {
      return current;
    }
    if (normalizedBoundary && normalizeComparePath(current) === normalizedBoundary) {
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    // If boundaryDir was provided and current is not even inside boundaryDir, do not walk up forever
    if (normalizedBoundary && !normalizeComparePath(current).startsWith(normalizedBoundary + '/')) {
      break;
    }
    current = parent;
  }

  return null;
}

export function normalizeComparePath(p) {
  const normalized = p.replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/**
 * Reads a top-level scalar YAML key from `.arscontexta` (falling back to `ops/config.yaml` and `defaultValue`).
 *
 * @param {string} vaultDir
 * @param {string} key
 * @param {string} [defaultValue='true']
 * @returns {string}
 */
export function readVaultConfig(vaultDir, key, defaultValue = 'true') {
  if (!vaultDir || !key) return defaultValue;
  const resolved = path.resolve(vaultDir);

  const candidates = [
    path.join(resolved, VAULT_MARKER),
    path.join(resolved, 'ops', 'config.yaml'),
  ];

  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lineRegex = new RegExp(`^${escapedKey}:\\s*(.+?)\\s*$`, 'm');

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const match = content.match(lineRegex);
      if (match && match[1]) {
        const raw = match[1]
          .replace(/\s+#.*$/, '')
          .trim()
          .replace(/^["']|["']$/g, '');
        if (raw.length > 0) return raw;
      }
    } catch {
      // Ignore read errors
    }
  }

  return defaultValue;
}

/**
 * Extracts domain folder names and domain command names from `ops/derivation-manifest.md` (if available)
 * or falls back to existing directories / universal Ars Contexta defaults.
 *
 * @param {string} vaultDir
 * @returns {{
 *   notesDir: string,
 *   inboxDir: string,
 *   allNoteDirs: string[],
 *   vocabulary: { note: string, topicMap: string, reduce: string, reflect: string, rethink: string, remember: string }
 * }}
 */
export function resolveVaultStructure(vaultDir) {
  const resolved = path.resolve(vaultDir);
  let notesDir = null;
  let inboxDir = null;

  const vocabulary = {
    note: 'note',
    topicMap: 'MOC',
    reduce: 'reduce',
    reflect: 'reflect',
    rethink: 'rethink',
    remember: 'remember',
  };

  const manifestCandidates = [
    path.join(resolved, 'ops', 'derivation-manifest.md'),
    path.join(resolved, 'ops', 'derivation.md'),
  ];

  for (const mf of manifestCandidates) {
    if (!fs.existsSync(mf)) continue;
    try {
      const text = fs.readFileSync(mf, 'utf8');
      const notesMatch = text.match(/^(?:notes_folder|notes_dir|notes):\s*["']?([A-Za-z0-9_-]+)\/?["']?/m);
      if (notesMatch?.[1]) notesDir = notesMatch[1];

      const inboxMatch = text.match(/^(?:inbox_folder|inbox_dir|inbox):\s*["']?([A-Za-z0-9_-]+)\/?["']?/m);
      if (inboxMatch?.[1]) inboxDir = inboxMatch[1];

      for (const key of ['note', 'reduce', 'reflect', 'rethink', 'remember']) {
        const vMatch = text.match(new RegExp(`^\\s*${key}:\\s*["']?([A-Za-z0-9_\\s-]+)["']?\\s*$`, 'm'));
        if (vMatch?.[1]) vocabulary[key] = vMatch[1].trim();
      }
      const tmMatch = text.match(/^\s*(?:topic_map|moc):\s*["']?([A-Za-z0-9_\s-]+)["']?\s*$/m);
      if (tmMatch?.[1]) vocabulary.topicMap = tmMatch[1].trim();
      break;
    } catch {
      // Ignore parse errors
    }
  }

  const configuredNotes = readVaultConfig(resolved, 'notes_dir', '');
  if (!notesDir && configuredNotes) notesDir = configuredNotes;

  const configuredInbox = readVaultConfig(resolved, 'inbox_dir', '');
  if (!inboxDir && configuredInbox) inboxDir = configuredInbox;

  const existingNotesDirs = KNOWN_NOTES_DIRS.filter((d) => {
    const p = path.join(resolved, d);
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  });

  if (!notesDir) {
    notesDir = existingNotesDirs[0] || 'notes';
  }
  if (!existingNotesDirs.includes(notesDir)) {
    existingNotesDirs.unshift(notesDir);
  }

  if (!inboxDir) {
    inboxDir = KNOWN_INBOX_DIRS.find((d) => {
      const p = path.join(resolved, d);
      return fs.existsSync(p) && fs.statSync(p).isDirectory();
    }) || 'inbox';
  }

  return {
    notesDir,
    inboxDir,
    allNoteDirs: existingNotesDirs,
    vocabulary,
  };
}
