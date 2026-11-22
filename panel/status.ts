import { connectHost } from '@openchamber/sdk';
import {
  applyHostReady,
  mountBadge,
  mountBanner,
  mountButton,
  mountEmpty,
  mountProgress,
  type Handle,
} from '@openchamber/sdk/ui';
import { inspectVault, runVaultCommand, type VaultSnapshot } from './vault-client';

const host = connectHost();
const root = document.querySelector<HTMLElement>('#root')!;

let mounted = false;
let currentDirectory: string | null = null;
let loadGeneration = 0;
let handles: Handle[] = [];

function clearUI(): void {
  for (const h of handles) h.dispose();
  handles = [];
  root.replaceChildren();
}

function reportHeight(): void {
  const height = Math.ceil(root.getBoundingClientRect().height);
  if (height > 0) {
    void host.setHeight(Math.max(48, Math.min(480, height))).catch(() => {});
  }
}

function renderSnapshot(snap: VaultSnapshot | null): void {
  clearUI();

  if (!currentDirectory || !snap) {
    handles.push(
      mountEmpty(root, {
        title: 'No project open',
        body: 'Open a folder to check vault status.',
      })
    );
    reportHeight();
    return;
  }

  if (!snap.isVault) {
    handles.push(
      mountEmpty(root, {
        title: 'No Ars Contexta vault here',
        body: 'Initialize a persistent knowledge system in this project.',
        action: {
          label: 'Setup Vault',
          onClick: () => {
            void runVaultCommand(host, '/arscontexta:setup');
          },
        },
      })
    );
    reportHeight();
    return;
  }

  const topRow = document.createElement('div');
  topRow.className = 'ac-status-row';
  const badgesWrap = document.createElement('div');
  badgesWrap.className = 'ac-status-badges';
  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'ac-status-actions';
  topRow.append(badgesWrap, actionsWrap);
  root.append(topRow);

  const warnCount = snap.signals.filter((s) => s.severity === 'warning').length;
  handles.push(
    mountBadge(badgesWrap, {
      label: warnCount > 0 ? `${warnCount} signal${warnCount > 1 ? 's' : ''}` : 'Healthy',
      tone: warnCount > 0 ? 'warning' : 'success',
    }),
    mountBadge(badgesWrap, {
      label: `${snap.notesCount} ${snap.vocabulary.note}s`,
      tone: 'neutral',
    }),
    mountBadge(badgesWrap, {
      label: `${snap.inboxItems.length} inbox`,
      tone: snap.inboxItems.length > 0 ? 'info' : 'neutral',
    }),
    mountBadge(badgesWrap, {
      label: `${snap.queue.pipelinePending} queue`,
      tone: snap.queue.pipelinePending > 0 ? 'primary' : 'neutral',
    })
  );

  // Contextual quick buttons (max 2)
  if (snap.inboxItems.length > 0) {
    const btnSlot = document.createElement('div');
    actionsWrap.append(btnSlot);
    handles.push(
      mountButton(btnSlot, {
        label: 'Process Inbox',
        variant: 'outline',
        size: 'xs',
        onClick: () => {
          void runVaultCommand(host, '/pipeline');
        },
      })
    );
  } else if (snap.queue.pipelinePending > 0) {
    const btnSlot = document.createElement('div');
    actionsWrap.append(btnSlot);
    handles.push(
      mountButton(btnSlot, {
        label: 'Run Queue',
        variant: 'outline',
        size: 'xs',
        onClick: () => {
          void runVaultCommand(host, '/ralph 5');
        },
      })
    );
  }

  const openPanelSlot = document.createElement('div');
  actionsWrap.append(openPanelSlot);
  handles.push(
    mountButton(openPanelSlot, {
      label: 'Open Vault',
      variant: 'ghost',
      size: 'xs',
      onClick: () => {
        void host.openSurface('plugin:arscontexta').catch(() => {});
      },
    })
  );

  if (snap.signals.length > 0) {
    const topSignal = snap.signals[0];
    const bannerSlot = document.createElement('div');
    root.append(bannerSlot);
    handles.push(
      mountBanner(bannerSlot, {
        tone: topSignal.severity === 'warning' ? 'warning' : 'info',
        title: topSignal.label,
        action: {
          label: topSignal.buttonLabel,
          onClick: () => {
            void runVaultCommand(host, topSignal.command);
          },
        },
      })
    );
  } else if (snap.notesCount > 0) {
    const connectedCount = Math.max(0, snap.notesCount - snap.orphanCount);
    const pct = Math.round((connectedCount / snap.notesCount) * 100);
    const progSlot = document.createElement('div');
    root.append(progSlot);
    handles.push(
      mountProgress(progSlot, {
        value: pct,
        tone: pct >= 90 ? 'success' : 'info',
        label: `Graph connectivity: ${connectedCount}/${snap.notesCount} linked (${pct}%)`,
      })
    );
  }

  reportHeight();
}

async function refreshStatus(): Promise<void> {
  const gen = ++loadGeneration;
  if (!currentDirectory) {
    renderSnapshot(null);
    return;
  }
  try {
    const snap = await inspectVault(host);
    if (gen !== loadGeneration) return;
    renderSnapshot(snap);
  } catch {
    if (gen !== loadGeneration) return;
    renderSnapshot(null);
  }
}

const observer = new ResizeObserver(() => reportHeight());
observer.observe(root);

host.onReady((ctx) => {
  applyHostReady(ctx, document.documentElement);
  if (!mounted) {
    mounted = true;
    currentDirectory = ctx.directory;
    void refreshStatus();
  } else if (ctx.directory !== currentDirectory) {
    currentDirectory = ctx.directory;
    void refreshStatus();
  }
});

host.onDirectory((directory) => {
  if (directory === currentDirectory) return;
  currentDirectory = directory;
  if (mounted) void refreshStatus();
});

host.onSessionLifecycle((event) => {
  if (event.phase === 'completed' && mounted && currentDirectory) {
    void refreshStatus();
  }
});
