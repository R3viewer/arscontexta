import { connectHost, HostRequestError } from '@openchamber/sdk';
import {
  applyHostReady,
  mountBadge,
  mountBanner,
  mountButton,
  mountEmpty,
  mountList,
  mountSearchField,
  mountSeparator,
  mountSpinner,
  mountTabs,
  mountTextField,
  type Handle,
} from '@openchamber/sdk/ui';
import {
  buildNoteAttachRequest,
  captureToInbox,
  inspectVault,
  runVaultCommand,
  type VaultSnapshot,
} from './vault-client';

const host = connectHost();
const root = document.querySelector<HTMLElement>('#root')!;

type TabId = 'pulse' | 'maps' | 'inbox';

let mounted = false;
let currentDirectory: string | null = null;
let currentSnapshot: VaultSnapshot | null = null;
let activeTab: TabId = 'pulse';
let mapFilter: 'all' | 'mocs' | 'notes' = 'all';
let searchQuery = '';
let captureDraft = '';
let isCapturing = false;
let loadGeneration = 0;

// Persistent UI containers
const headerRow = document.createElement('div');
headerRow.className = 'ac-row';
const headerLeft = document.createElement('div');
headerLeft.className = 'ac-badges';
const headerRight = document.createElement('div');
headerRight.className = 'ac-actions-wrap';
headerRow.append(headerLeft, headerRight);

const tabsSlot = document.createElement('div');
const loadingSlot = document.createElement('div');
const emptySlot = document.createElement('div');

const pulseContainer = document.createElement('div');
pulseContainer.className = 'ac-stack';

const mapsContainer = document.createElement('div');
mapsContainer.className = 'ac-stack ac-hidden';

const inboxContainer = document.createElement('div');
inboxContainer.className = 'ac-stack ac-hidden';

// Persistent sub-handles
let tabsHandle: ReturnType<typeof mountTabs> | null = null;
let spinnerHandle: Handle | null = null;
let emptyHandle: Handle | null = null;
let transientHandles: Handle[] = [];

// Maps controls (mounted once inside mapsContainer)
const mapsSearchSlot = document.createElement('div');
const mapsFilterRow = document.createElement('div');
mapsFilterRow.className = 'ac-actions-wrap';
const mapsListSlot = document.createElement('div');
mapsContainer.append(mapsSearchSlot, mapsFilterRow, mapsListSlot);

let mapsSearchHandle: ReturnType<typeof mountSearchField> | null = null;
let mapsFilterTabsHandle: ReturnType<typeof mountTabs> | null = null;
let mapsListHandle: ReturnType<typeof mountList> | null = null;

// Inbox controls (mounted once inside inboxContainer so draft persists)
const captureCard = document.createElement('div');
captureCard.className = 'ac-card';
const captureFieldSlot = document.createElement('div');
const captureBtnRow = document.createElement('div');
captureBtnRow.className = 'ac-row';
const captureHint = document.createElement('span');
captureHint.className = 'ac-muted';
captureHint.textContent = 'Saves directly to vault inbox without LLM tokens.';
const captureBtnSlot = document.createElement('div');
captureBtnRow.append(captureHint, captureBtnSlot);
captureCard.append(captureFieldSlot, captureBtnRow);

const inboxBodySlot = document.createElement('div');
inboxBodySlot.className = 'ac-stack';
inboxContainer.append(captureCard, inboxBodySlot);

let captureFieldHandle: ReturnType<typeof mountTextField> | null = null;
let captureBtnHandle: ReturnType<typeof mountButton> | null = null;
let inboxTransientHandles: Handle[] = [];

function clearHandles(handles: Handle[], container?: HTMLElement): void {
  for (const h of handles) h.dispose();
  handles.length = 0;
  if (container) container.replaceChildren();
}

function updateTabVisibility(): void {
  const showTabs = Boolean(currentSnapshot?.isVault);
  tabsSlot.classList.toggle('ac-hidden', !showTabs);
  pulseContainer.classList.toggle('ac-hidden', !showTabs || activeTab !== 'pulse');
  mapsContainer.classList.toggle('ac-hidden', !showTabs || activeTab !== 'maps');
  inboxContainer.classList.toggle('ac-hidden', !showTabs || activeTab !== 'inbox');
}

function renderMapsList(): void {
  if (!currentSnapshot || !mapsListHandle) return;
  const q = searchQuery.trim().toLowerCase();
  const filtered = currentSnapshot.notesIndex.filter((note) => {
    if (mapFilter === 'mocs' && !note.isMoc) return false;
    if (mapFilter === 'notes' && note.isMoc) return false;
    if (!q) return true;
    return (
      note.title.toLowerCase().includes(q) ||
      note.description.toLowerCase().includes(q) ||
      note.path.toLowerCase().includes(q)
    );
  });

  mapsListHandle.update({
    items: filtered.slice(0, 120).map((note) => ({
      id: note.id,
      leading: note.isMoc ? 'MOC' : 'Note',
      title: note.title,
      subtitle: note.description || note.path,
      meta: note.path,
    })),
    emptyText: q ? 'No matching notes or MOCs.' : `No files in ${currentSnapshot.notesDir}/ yet.`,
  });
}

function renderPulse(snap: VaultSnapshot): void {
  clearHandles(transientHandles, pulseContainer);

  // Overview stats card
  const statsCard = document.createElement('div');
  statsCard.className = 'ac-card';
  const statsTitle = document.createElement('div');
  statsTitle.className = 'ac-section-title';
  statsTitle.textContent = 'Vault Overview';
  const statsBadges = document.createElement('div');
  statsBadges.className = 'ac-badges';

  transientHandles.push(
    mountBadge(statsBadges, { label: `${snap.notesCount} ${snap.vocabulary.note}s`, tone: 'neutral' }),
    mountBadge(statsBadges, { label: `${snap.mocsCount} ${snap.vocabulary.topicMap}s`, tone: 'primary' }),
    mountBadge(statsBadges, {
      label: `${snap.inboxItems.length} inbox`,
      tone: snap.inboxItems.length > 0 ? 'info' : 'neutral',
    }),
    mountBadge(statsBadges, {
      label: `${snap.queue.pipelinePending} queued`,
      tone: snap.queue.pipelinePending > 0 ? 'info' : 'neutral',
    })
  );

  const actionRow = document.createElement('div');
  actionRow.className = 'ac-actions-wrap';
  const healthSlot = document.createElement('div');
  const nextSlot = document.createElement('div');
  const ralphSlot = document.createElement('div');
  actionRow.append(healthSlot, nextSlot, ralphSlot);

  transientHandles.push(
    mountButton(healthSlot, {
      label: 'Health',
      variant: 'outline',
      size: 'sm',
      onClick: () => {
        void runVaultCommand(host, '/arscontexta:health');
      },
    }),
    mountButton(nextSlot, {
      label: 'Next (/next)',
      variant: 'outline',
      size: 'sm',
      onClick: () => {
        void runVaultCommand(host, '/next');
      },
    })
  );

  if (snap.queue.pipelinePending > 0 || snap.queue.maintenancePending > 0) {
    transientHandles.push(
      mountButton(ralphSlot, {
        label: `Process Queue (${snap.queue.pipelinePending + snap.queue.maintenancePending})`,
        variant: 'default',
        size: 'sm',
        onClick: () => {
          void runVaultCommand(host, '/ralph 5');
        },
      })
    );
  } else if (snap.inboxItems.length > 0) {
    transientHandles.push(
      mountButton(ralphSlot, {
        label: `Process Inbox (${snap.inboxItems.length})`,
        variant: 'default',
        size: 'sm',
        onClick: () => {
          void runVaultCommand(host, '/pipeline');
        },
      })
    );
  }

  statsCard.append(statsTitle, statsBadges, actionRow);
  pulseContainer.append(statsCard);

  // Maintenance signals
  if (snap.signals.length === 0) {
    const okSlot = document.createElement('div');
    pulseContainer.append(okSlot);
    transientHandles.push(
      mountBanner(okSlot, {
        tone: 'success',
        title: 'Vault is healthy',
        body: 'All maintenance signals are within thresholds.',
      })
    );
  } else {
    for (const sig of snap.signals) {
      const sigSlot = document.createElement('div');
      pulseContainer.append(sigSlot);
      transientHandles.push(
        mountBanner(sigSlot, {
          tone: sig.severity === 'warning' ? 'warning' : 'info',
          title: sig.label,
          action: {
            label: sig.buttonLabel,
            onClick: () => {
              void runVaultCommand(host, sig.command);
            },
          },
        })
      );
    }
  }

  // Queue tasks
  if (snap.queue.tasks.length > 0) {
    const sepSlot = document.createElement('div');
    const qListSlot = document.createElement('div');
    pulseContainer.append(sepSlot, qListSlot);
    transientHandles.push(
      mountSeparator(sepSlot, { label: 'Pending Pipeline Queue' }),
      mountList(qListSlot, {
        items: snap.queue.tasks.slice(0, 12).map((t) => ({
          id: t.id,
          leading: t.phase,
          title: t.target,
          subtitle: t.batch ? `Batch: ${t.batch}` : undefined,
        })),
        onSelect: (id) => {
          const task = snap.queue.tasks.find((item) => item.id === id);
          if (task) {
            void host.compose({ text: `/ralph 1 --type ${task.phase}`, mode: 'replace' });
            void host.toast({ kind: 'info', message: `Staged /ralph for ${task.target}` });
          }
        },
      })
    );
  }

  // Recent sessions & health report
  if (snap.recentSessions.length > 0 || snap.lastHealthReport) {
    const sepSlot = document.createElement('div');
    pulseContainer.append(sepSlot);
    transientHandles.push(mountSeparator(sepSlot, { label: 'Recent Activity' }));

    if (snap.lastHealthReport) {
      const reportSlot = document.createElement('div');
      pulseContainer.append(reportSlot);
      transientHandles.push(
        mountButton(reportSlot, {
          label: `Attach latest report (${snap.lastHealthReport.name})`,
          variant: 'ghost',
          size: 'sm',
          onClick: () => {
            const report = snap.lastHealthReport;
            if (!report) return;
            void host.attach({
              providerId: 'arscontexta',
              id: report.path,
              title: `Health Report: ${report.name}`,
              url: `vault://${report.path}`,
              text: `Read \`${report.path}\` for the latest Ars Contexta health diagnostics.`,
            });
          },
        })
      );
    }

    if (snap.recentSessions.length > 0) {
      const sesSlot = document.createElement('div');
      pulseContainer.append(sesSlot);
      transientHandles.push(
        mountList(sesSlot, {
          items: snap.recentSessions.map((s) => ({
            id: s.id,
            leading: s.status,
            title: s.id,
            subtitle: s.ended ? `Ended ${s.ended}` : `Started ${s.started}`,
          })),
          onSelect: () => {
            void runVaultCommand(host, `/${snap.vocabulary.remember} --mine-sessions`);
          },
        })
      );
    }
  }
}

function renderInboxTab(snap: VaultSnapshot): void {
  clearHandles(inboxTransientHandles, inboxBodySlot);
  captureHint.textContent = `Saves directly to ${snap.inboxDir}/ without LLM tokens.`;

  // Inbox section
  const inboxSep = document.createElement('div');
  const inboxListSlot = document.createElement('div');
  inboxBodySlot.append(inboxSep, inboxListSlot);
  inboxTransientHandles.push(
    mountSeparator(inboxSep, { label: `${snap.inboxDir}/ (${snap.inboxItems.length})` }),
    mountList(inboxListSlot, {
      items: snap.inboxItems.slice(0, 30).map((item) => ({
        id: item.path,
        leading: 'Inbox',
        title: item.title,
        subtitle: `Click to stage /pipeline ${item.path}`,
      })),
      emptyText: `${snap.inboxDir}/ is clear.`,
      onSelect: (filePath) => {
        void runVaultCommand(host, `/pipeline ${filePath}`);
      },
    })
  );

  // Tensions & Observations
  if (snap.tensions.items.length > 0 || snap.observations.items.length > 0) {
    const opsSep = document.createElement('div');
    const opsActions = document.createElement('div');
    opsActions.className = 'ac-row';
    const opsListSlot = document.createElement('div');
    inboxBodySlot.append(opsSep, opsActions, opsListSlot);

    const combined = [
      ...snap.tensions.items.map((i) => ({ ...i, kind: 'Tension' })),
      ...snap.observations.items.map((i) => ({ ...i, kind: 'Observation' })),
    ];

    const rethinkBtnSlot = document.createElement('div');
    opsActions.append(rethinkBtnSlot);

    inboxTransientHandles.push(
      mountSeparator(opsSep, {
        label: `Tensions (${snap.tensions.open}) & Observations (${snap.observations.pending})`,
      }),
      mountButton(rethinkBtnSlot, {
        label: `Triage with /${snap.vocabulary.rethink}`,
        variant: 'outline',
        size: 'sm',
        onClick: () => {
          void runVaultCommand(host, `/${snap.vocabulary.rethink}`);
        },
      }),
      mountList(opsListSlot, {
        items: combined.slice(0, 30).map((item) => ({
          id: item.path,
          leading: item.kind,
          title: item.title,
          subtitle: item.path,
        })),
        onSelect: (itemPath) => {
          const item = combined.find((c) => c.path === itemPath);
          if (!item) return;
          void host.attach({
            providerId: 'arscontexta',
            id: item.path,
            title: `[${item.kind}] ${item.title}`,
            url: `vault://${item.path}`,
            text: `Read \`${item.path}\` (${item.kind}) and help resolve or promote it.`,
          });
        },
      })
    );
  }
}

function renderHeader(snap: VaultSnapshot | null): void {
  headerLeft.replaceChildren();
  headerRight.replaceChildren();
  // Remove old header handles tracked separately? Mount fresh and track in headerHandles
  for (const h of headerHandles) h.dispose();
  headerHandles.length = 0;

  if (!snap) return;

  if (!snap.isVault) {
    headerHandles.push(mountBadge(headerLeft, { label: 'No vault', tone: 'neutral' }));
  } else {
    const warnCount = snap.signals.filter((s) => s.severity === 'warning').length;
    headerHandles.push(
      mountBadge(headerLeft, {
        label: warnCount > 0 ? `${warnCount} warning${warnCount > 1 ? 's' : ''}` : 'Vault active',
        tone: warnCount > 0 ? 'warning' : 'success',
      })
    );
  }

  const refreshSlot = document.createElement('div');
  headerRight.append(refreshSlot);
  headerHandles.push(
    mountButton(refreshSlot, {
      label: 'Refresh',
      variant: 'ghost',
      size: 'xs',
      onClick: () => {
        void refreshVault();
      },
    })
  );
}

const headerHandles: Handle[] = [];

async function refreshVault(): Promise<void> {
  const gen = ++loadGeneration;
  if (!currentDirectory) {
    currentSnapshot = null;
    clearHandles(transientHandles, pulseContainer);
    clearHandles(inboxTransientHandles, inboxBodySlot);
    emptyHandle?.dispose();
    emptyHandle = mountEmpty(emptySlot, {
      title: 'No project open',
      body: 'Open a folder in OpenChamber to inspect or initialize an Ars Contexta vault.',
    });
    renderHeader(null);
    updateTabVisibility();
    void host.setBadge(null).catch(() => {});
    return;
  }

  emptyHandle?.dispose();
  emptyHandle = null;
  spinnerHandle?.dispose();
  spinnerHandle = mountSpinner(loadingSlot, { size: 'sm', label: 'Reading vault...' });

  try {
    const snap = await inspectVault(host);
    if (gen !== loadGeneration) return;
    spinnerHandle?.dispose();
    spinnerHandle = null;
    currentSnapshot = snap;

    renderHeader(snap);

    if (!snap.isVault) {
      updateTabVisibility();
      emptyHandle = mountEmpty(emptySlot, {
        title: 'Not an Ars Contexta vault yet',
        body: 'Derive a domain-native knowledge system for this folder with a short conversation.',
        action: {
          label: 'Setup Vault (/arscontexta:setup)',
          onClick: () => {
            void runVaultCommand(host, '/arscontexta:setup');
          },
        },
      });
      void host.setBadge(null).catch(() => {});
      return;
    }

    tabsHandle?.update({
      items: [
        { id: 'pulse', label: 'Pulse', count: snap.signals.length || undefined },
        { id: 'maps', label: 'Maps & Notes', count: snap.notesIndex.length },
        {
          id: 'inbox',
          label: 'Inbox',
          count: snap.inboxItems.length + snap.tensions.open + snap.observations.pending || undefined,
        },
      ],
      activeId: activeTab,
    });

    updateTabVisibility();
    renderPulse(snap);
    renderMapsList();
    renderInboxTab(snap);

    const attentionCount = snap.signals.length;
    void host.setBadge(attentionCount > 0 ? attentionCount : null).catch(() => {});
  } catch (err) {
    if (gen !== loadGeneration) return;
    spinnerHandle?.dispose();
    spinnerHandle = null;
    const message = err instanceof HostRequestError ? `${err.code}: ${err.message}` : String(err);
    clearHandles(transientHandles, pulseContainer);
    updateTabVisibility();
    emptyHandle = mountEmpty(emptySlot, {
      title: 'Unable to read vault',
      body: message,
      action: {
        label: 'Retry',
        onClick: () => {
          void refreshVault();
        },
      },
    });
  }
}

function mountOnce(): void {
  root.append(headerRow, tabsSlot, loadingSlot, emptySlot, pulseContainer, mapsContainer, inboxContainer);

  tabsHandle = mountTabs(tabsSlot, {
    items: [
      { id: 'pulse', label: 'Pulse' },
      { id: 'maps', label: 'Maps & Notes' },
      { id: 'inbox', label: 'Inbox' },
    ],
    activeId: activeTab,
    onChange: (next) => {
      activeTab = next as TabId;
      tabsHandle?.update({ activeId: activeTab });
      updateTabVisibility();
    },
  });

  mapsSearchHandle = mountSearchField(mapsSearchSlot, {
    value: searchQuery,
    placeholder: 'Search notes, MOCs, descriptions...',
    onChange: (next) => {
      searchQuery = next;
      mapsSearchHandle?.update({ value: next });
      renderMapsList();
    },
  });

  mapsFilterTabsHandle = mountTabs(mapsFilterRow, {
    items: [
      { id: 'all', label: 'All' },
      { id: 'mocs', label: 'MOCs' },
      { id: 'notes', label: 'Notes' },
    ],
    activeId: mapFilter,
    onChange: (next) => {
      mapFilter = next as 'all' | 'mocs' | 'notes';
      mapsFilterTabsHandle?.update({ activeId: mapFilter });
      renderMapsList();
    },
  });

  mapsListHandle = mountList(mapsListSlot, {
    items: [],
    emptyText: 'No notes found.',
    onSelect: (id) => {
      const note = currentSnapshot?.notesIndex.find((n) => n.id === id);
      if (!note) return;
      void host.attach(buildNoteAttachRequest(note));
      void host.toast({ kind: 'success', message: `Attached ${note.title} to chat` });
    },
  });

  captureFieldHandle = mountTextField(captureFieldSlot, {
    label: 'Quick Capture to Inbox',
    value: captureDraft,
    multiline: true,
    rows: 3,
    placeholder: 'Jot down an idea, excerpt, URL, or observation...',
    onChange: (next) => {
      captureDraft = next;
      captureFieldHandle?.update({ value: next });
    },
  });

  captureBtnHandle = mountButton(captureBtnSlot, {
    label: 'Save to Inbox',
    variant: 'default',
    size: 'sm',
    onClick: () => {
      if (isCapturing || !currentSnapshot?.isVault) return;
      if (!captureDraft.trim()) {
        void host.toast({ kind: 'error', message: 'Enter some text before saving to inbox.' });
        return;
      }
      isCapturing = true;
      captureBtnHandle?.update({ loading: true, disabled: true });
      void captureToInbox(host, currentSnapshot.inboxDir, captureDraft, { source: 'quick-capture' })
        .then(async ({ path }) => {
          captureDraft = '';
          captureFieldHandle?.update({ value: '' });
          await host.toast({ kind: 'success', message: `Saved to ${path}` });
          await refreshVault();
        })
        .catch(async (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          await host.toast({ kind: 'error', message: msg });
        })
        .finally(() => {
          isCapturing = false;
          captureBtnHandle?.update({ loading: false, disabled: false });
        });
    },
  });

  updateTabVisibility();
}

host.onReady((ctx) => {
  applyHostReady(ctx, document.documentElement);
  if (!mounted) {
    mounted = true;
    currentDirectory = ctx.directory;
    mountOnce();
    void refreshVault();
  } else if (ctx.directory !== currentDirectory) {
    currentDirectory = ctx.directory;
    void refreshVault();
  }
});

host.onDirectory((directory) => {
  if (directory === currentDirectory) return;
  currentDirectory = directory;
  if (mounted) {
    void refreshVault();
  }
});

host.onSessionLifecycle((event) => {
  if (event.phase === 'completed' && mounted && currentDirectory) {
    void refreshVault();
  }
});
