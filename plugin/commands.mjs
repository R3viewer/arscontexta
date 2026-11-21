/**
 * commands.mjs — Ars Contexta plugin-level commands (`/arscontexta:*`) and skill loaders.
 * Preloads the 10 plugin skills at setup time so OpenCode V2 synchronous transforms stay fast & repeatable.
 */

import fs from 'node:fs';
import path from 'node:path';

export const PLUGIN_COMMANDS_META = [
  { id: 'setup', name: 'Ars Contexta: Setup', description: 'Conversational onboarding — generate your complete knowledge system' },
  { id: 'help', name: 'Ars Contexta: Help', description: 'Contextual guidance and command discovery' },
  { id: 'tutorial', name: 'Ars Contexta: Tutorial', description: 'Interactive walkthrough — learn your knowledge system by doing' },
  { id: 'ask', name: 'Ars Contexta: Ask', description: 'Query the 249-claim research graph for methodology answers' },
  { id: 'health', name: 'Ars Contexta: Health', description: 'Run diagnostic and kernel checks on your vault' },
  { id: 'recommend', name: 'Ars Contexta: Recommend', description: 'Get architecture advice for your use case' },
  { id: 'architect', name: 'Ars Contexta: Architect', description: 'Research-backed evolution guidance' },
  { id: 'add-domain', name: 'Ars Contexta: Add Domain', description: 'Add a new knowledge domain to an existing system' },
  { id: 'reseed', name: 'Ars Contexta: Reseed', description: 'Re-derive from first principles when drift accumulates' },
  { id: 'upgrade', name: 'Ars Contexta: Upgrade', description: 'Apply plugin knowledge base updates to your system' },
];

/**
 * Strips YAML frontmatter (`--- ... ---`) from a Markdown document and extracts basic scalar fields.
 *
 * @param {string} raw
 * @returns {{ frontmatter: Record<string, string>, body: string }}
 */
export function parseSkillMarkdown(raw) {
  const normalized = raw.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { frontmatter: {}, body: normalized.trim() };
  }

  const endIdx = normalized.indexOf('\n---', 4);
  if (endIdx === -1) {
    return { frontmatter: {}, body: normalized.trim() };
  }

  const fmBlock = normalized.slice(4, endIdx);
  const body = normalized.slice(endIdx + 4).replace(/^\n+/, '').trim();
  /** @type {Record<string, string>} */
  const frontmatter = {};

  for (const line of fmBlock.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
    if (m) {
      frontmatter[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }

  return { frontmatter, body };
}

/**
 * Resolves plugin root placeholders in skill bodies to the actual on-disk package root.
 * Avoids referencing legacy env variable names literally by matching general plugin-root token pattern.
 *
 * @param {string} text
 * @param {string} packageRootPosix
 * @returns {string}
 */
export function resolvePluginRootTokens(text, packageRootPosix) {
  const header = `<arscontexta_plugin_paths>\nplugin_root: ${packageRootPosix}\nreference_dir: ${packageRootPosix}/reference\nmethodology_dir: ${packageRootPosix}/methodology\ngenerators_dir: ${packageRootPosix}/generators\nskill_sources_dir: ${packageRootPosix}/skill-sources\npresets_dir: ${packageRootPosix}/presets\n</arscontexta_plugin_paths>\n\n`;

  const replaced = text.replace(/\$\{[A-Z_]*PLUGIN_ROOT\}/g, packageRootPosix);
  return header + replaced;
}

/**
 * Expands `$ARGUMENTS` (and `$1`, `$2` positional placeholders) in a command template,
 * appending non-empty `argsText` at the end when no placeholder is present (OpenCode V2 convention).
 *
 * @param {string} templateBody
 * @param {string} argsText
 * @returns {string}
 */
export function expandCommandPrompt(templateBody, argsText) {
  const trimmedArgs = (argsText || '').trim();
  const hasArgumentsToken = templateBody.includes('$ARGUMENTS');

  if (hasArgumentsToken) {
    return templateBody.replaceAll('$ARGUMENTS', trimmedArgs);
  }

  if (trimmedArgs.length > 0) {
    return `${templateBody}\n\n${trimmedArgs}`;
  }

  return templateBody;
}

/**
 * Loads all bundled plugin skills from `<packageRoot>/skills/` into memory for synchronous transforms.
 *
 * @param {string} packageRoot
 * @returns {Array<{
 *   id: string,
 *   commandName: string,
 *   name: string,
 *   description: string,
 *   path: string,
 *   resolvedBody: string
 * }>}
 */
export function loadBundledPluginSkills(packageRoot) {
  const packageRootPosix = path.resolve(packageRoot).replace(/\\/g, '/');
  const loaded = [];

  for (const meta of PLUGIN_COMMANDS_META) {
    const skillPath = path.resolve(packageRoot, 'skills', meta.id, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;

    let raw;
    try {
      raw = fs.readFileSync(skillPath, 'utf8');
    } catch {
      continue;
    }

    const { frontmatter, body } = parseSkillMarkdown(raw);
    const resolvedBody = resolvePluginRootTokens(body, packageRootPosix);

    loaded.push({
      id: meta.id,
      commandName: `arscontexta:${meta.id}`,
      name: meta.name || frontmatter.name || meta.id,
      description: meta.description || frontmatter.description || `Ars Contexta ${meta.id}`,
      path: skillPath,
      resolvedBody,
    });
  }

  return loaded;
}
