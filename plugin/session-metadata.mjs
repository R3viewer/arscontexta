/**
 * Shared helpers for filtering and interpreting `ops/sessions/*.json` metadata
 * across both the OpenCode plugin hooks and the OpenChamber panel client.
 */

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isSessionMetadataFile(name) {
  return name.endsWith('.json') && name !== 'current.json';
}

/**
 * @param {string | null | undefined} raw
 * @returns {Record<string, unknown> | null}
 */
export function parseSessionMetadata(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} record
 * @returns {boolean}
 */
export function isUnprocessedArchivedSession(record) {
  return Boolean(record && record.status === 'archived' && record.mined !== true);
}
