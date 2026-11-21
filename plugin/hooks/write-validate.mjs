/**
 * write-validate.mjs — Ars Contexta Schema Enforcement Hook.
 * Native cross-platform Node ESM replacement for hooks/scripts/write-validate.sh.
 *
 * Runs on `tool.hook("execute.after")` for file mutation tools (`write`, `edit`, `patch`, `apply_patch`, `multiedit`).
 * Non-blocking: warns via tool result output so capture speed stays fast while guiding immediate correction.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findVaultRoot, normalizeComparePath, resolveVaultStructure } from '../vault.mjs';

export const WRITE_TOOL_NAMES = new Set([
  'write',
  'edit',
  'patch',
  'apply_patch',
  'multiedit',
]);

/**
 * Normalizes a potentially relative or `file://` path against `baseDir`.
 *
 * @param {string} rawPath
 * @param {string} baseDir
 * @returns {string | null}
 */
export function resolveToolFilePath(rawPath, baseDir) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  let cleaned = rawPath.trim();
  if (!cleaned) return null;

  if (cleaned.startsWith('file://')) {
    try {
      cleaned = fileURLToPath(cleaned);
    } catch {
      return null;
    }
  }

  return path.isAbsolute(cleaned) ? path.resolve(cleaned) : path.resolve(baseDir || '.', cleaned);
}

/**
 * Extracts all target file paths from a tool's `input` payload across `write`, `edit`, `patch`, `apply_patch`.
 *
 * @param {unknown} input
 * @param {string} baseDir
 * @returns {string[]}
 */
export function extractModifiedFiles(input, baseDir) {
  if (!input || typeof input !== 'object') return [];
  const obj = /** @type {Record<string, unknown>} */ (input);
  const candidates = new Set();

  for (const key of ['path', 'filePath', 'file_path']) {
    if (typeof obj[key] === 'string') {
      const resolved = resolveToolFilePath(obj[key], baseDir);
      if (resolved) candidates.add(resolved);
    }
  }

  if (Array.isArray(obj.edits)) {
    for (const edit of obj.edits) {
      if (edit && typeof edit === 'object') {
        const p = edit.path || edit.filePath || edit.file_path;
        if (typeof p === 'string') {
          const resolved = resolveToolFilePath(p, baseDir);
          if (resolved) candidates.add(resolved);
        }
      }
    }
  }

  // Parse unified / OpenCode apply_patch headers (`*** Add File: ...`, `*** Update File: ...`)
  const patchText = typeof obj.patchText === 'string' ? obj.patchText : typeof obj.patch === 'string' ? obj.patch : null;
  if (patchText) {
    const headerRe = /^\*\*\*\s+(?:Add|Update)\s+File:\s+(.+?)\s*$/gm;
    let match;
    while ((match = headerRe.exec(patchText)) !== null) {
      const resolved = resolveToolFilePath(match[1], baseDir);
      if (resolved) candidates.add(resolved);
    }
  }

  return [...candidates];
}

/**
 * Checks whether `filePath` is a markdown note inside the vault's knowledge space (e.g., `notes/`, `01_thinking/`, `reflections/`).
 * Excludes operational directories (`ops/`, `inbox/`, `self/`, `templates/`, `.opencode/`) and root docs.
 *
 * @param {string} filePath
 * @param {string} vaultDir
 * @returns {boolean}
 */
export function isKnowledgeNoteFile(filePath, vaultDir) {
  if (!filePath.toLowerCase().endsWith('.md')) return false;
  const baseName = path.basename(filePath).toLowerCase();
  if (baseName === 'readme.md' || baseName === 'agents.md' || baseName === 'claude.md' || baseName === 'skill.md') {
    return false;
  }

  const normVault = normalizeComparePath(path.resolve(vaultDir));
  const normFile = normalizeComparePath(path.resolve(filePath));
  if (!normFile.startsWith(normVault + '/')) return false;

  const rel = normFile.slice(normVault.length + 1);
  const firstSeg = rel.split('/')[0];

  const { allNoteDirs } = resolveVaultStructure(vaultDir);
  const allowedFirstSegments = new Set(allNoteDirs.map((d) => normalizeComparePath(d)));

  return allowedFirstSegments.has(firstSeg);
}

/**
 * Validates a single markdown note file against Ars Contexta kernel schema rules.
 *
 * @param {string} filePath
 * @param {string} vaultDir
 * @returns {{ valid: boolean, warnings: string[], notes: string[] }}
 */
export function validateNoteFile(filePath, vaultDir) {
  const warnings = [];
  const notes = [];

  if (!fs.existsSync(filePath)) {
    return { valid: true, warnings, notes };
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { valid: true, warnings, notes };
  }

  const { vocabulary } = resolveVaultStructure(vaultDir);
  const fileName = path.basename(filePath);

  // 1. YAML frontmatter check
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    warnings.push(
      `Missing YAML frontmatter in ${fileName}. Every ${vocabulary.note} needs frontmatter with at least description and topics.`
    );
    return { valid: false, warnings, notes };
  }

  const closingIdx = normalized.indexOf('\n---', 4);
  if (closingIdx === -1) {
    warnings.push(`Unclosed YAML frontmatter block in ${fileName}.`);
    return { valid: false, warnings, notes };
  }

  const frontmatter = normalized.slice(4, closingIdx);
  const body = normalized.slice(closingIdx + 4);
  const isMoc = /^type:\s*["']?moc["']?\s*$/m.test(frontmatter);

  // 2. Required field: description
  const descMatch = frontmatter.match(/^description:\s*(.*)$/m);
  if (!descMatch || !descMatch[1].trim()) {
    warnings.push(
      `Missing 'description' field in ${fileName}. Add a ~100-200 character summary adding context beyond the title.`
    );
  } else {
    const cleanDesc = descMatch[1].trim().replace(/^["']|["']$/g, '');
    if (cleanDesc.length > 0 && cleanDesc.length < 20) {
      warnings.push(
        `Description in ${fileName} is very short (${cleanDesc.length} chars). Aim for ~100-200 chars adding mechanism or implication beyond the title.`
      );
    }
  }

  // 3. Required field: topics (or domain equivalent e.g. themes / areas, or Topics: footer)
  const hasTopicsYaml = /^(?:topics|themes|areas|domains):\s*/m.test(frontmatter);
  const hasTopicsFooter = /^Topics:/m.test(body);

  if (!hasTopicsYaml && !hasTopicsFooter && !isMoc) {
    warnings.push(
      `Missing 'topics' field in ${fileName}. Every ${vocabulary.note} must link up to at least one ${vocabulary.topicMap} (e.g., topics: ["[[index]]"]).`
    );
  }

  // 4. Title convention note (ALL-CAPS check)
  const headingMatch = body.match(/^#\s+(.+)$/m);
  if (headingMatch && /^[A-Z]{2,}\s+[A-Z]{2,}/.test(headingMatch[1].trim())) {
    notes.push(`Title in ${fileName} uses ALL-CAPS; prefer prose-as-title propositions.`);
  }

  // 5. Discovery nudge for zero wiki links
  if (!normalized.includes('[[') && !isMoc) {
    notes.push(`${fileName} has no [[wiki links]]. Consider running /${vocabulary.reflect} to connect it to existing notes.`);
  }

  return {
    valid: warnings.length === 0,
    warnings,
    notes,
  };
}

/**
 * Appends validation messages non-destructively to an OpenCode V2 tool execution `result`.
 * Handles both string `content` and array `Tool.Content[]` (`{ type: "text", text }`).
 *
 * @param {Record<string, unknown>} result
 * @param {string} feedbackText
 * @returns {Record<string, unknown>}
 */
export function appendValidationToToolResult(result, feedbackText) {
  if (!result || typeof result !== 'object' || !feedbackText) return result;

  const existingMeta =
    result.metadata && typeof result.metadata === 'object' ? result.metadata : {};
  const nextMeta = { ...existingMeta, arscontextaSchemaWarning: feedbackText };

  if (typeof result.content === 'string') {
    return {
      ...result,
      content: `${result.content}\n\n${feedbackText}`,
      metadata: nextMeta,
    };
  }

  if (Array.isArray(result.content)) {
    return {
      ...result,
      content: [...result.content, { type: 'text', text: `\n${feedbackText}` }],
      metadata: nextMeta,
    };
  }

  if (typeof result.output === 'string') {
    return {
      ...result,
      output: `${result.output}\n\n${feedbackText}`,
      metadata: nextMeta,
    };
  }

  return {
    ...result,
    content: feedbackText,
    metadata: nextMeta,
  };
}

/**
 * Evaluates a completed tool execution event and returns schema feedback + affected vault roots.
 *
 * @param {{ tool: string, input: unknown, status?: string, result?: Record<string, unknown> }} event
 * @param {string} sessionDir
 * @returns {{ vaultsTouched: Set<string>, feedbackText: string | null }}
 */
export function runWriteValidateOnToolEvent(event, sessionDir) {
  const vaultsTouched = new Set();
  if (!event || (event.status && event.status !== 'completed')) {
    return { vaultsTouched, feedbackText: null };
  }

  const toolName = String(event.tool || '').toLowerCase();
  if (!WRITE_TOOL_NAMES.has(toolName)) {
    return { vaultsTouched, feedbackText: null };
  }

  const modifiedFiles = extractModifiedFiles(event.input, sessionDir);
  const feedbackLines = [];

  for (const filePath of modifiedFiles) {
    const vaultRoot = findVaultRoot(filePath, sessionDir) || findVaultRoot(filePath);
    if (!vaultRoot) continue;
    vaultsTouched.add(vaultRoot);

    if (!isKnowledgeNoteFile(filePath, vaultRoot)) continue;

    const { warnings, notes } = validateNoteFile(filePath, vaultRoot);
    for (const w of warnings) {
      feedbackLines.push(`[Ars Contexta Schema Warning] ${w}`);
    }
    for (const n of notes) {
      feedbackLines.push(`[Ars Contexta Discovery Note] ${n}`);
    }
  }

  const feedbackText = feedbackLines.length > 0 ? feedbackLines.join('\n') : null;
  if (feedbackText && event.result && typeof event.result === 'object') {
    event.result = appendValidationToToolResult(event.result, feedbackText);
  }

  return { vaultsTouched, feedbackText };
}
