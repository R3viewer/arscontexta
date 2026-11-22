import { HostRequestError, type AttachIssueRequest, type HostClient, type JsonValue } from '@openchamber/sdk';
import { mountBadge, mountPopoverAnchor, type Handle } from '@openchamber/sdk/ui';

export interface VaultVocabulary {
  note: string;
  topicMap: string;
  reduce: string;
  reflect: string;
  rethink: string;
  remember: string;
}

export interface VaultQueueTask {
  id: string;
  phase: string;
  target: string;
  batch: string;
  type: string;
}

export interface VaultNoteSummary {
  id: string;
  path: string;
  title: string;
  description: string;
  isMoc: boolean;
}

export interface VaultFileEntry {
  name: string;
  path: string;
  title: string;
}

export interface VaultSignal {
  id: string;
  severity: 'warning' | 'info';
  label: string;
  command: string;
  buttonLabel: string;
}

export interface VaultSessionSummary {
  id: string;
  started: string;
  ended?: string;
  status: string;
}

export interface VaultSnapshot {
  isVault: boolean;
  notesDir: string;
  inboxDir: string;
  vocabulary: VaultVocabulary;
  notesCount: number;
  mocsCount: number;
  orphanCount: number;
  inboxItems: VaultFileEntry[];
  queue: {
    pipelinePending: number;
    maintenancePending: number;
    tasks: VaultQueueTask[];
  };
  observations: {
    total: number;
    pending: number;
    items: VaultFileEntry[];
  };
  tensions: {
    total: number;
    open: number;
    items: VaultFileEntry[];
  };
  unprocessedSessions: number;
  recentSessions: VaultSessionSummary[];
  signals: VaultSignal[];
  notesIndex: VaultNoteSummary[];
  lastHealthReport: { name: string; path: string } | null;
}

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

const MAX_NOTE_READS = 150;
const MAX_OPS_READS = 60;

async function readOptionalFile(host: HostClient, filePath: string): Promise<string | null> {
  try {
    const res = await host.readFile(filePath);
    return res.content;
  } catch (err) {
    if (err instanceof HostRequestError && err.code === 'NOT_FOUND') {
      return null;
    }
    return null;
  }
}

async function listOptionalDir(
  host: HostClient,
  dirPath: string
): Promise<Array<{ name: string; kind: 'file' | 'directory' | 'other' }>> {
  try {
    const res = await host.listDir(dirPath);
    return res.entries;
  } catch {
    return [];
  }
}

async function pathExists(host: HostClient, targetPath: string): Promise<'file' | 'directory' | null> {
  try {
    const res = await host.stat(targetPath);
    if (res.kind === 'file' || res.kind === 'directory') return res.kind;
    return null;
  } catch {
    return null;
  }
}

function readScalarConfig(raw: string | null, key: string): string | null {
  if (!raw) return null;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = raw.match(new RegExp(`^${escaped}:\\s*(.+?)\\s*$`, 'm'));
  if (!match?.[1]) return null;
  const cleaned = match[1].replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
  return cleaned.length > 0 ? cleaned : null;
}

function extractManifestField(text: string, fieldPattern: string): string | null {
  const re = new RegExp(`^\\s*(?:${fieldPattern}):\\s*["']?([^#"'\\r\\n]+)["']?`, 'm');
  const match = text.match(re);
  if (!match?.[1]) return null;
  const val = match[1].replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
  return val.length > 0 ? val : null;
}

function parseFrontmatter(content: string): {
  description: string;
  isMoc: boolean;
  status: string;
  title: string;
} {
  let description = '';
  let isMoc = false;
  let status = '';
  let bodyStart = 0;

  if (content.startsWith('---')) {
    const endIdx = content.indexOf('\n---', 3);
    if (endIdx !== -1) {
      const fm = content.slice(3, endIdx);
      bodyStart = endIdx + 4;

      const descMatch = fm.match(/^description:\s*(.+)$/m);
      if (descMatch?.[1]) {
        description = descMatch[1].trim().replace(/^["']|["']$/g, '');
      }
      if (/^type:\s*["']?moc["']?/m.test(fm)) {
        isMoc = true;
      }
      const statusMatch = fm.match(/^status:\s*["']?([A-Za-z0-9_-]+)["']?/m);
      if (statusMatch?.[1]) {
        status = statusMatch[1].toLowerCase();
      }
    }
  }

  const body = content.slice(bodyStart);
  const headingMatch = body.match(/^#\s+(.+)$/m);
  const title = headingMatch?.[1]?.trim() || '';

  return { description, isMoc, status, title };
}

function parseQueueJson(raw: string): {
  pipelinePending: number;
  maintenancePending: number;
  tasks: VaultQueueTask[];
} | null {
  try {
    const data = JSON.parse(raw) as { tasks?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
    const rawTasks = Array.isArray(data) ? data : Array.isArray(data?.tasks) ? data.tasks : [];
    const tasks: VaultQueueTask[] = [];
    let pipelinePending = 0;
    let maintenancePending = 0;

    for (const item of rawTasks) {
      const status = String(item.status ?? '');
      const currentPhase = String(item.current_phase ?? item.type ?? 'pending');
      if (status === 'done' || status === 'completed' || currentPhase === 'done') continue;
      const type = String(item.type ?? 'claim');
      if (type === 'maintenance') maintenancePending++;
      else pipelinePending++;

      tasks.push({
        id: String(item.id ?? `task-${tasks.length + 1}`),
        phase: currentPhase,
        target: String(item.target ?? item.file ?? item.id ?? 'Untitled'),
        batch: String(item.batch ?? ''),
        type,
      });
    }
    return { pipelinePending, maintenancePending, tasks };
  } catch {
    return null;
  }
}

function parseQueueYaml(raw: string): {
  pipelinePending: number;
  maintenancePending: number;
  tasks: VaultQueueTask[];
} {
  const blocks = raw.split(/\n\s*-\s+id:/).slice(1);
  const tasks: VaultQueueTask[] = [];
  let pipelinePending = 0;
  let maintenancePending = 0;

  for (const block of blocks) {
    if (/status:\s*(?:done|completed)/i.test(block) || /current_phase:\s*done/i.test(block)) {
      continue;
    }
    const idLine = block.split(/\r?\n/)[0]?.trim().replace(/^["']|["']$/g, '') || `task-${tasks.length + 1}`;
    const type = /type:\s*maintenance/i.test(block) ? 'maintenance' : 'claim';
    const phaseMatch = block.match(/current_phase:\s*["']?([^\s"'#\r\n]+)/i) ?? block.match(/type:\s*["']?([^\s"'#\r\n]+)/i);
    const targetMatch = block.match(/target:\s*["']?([^"'\r\n]+)/i) ?? block.match(/file:\s*["']?([^"'\r\n]+)/i);
    const batchMatch = block.match(/batch:\s*["']?([^"'\r\n]+)/i);

    if (type === 'maintenance') maintenancePending++;
    else pipelinePending++;

    tasks.push({
      id: idLine,
      phase: phaseMatch?.[1]?.trim() || 'pending',
      target: targetMatch?.[1]?.trim() || idLine,
      batch: batchMatch?.[1]?.trim() || '',
      type,
    });
  }

  return { pipelinePending, maintenancePending, tasks };
}

export async function resolveVaultPaths(host: HostClient): Promise<{
  isVault: boolean;
  notesDir: string;
  inboxDir: string;
  vocabulary: VaultVocabulary;
  obsThreshold: number;
  tensionThreshold: number;
}> {
  const vocabulary: VaultVocabulary = {
    note: 'note',
    topicMap: 'MOC',
    reduce: 'reduce',
    reflect: 'reflect',
    rethink: 'rethink',
    remember: 'remember',
  };

  const [markerRaw, opsConfigRaw, manifestRaw, derivationRaw] = await Promise.all([
    readOptionalFile(host, '.arscontexta'),
    readOptionalFile(host, 'ops/config.yaml'),
    readOptionalFile(host, 'ops/derivation-manifest.md'),
    readOptionalFile(host, 'ops/derivation.md'),
  ]);

  const isVault = markerRaw !== null || opsConfigRaw !== null || manifestRaw !== null || derivationRaw !== null;
  if (!isVault) {
    return {
      isVault: false,
      notesDir: 'notes',
      inboxDir: 'inbox',
      vocabulary,
      obsThreshold: 10,
      tensionThreshold: 5,
    };
  }

  let notesDir: string | null = null;
  let inboxDir: string | null = null;

  const manifestText = manifestRaw ?? derivationRaw;
  if (manifestText) {
    notesDir = extractManifestField(manifestText, 'notes_folder|notes_dir|notes');
    inboxDir = extractManifestField(manifestText, 'inbox_folder|inbox_dir|inbox');
    for (const key of ['note', 'reduce', 'reflect', 'rethink', 'remember'] as const) {
      const val = extractManifestField(manifestText, key);
      if (val) vocabulary[key] = val;
    }
    const topicMap = extractManifestField(manifestText, 'topic_map|moc');
    if (topicMap) vocabulary.topicMap = topicMap;
  }

  if (!notesDir) {
    notesDir = readScalarConfig(markerRaw, 'notes_dir') ?? readScalarConfig(opsConfigRaw, 'notes_dir');
  }
  if (!inboxDir) {
    inboxDir = readScalarConfig(markerRaw, 'inbox_dir') ?? readScalarConfig(opsConfigRaw, 'inbox_dir');
  }

  if (!notesDir) {
    const rootEntries = await listOptionalDir(host, '.');
    const dirSet = new Set(rootEntries.filter((e) => e.kind === 'directory').map((e) => e.name));
    notesDir = KNOWN_NOTES_DIRS.find((d) => dirSet.has(d)) ?? 'notes';
    if (!inboxDir) {
      inboxDir = KNOWN_INBOX_DIRS.find((d) => dirSet.has(d)) ?? 'inbox';
    }
  } else if (!inboxDir) {
    const rootEntries = await listOptionalDir(host, '.');
    const dirSet = new Set(rootEntries.filter((e) => e.kind === 'directory').map((e) => e.name));
    inboxDir = KNOWN_INBOX_DIRS.find((d) => dirSet.has(d)) ?? 'inbox';
  }

  const obsThreshold = Number.parseInt(
    readScalarConfig(markerRaw, 'obs_threshold') ?? readScalarConfig(opsConfigRaw, 'obs_threshold') ?? '10',
    10
  ) || 10;

  const tensionThreshold = Number.parseInt(
    readScalarConfig(markerRaw, 'tension_threshold') ?? readScalarConfig(opsConfigRaw, 'tension_threshold') ?? '5',
    10
  ) || 5;

  return {
    isVault: true,
    notesDir,
    inboxDir,
    vocabulary,
    obsThreshold,
    tensionThreshold,
  };
}

export async function inspectVault(host: HostClient): Promise<VaultSnapshot> {
  const { isVault, notesDir, inboxDir, vocabulary, obsThreshold, tensionThreshold } = await resolveVaultPaths(host);
  if (!isVault) {
    return {
      isVault: false,
      notesDir,
      inboxDir,
      vocabulary,
      notesCount: 0,
      mocsCount: 0,
      orphanCount: 0,
      inboxItems: [],
      queue: { pipelinePending: 0, maintenancePending: 0, tasks: [] },
      observations: { total: 0, pending: 0, items: [] },
      tensions: { total: 0, open: 0, items: [] },
      unprocessedSessions: 0,
      recentSessions: [],
      signals: [],
      notesIndex: [],
      lastHealthReport: null,
    };
  }

  const [
    noteEntries,
    inboxEntries,
    obsEntries,
    tensEntries,
    sessionEntries,
    healthEntries,
    queueJsonRaw,
    queueYamlNestedRaw,
    queueYamlRootRaw,
  ] = await Promise.all([
    listOptionalDir(host, notesDir),
    listOptionalDir(host, inboxDir),
    listOptionalDir(host, 'ops/observations'),
    listOptionalDir(host, 'ops/tensions'),
    listOptionalDir(host, 'ops/sessions'),
    listOptionalDir(host, 'ops/health'),
    readOptionalFile(host, 'ops/queue/queue.json'),
    readOptionalFile(host, 'ops/queue/queue.yaml'),
    readOptionalFile(host, 'ops/queue.yaml'),
  ]);

  // Inbox items
  const inboxItems: VaultFileEntry[] = inboxEntries
    .filter((e) => e.kind === 'file' && e.name.endsWith('.md') && e.name.toLowerCase() !== 'readme.md')
    .sort((a, b) => b.name.localeCompare(a.name))
    .map((e) => ({
      name: e.name,
      path: `${inboxDir}/${e.name}`,
      title: e.name.replace(/\.md$/i, ''),
    }));

  // Queue
  let queue = { pipelinePending: 0, maintenancePending: 0, tasks: [] as VaultQueueTask[] };
  if (queueJsonRaw) {
    queue = parseQueueJson(queueJsonRaw) ?? queue;
  } else if (queueYamlNestedRaw) {
    queue = parseQueueYaml(queueYamlNestedRaw);
  } else if (queueYamlRootRaw) {
    queue = parseQueueYaml(queueYamlRootRaw);
  }

  // Notes & MOCs
  const mdNoteEntries = noteEntries.filter(
    (e) => e.kind === 'file' && e.name.endsWith('.md') && e.name.toLowerCase() !== 'readme.md'
  );
  const notesToRead = mdNoteEntries.slice(0, MAX_NOTE_READS);
  const noteContents = await Promise.all(
    notesToRead.map(async (entry) => ({
      entry,
      content: await readOptionalFile(host, `${notesDir}/${entry.name}`),
    }))
  );

  const notesIndex: VaultNoteSummary[] = [];
  const incomingTargets = new Set<string>();
  const nonMocTitles: string[] = [];
  const linkRe = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
  let mocsCount = 0;

  for (const { entry, content } of noteContents) {
    const baseTitle = entry.name.replace(/\.md$/i, '');
    const filePath = `${notesDir}/${entry.name}`;
    if (!content) {
      notesIndex.push({ id: filePath, path: filePath, title: baseTitle, description: '', isMoc: false });
      nonMocTitles.push(baseTitle);
      continue;
    }

    const fm = parseFrontmatter(content);
    if (fm.isMoc) mocsCount++;
    else nonMocTitles.push(baseTitle);

    let match: RegExpExecArray | null;
    linkRe.lastIndex = 0;
    while ((match = linkRe.exec(content)) !== null) {
      const linked = match[1].trim().replace(/\.md$/i, '');
      const lastSegment = linked.split('/').pop() ?? linked;
      if (lastSegment) incomingTargets.add(lastSegment);
    }

    notesIndex.push({
      id: filePath,
      path: filePath,
      title: fm.title || baseTitle,
      description: fm.description,
      isMoc: fm.isMoc,
    });
  }

  notesIndex.sort((a, b) => {
    if (a.isMoc !== b.isMoc) return a.isMoc ? -1 : 1;
    return a.title.localeCompare(b.title);
  });

  const orphanCount =
    mdNoteEntries.length <= MAX_NOTE_READS
      ? nonMocTitles.filter((title) => !incomingTargets.has(title)).length
      : 0;
  const notesCount = Math.max(0, mdNoteEntries.length - mocsCount);

  // Observations
  const obsFiles = obsEntries
    .filter((e) => e.kind === 'file' && e.name.endsWith('.md') && e.name.toLowerCase() !== 'readme.md')
    .slice(0, MAX_OPS_READS);
  const obsContents = await Promise.all(
    obsFiles.map(async (e) => ({
      entry: e,
      content: await readOptionalFile(host, `ops/observations/${e.name}`),
    }))
  );
  const pendingObsItems: VaultFileEntry[] = [];
  for (const { entry, content } of obsContents) {
    const fm = content ? parseFrontmatter(content) : { status: '', title: '' };
    if (!['resolved', 'promoted', 'archived', 'dismissed'].includes(fm.status)) {
      pendingObsItems.push({
        name: entry.name,
        path: `ops/observations/${entry.name}`,
        title: fm.title || entry.name.replace(/\.md$/i, ''),
      });
    }
  }

  // Tensions
  const tensFiles = tensEntries
    .filter((e) => e.kind === 'file' && e.name.endsWith('.md') && e.name.toLowerCase() !== 'readme.md')
    .slice(0, MAX_OPS_READS);
  const tensContents = await Promise.all(
    tensFiles.map(async (e) => ({
      entry: e,
      content: await readOptionalFile(host, `ops/tensions/${e.name}`),
    }))
  );
  const openTensItems: VaultFileEntry[] = [];
  for (const { entry, content } of tensContents) {
    const fm = content ? parseFrontmatter(content) : { status: '', title: '' };
    if (!['resolved', 'archived', 'closed'].includes(fm.status)) {
      openTensItems.push({
        name: entry.name,
        path: `ops/tensions/${entry.name}`,
        title: fm.title || entry.name.replace(/\.md$/i, ''),
      });
    }
  }

  // Sessions
  const archivedSessionFiles = sessionEntries
    .filter((e) => e.kind === 'file' && e.name.endsWith('.json') && e.name !== 'current.json')
    .sort((a, b) => b.name.localeCompare(a.name));
  const recentSessionFiles = archivedSessionFiles.slice(0, 5);
  const recentSessions: VaultSessionSummary[] = [];
  for (const sf of recentSessionFiles) {
    const raw = await readOptionalFile(host, `ops/sessions/${sf.name}`);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      recentSessions.push({
        id: String(parsed.id ?? sf.name),
        started: String(parsed.startedIso ?? parsed.started ?? ''),
        ended: typeof parsed.ended === 'string' ? parsed.ended : undefined,
        status: String(parsed.status ?? 'completed'),
      });
    } catch {
      // Ignore malformed session json
    }
  }

  // Health reports
  const healthReports = healthEntries
    .filter((e) => e.kind === 'file' && e.name.endsWith('.md'))
    .sort((a, b) => b.name.localeCompare(a.name));
  const lastHealthReport = healthReports[0]
    ? { name: healthReports[0].name, path: `ops/health/${healthReports[0].name}` }
    : null;

  // Signals
  const signals: VaultSignal[] = [];
  if (pendingObsItems.length >= obsThreshold) {
    signals.push({
      id: 'observations',
      severity: 'warning',
      label: `${pendingObsItems.length} pending observations (threshold ${obsThreshold})`,
      command: `/${vocabulary.rethink}`,
      buttonLabel: `Run /${vocabulary.rethink}`,
    });
  }
  if (openTensItems.length >= tensionThreshold) {
    signals.push({
      id: 'tensions',
      severity: 'warning',
      label: `${openTensItems.length} unresolved tensions (threshold ${tensionThreshold})`,
      command: `/${vocabulary.rethink}`,
      buttonLabel: `Run /${vocabulary.rethink}`,
    });
  }
  if (archivedSessionFiles.length >= 5) {
    signals.push({
      id: 'sessions',
      severity: 'info',
      label: `${archivedSessionFiles.length} unprocessed sessions ready to mine`,
      command: `/${vocabulary.remember} --mine-sessions`,
      buttonLabel: 'Mine sessions',
    });
  }
  if (inboxItems.length >= 3) {
    signals.push({
      id: 'inbox',
      severity: 'info',
      label: `${inboxItems.length} items waiting in ${inboxDir}/`,
      command: `/pipeline`,
      buttonLabel: 'Process inbox',
    });
  }
  if (orphanCount > 0) {
    signals.push({
      id: 'orphans',
      severity: 'warning',
      label: `${orphanCount} orphan ${vocabulary.note}(s) without incoming links`,
      command: `/${vocabulary.reflect}`,
      buttonLabel: `Run /${vocabulary.reflect}`,
    });
  }

  return {
    isVault: true,
    notesDir,
    inboxDir,
    vocabulary,
    notesCount,
    mocsCount,
    orphanCount,
    inboxItems,
    queue,
    observations: {
      total: obsFiles.length,
      pending: pendingObsItems.length,
      items: pendingObsItems,
    },
    tensions: {
      total: tensFiles.length,
      open: openTensItems.length,
      items: openTensItems,
    },
    unprocessedSessions: archivedSessionFiles.length,
    recentSessions,
    signals,
    notesIndex,
    lastHealthReport,
  };
}

export function formatTimestampSlug(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

export async function captureToInbox(
  host: HostClient,
  inboxDir: string,
  text: string,
  meta: { source: string; sessionId?: string; messageId?: string; title?: string }
): Promise<{ path: string }> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Cannot capture empty text.');
  }
  const stamp = formatTimestampSlug();
  const baseName = `capture-${stamp}.md`;
  let targetPath = `${inboxDir}/${baseName}`;

  const existing = await pathExists(host, targetPath);
  if (existing) {
    targetPath = `${inboxDir}/capture-${stamp}-${Math.random().toString(36).slice(2, 6)}.md`;
  }

  const nowIso = new Date().toISOString();
  const firstLine = trimmed.split(/\r?\n/)[0]?.replace(/^#+\s*/, '').trim().slice(0, 80) || 'Captured item';
  const heading = meta.title?.trim() || firstLine;
  const safeDesc = heading.replace(/"/g, '\\"');

  const frontmatterLines = [
    '---',
    `description: "Captured from ${meta.source}: ${safeDesc}"`,
    `captured: "${nowIso}"`,
    `source: "${meta.source}"`,
  ];
  if (meta.sessionId) frontmatterLines.push(`session: "${meta.sessionId}"`);
  if (meta.messageId) frontmatterLines.push(`message: "${meta.messageId}"`);
  frontmatterLines.push('---', '');

  const content = `${frontmatterLines.join('\n')}# ${heading}\n\n${trimmed}\n`;
  await host.writeFile(targetPath, content);
  return { path: targetPath };
}

export function buildVaultItemUrl(itemPath: string): string {
  const normalized = itemPath.replace(/^\/+/, '');
  return `https://arscontexta.local/vault/${encodeURIComponent(normalized)}`;
}

export function buildNoteAttachRequest(note: VaultNoteSummary): AttachIssueRequest {
  const badge = note.isMoc ? '[MOC] ' : '';
  const summary = note.description ? `${note.description}\n\n` : '';
  return {
    providerId: 'arscontexta',
    id: note.path,
    title: `${badge}${note.title}`,
    url: buildVaultItemUrl(note.path),
    text: `Vault ${note.isMoc ? 'Map of Content' : 'note'} \`${note.path}\`:\n${summary}Read \`${note.path}\` for full context.`,
    data: {
      path: note.path,
      isMoc: note.isMoc,
      description: note.description,
    },
  };
}

export async function attachItemToChat(
  host: HostClient,
  request: AttachIssueRequest,
  successMessage?: string
): Promise<boolean> {
  try {
    await host.attach(request);
    await host.toast({
      kind: 'success',
      message: successMessage ?? `Attached ${request.title} to chat`,
    });
    return true;
  } catch (err) {
    const msg = err instanceof HostRequestError ? `${err.code}: ${err.message}` : String(err);
    await host.toast({
      kind: 'error',
      message: `Could not attach to chat (${msg})`,
    });
    return false;
  }
}

export interface CommandHint {
  id: string;
  command: string;
  title: string;
  whenToUse: string;
  whatItDoes: string;
}

export const COMMAND_HINTS: Record<string, CommandHint> = {
  setup: {
    id: 'setup',
    command: '/arscontexta:setup',
    title: 'Initialiser le vault',
    whenToUse: 'Quand le dossier ne contient pas encore de vault Ars Contexta.',
    whatItDoes: 'Derive ta structure, AGENTS.md, templates, skills et workflows par conversation.',
  },
  health: {
    id: 'health',
    command: '/arscontexta:health',
    title: 'Diagnostic de sante',
    whenToUse: 'Apres un lot de notes, avant /architect, ou si des liens/orphelins posent probleme.',
    whatItDoes: 'Verifie schemas, orphelins et liens casses; cree un rapport et des Todos de remediation.',
  },
  next: {
    id: 'next',
    command: '/next',
    title: 'Prochaine action',
    whenToUse: 'Quand tu te demandes quoi traiter en priorite dans le vault.',
    whatItDoes: 'Croise la pile humaine (ops/tasks.md), la queue et les signaux de maintenance.',
  },
  ralph: {
    id: 'ralph',
    command: '/ralph 5',
    title: 'Traiter la file (Ralph)',
    whenToUse: 'Quand ops/queue contient des taches en attente (create, reflect, reweave, verify).',
    whatItDoes: 'Execute chaque phase en contexte isole (Workflow arriere-plan ou sous-agents).',
  },
  pipeline: {
    id: 'pipeline',
    command: '/pipeline',
    title: 'Pipeline Inbox complet',
    whenToUse: 'Quand des captures ou sources attendent dans inbox/ pour etre digerees.',
    whatItDoes: 'Enchaine /seed, /reduce, traitement des claims et archivage du lot.',
  },
  rethink: {
    id: 'rethink',
    command: '/rethink',
    title: 'Trier observations & tensions',
    whenToUse: 'Quand les observations ou tensions depassent leur seuil.',
    whatItDoes: 'Aide a promouvoir, corriger la methodologie ou archiver les frictions accumulees.',
  },
  reflect: {
    id: 'reflect',
    command: '/reflect',
    title: 'Relier les notes orphelines',
    whenToUse: 'Quand des notes n ont aucun lien entrant ou manquent sur un MOC.',
    whatItDoes: 'Cherche des connexions conceptuelles et met a jour les Topics Maps.',
  },
  remember: {
    id: 'remember',
    command: '/remember --mine-sessions',
    title: 'Extraire les apprentissages',
    whenToUse: 'Quand plusieurs sessions capturees attendent dans ops/sessions/.',
    whatItDoes: 'Mine les sessions recentes pour en tirer des observations ou regles methodologiques.',
  },
  openPanel: {
    id: 'openPanel',
    command: 'Ars Contexta Panel',
    title: 'Ouvrir le panneau Vault',
    whenToUse: 'Pour explorer les MOCs/notes, la queue detaillee ou capturer dans inbox/.',
    whatItDoes: 'Ouvre le panneau lateral Ars Contexta sur les 3 onglets.',
  },
};

export function resolveCommandHint(command: string, vocabulary?: Partial<VaultVocabulary>): CommandHint | null {
  const normalized = command.trim().toLowerCase();
  if (normalized.startsWith('/arscontexta:setup') || normalized === '/setup') return COMMAND_HINTS.setup;
  if (normalized.startsWith('/arscontexta:health') || normalized === '/health') return COMMAND_HINTS.health;
  if (normalized.startsWith('/next')) return COMMAND_HINTS.next;
  if (normalized.startsWith('/ralph')) return COMMAND_HINTS.ralph;
  if (normalized.startsWith('/pipeline')) return COMMAND_HINTS.pipeline;
  if (normalized === 'open-panel') return COMMAND_HINTS.openPanel;

  const rethinkCmd = `/${(vocabulary?.rethink || 'rethink').toLowerCase()}`;
  const reflectCmd = `/${(vocabulary?.reflect || 'reflect').toLowerCase()}`;
  const rememberCmd = `/${(vocabulary?.remember || 'remember').toLowerCase()}`;

  if (normalized.startsWith('/rethink') || normalized.startsWith(rethinkCmd)) {
    return { ...COMMAND_HINTS.rethink, command };
  }
  if (normalized.startsWith('/reflect') || normalized.startsWith(reflectCmd)) {
    return { ...COMMAND_HINTS.reflect, command };
  }
  if (normalized.startsWith('/remember') || normalized.startsWith(rememberCmd)) {
    return { ...COMMAND_HINTS.remember, command };
  }
  return null;
}

export function attachCommandTooltip(
  slot: HTMLElement,
  host: HostClient,
  hint: CommandHint | null,
  options: { canPopover: boolean; side?: 'left' | 'right' | 'top' | 'bottom' }
): Handle | null {
  if (!hint) return null;
  const target = slot.querySelector<HTMLElement>('button') ?? slot;
  target.title = `${hint.title} (${hint.command})\nA utiliser quand : ${hint.whenToUse}\nAction : ${hint.whatItDoes}`;

  if (!options.canPopover) {
    return null;
  }

  return mountPopoverAnchor(target, {
    host,
    width: 280,
    height: 132,
    side: options.side ?? 'left',
    label: `${hint.title} — ${hint.command}`,
    getData: () => ({
      kind: 'command-hint',
      command: hint.command,
      title: hint.title,
      whenToUse: hint.whenToUse,
      whatItDoes: hint.whatItDoes,
    }),
  });
}

export function renderCommandPopover(host: HostClient, root: HTMLElement, rawData: JsonValue | undefined): void {
  root.replaceChildren();
  const data =
    rawData && typeof rawData === 'object' && !Array.isArray(rawData)
      ? (rawData as Record<string, unknown>)
      : null;

  const title = typeof data?.title === 'string' ? data.title : 'Ars Contexta';
  const command = typeof data?.command === 'string' ? data.command : '';
  const whenToUse = typeof data?.whenToUse === 'string' ? data.whenToUse : '';
  const whatItDoes = typeof data?.whatItDoes === 'string' ? data.whatItDoes : '';

  const card = document.createElement('div');
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.gap = '6px';
  card.style.padding = '10px 12px';

  const topRow = document.createElement('div');
  topRow.style.display = 'flex';
  topRow.style.alignItems = 'center';
  topRow.style.justifyContent = 'space-between';
  topRow.style.gap = '8px';

  const heading = document.createElement('strong');
  heading.style.fontSize = '0.85rem';
  heading.textContent = title;
  topRow.append(heading);

  if (command) {
    const badgeWrap = document.createElement('div');
    mountBadge(badgeWrap, { label: command, tone: 'primary' });
    topRow.append(badgeWrap);
  }
  card.append(topRow);

  if (whenToUse) {
    const whenEl = document.createElement('div');
    whenEl.style.fontSize = '0.78rem';
    whenEl.style.lineHeight = '1.35';
    const label = document.createElement('strong');
    label.textContent = 'A utiliser quand : ';
    whenEl.append(label, document.createTextNode(whenToUse));
    card.append(whenEl);
  }

  if (whatItDoes) {
    const whatEl = document.createElement('div');
    whatEl.style.fontSize = '0.76rem';
    whatEl.style.lineHeight = '1.35';
    whatEl.style.color = 'var(--surface-muted-foreground, var(--oc-muted, gray))';
    whatEl.textContent = whatItDoes;
    card.append(whatEl);
  }

  root.append(card);
  const measured = Math.ceil(root.getBoundingClientRect().height);
  if (measured > 0) {
    void host.setHeight(Math.max(64, Math.min(240, measured))).catch(() => {});
  }
}

export async function runVaultCommand(host: HostClient, command: string, fallbackNotice?: string): Promise<void> {
  try {
    await host.prompt({ text: command, send: true });
  } catch (err) {
    if (err instanceof HostRequestError && (err.code === 'SESSION_BUSY' || err.code === 'NO_SESSION')) {
      await host.compose({ text: command, mode: 'replace' });
      await host.toast({
        kind: 'info',
        message: fallbackNotice ?? `Staged "${command}" in the chat input.`,
      });
      return;
    }
    throw err;
  }
}
